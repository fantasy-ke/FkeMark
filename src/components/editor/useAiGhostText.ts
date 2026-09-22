import { useEffect, useRef } from 'react'
import { EditorModeEnum } from '../../types'
import type { AppSettings, EditorMode } from '../../types'
import type { TiptapEditor } from '../../types/editor'
import { runAiCompletion } from '../../utils/aiAssistant'
import { shouldRequestGhostText, takeGhostTextContext } from '../../utils/aiGhostText'
import { matchKeymap, resolveKeymap } from '../../utils/keymap'
import {
  EMPTY_AI_GHOST_STATE,
  aiGhostTextKey,
  applyAiGhostText,
  readAiGhostText,
  type AiGhostTextState,
} from './aiGhostTextExtension'

interface UseAiGhostTextOptions {
  editor: TiptapEditor | null
  editorMode: EditorMode
  settings: AppSettings
  language: string
}

/**
 * Tab 半自动续写：按快捷键请求一条灰色续写建议，Tab 接受、Esc 拒绝。
 * 只在实时编辑模式下生效，源码/分栏/阅读模式没有可供渲染行内建议的文档结构。
 * 刻意不做「停止输入自动请求」：每次光标停留都发一次请求的额度消耗不可接受。
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

    let requestId = 0
    let inFlight = false

    const writeState = (next: AiGhostTextState) => {
      editor.view.dispatch(applyAiGhostText(editor.state.tr, next))
    }

    const clearSuggestion = () => {
      requestId += 1
      inFlight = false
      const current = aiGhostTextKey.getState(editor.state)
      if (!current || (!current.suggestion && current.loadingAt === null)) return
      writeState(EMPTY_AI_GHOST_STATE)
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
      if (!editor || inFlight) return
      const pending = collectContext()
      if (!pending) return

      const currentId = ++requestId
      const requestedDoc = editor.state.doc
      inFlight = true
      writeState({ suggestion: null, loadingAt: pending.from })

      let suggestion: string | null
      try {
        suggestion = await runAiCompletion(settingsRef.current, pending.context, languageRef.current)
      } catch {
        // 续写是后台辅助能力，失败时静默忽略，不打断输入。
        if (currentId === requestId) {
          inFlight = false
          writeState(EMPTY_AI_GHOST_STATE)
        }
        return
      }
      if (currentId !== requestId) return
      inFlight = false
      if (!suggestion) {
        writeState(EMPTY_AI_GHOST_STATE)
        return
      }
      // 请求期间文档或光标已变化时，位置不再可靠，直接丢弃结果。
      if (editor.state.doc !== requestedDoc || editor.state.selection.from !== pending.from) return
      writeState({ suggestion: { text: suggestion, pos: pending.from }, loadingAt: null })
    }

    const acceptSuggestion = () => {
      const suggestion = readAiGhostText(editor.state)
      if (!suggestion) return
      requestId += 1
      inFlight = false
      editor.chain().focus().insertContentAt(suggestion.pos, { type: 'text', text: suggestion.text }).run()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!editor.isFocused) return

      if (readAiGhostText(editor.state)) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          clearSuggestion()
          return
        }
        if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          // 捕获阶段拦截，优先于 BlockNote 的 Tab 缩进行为。
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          acceptSuggestion()
          return
        }
      }

      if (matchKeymap(event, resolveKeymap(settingsRef.current.keymap)) !== 'aiComplete') return
      event.preventDefault()
      event.stopPropagation()
      void request()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      clearSuggestion()
    }
  }, [editor, enabled])
}
