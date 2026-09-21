import { useEffect, useRef } from 'react'
import type { Transaction } from 'prosemirror-state'
import { EditorModeEnum } from '../../types'
import type { AppSettings, EditorMode } from '../../types'
import type { TiptapEditor } from '../../types/editor'
import { runAiCompletion } from '../../utils/aiAssistant'
import {
  GHOST_TEXT_ACCEPT_COOLDOWN_MS,
  GHOST_TEXT_IDLE_DELAY_MS,
  shouldRequestGhostText,
  takeGhostTextContext,
} from '../../utils/aiGhostText'
import { aiGhostTextKey, applyAiGhostText, readAiGhostText } from './aiGhostTextExtension'

interface UseAiGhostTextOptions {
  editor: TiptapEditor | null
  editorMode: EditorMode
  settings: AppSettings
  language: string
}

/**
 * Tab 半自动续写：停止输入后请求一条灰色续写建议，Tab 接受、Esc 拒绝。
 * 只在实时编辑模式下生效，源码/分栏/阅读模式没有可供渲染行内建议的文档结构。
 */
export function useAiGhostText({ editor, editorMode, settings, language }: UseAiGhostTextOptions) {
  const enabled = Boolean(settings.aiEnabled && settings.aiGhostTextEnabled)
    && editorMode === EditorModeEnum.Live
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const languageRef = useRef(language)
  languageRef.current = language

  useEffect(() => {
    if (!editor || !enabled) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let requestId = 0
    let suppressUntil = 0

    const clearSuggestion = () => {
      requestId += 1
      if (!readAiGhostText(editor.state)) return
      editor.view.dispatch(applyAiGhostText(editor.state.tr, null))
    }

    const cancelTimer = () => {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
    }

    const schedule = () => {
      cancelTimer()
      timer = setTimeout(() => {
        timer = null
        void request()
      }, GHOST_TEXT_IDLE_DELAY_MS)
    }

    const collectContext = (): { from: number; context: string } | null => {
      const state = editor.state
      const { selection } = state
      if (!selection.empty || editor.view.composing) return null
      const parent = selection.$from.parent
      if (!parent.isTextblock || parent.type.spec.code) return null
      if (parent.type.name === 'codeBlock' || parent.type.name === 'mathBlock') return null
      const from = selection.from
      const textBefore = takeGhostTextContext(state.doc.textBetween(0, from, '\n', '\n'))
      if (!shouldRequestGhostText(textBefore)) return null
      return { from, context: textBefore }
    }

    async function request() {
      if (!editor || Date.now() < suppressUntil) return
      const pending = collectContext()
      if (!pending) return

      const currentId = ++requestId
      const requestedDoc = editor.state.doc
      let suggestion: string | null
      try {
        suggestion = await runAiCompletion(settingsRef.current, pending.context, languageRef.current)
      } catch {
        // 续写是后台辅助能力，失败时静默忽略，不打断输入。
        return
      }
      if (!suggestion || currentId !== requestId) return
      // 请求期间文档或光标已变化时，位置不再可靠，直接丢弃结果。
      if (editor.state.doc !== requestedDoc || editor.state.selection.from !== pending.from) return
      if (Date.now() < suppressUntil) return
      editor.view.dispatch(applyAiGhostText(editor.state.tr, { text: suggestion, pos: pending.from }))
    }

    const acceptSuggestion = () => {
      const suggestion = readAiGhostText(editor.state)
      if (!suggestion) return
      requestId += 1
      suppressUntil = Date.now() + GHOST_TEXT_ACCEPT_COOLDOWN_MS
      editor.chain().focus().insertContentAt(suggestion.pos, { type: 'text', text: suggestion.text }).run()
    }

    const handleTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.getMeta(aiGhostTextKey)) return
      if (!transaction.docChanged && !transaction.selectionSet) return
      requestId += 1
      schedule()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!readAiGhostText(editor.state)) return
      if (!editor.isFocused) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        clearSuggestion()
        return
      }
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
      // 捕获阶段拦截，优先于 BlockNote 的 Tab 缩进行为。
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      acceptSuggestion()
    }

    editor.on('transaction', handleTransaction)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      editor.off('transaction', handleTransaction)
      document.removeEventListener('keydown', handleKeyDown, true)
      cancelTimer()
      clearSuggestion()
    }
  }, [editor, enabled])
}
