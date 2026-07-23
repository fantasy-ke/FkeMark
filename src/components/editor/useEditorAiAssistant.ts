import type { Editor as TiptapEditor } from '@tiptap/react'
import { useCallback, useState, type RefObject } from 'react'
import type { AiAssistantAction, AppSettings, EditorMode } from '../../types'
import { runAiAssistant } from '../../utils/aiAssistant'
import { markdownToHtml } from '../../utils/markdown/engine'

export type AiResultApplyMode = 'insert' | 'replace'

export interface EditorAiAssistantController {
  enabled: boolean
  busy: boolean
  panelOpen: boolean
  action: AiAssistantAction | null
  result: string
  error: string
  canApply: boolean
  canReplaceSelection: boolean
  runAction: (action: AiAssistantAction) => void
  closePanel: () => void
  applyResult: (mode: AiResultApplyMode) => void
}

interface UseEditorAiAssistantOptions {
  editor: TiptapEditor | null
  content: string
  onChange: (content: string) => void
  settings: AppSettings
  editorMode: EditorMode
  textareaRef: RefObject<HTMLTextAreaElement | null>
  docDirRef: RefObject<string | null>
  t: (key: string, params?: Record<string, string | number>) => string
  language: string
  closeEditorOverlays: () => void
}

interface AiSourceRange {
  kind: 'tiptap' | 'text'
  from: number
  to: number
  hasSelection: boolean
}

interface AiPanelState {
  open: boolean
  action: AiAssistantAction | null
  loading: boolean
  result: string
  error: string
  source: AiSourceRange | null
}

const EMPTY_PANEL: AiPanelState = {
  open: false,
  action: null,
  loading: false,
  result: '',
  error: '',
  source: null,
}

export function useEditorAiAssistant({
  editor,
  content,
  onChange,
  settings,
  editorMode,
  textareaRef,
  docDirRef,
  t,
  language,
  closeEditorOverlays,
}: UseEditorAiAssistantOptions): EditorAiAssistantController {
  const [panel, setPanel] = useState<AiPanelState>(EMPTY_PANEL)

  const runAction = useCallback((action: AiAssistantAction) => {
    closeEditorOverlays()

    let source: AiSourceRange
    let input: string
    try {
      const selection = getAiSelection(editor, editorMode, content, textareaRef)
      source = selection.source
      input = selection.input
      if (!settings.aiEnabled) throw new Error(t('ai.error.notEnabled'))
      if (!input.trim()) throw new Error(t('ai.error.emptyInput'))
    } catch (error) {
      setPanel({ open: true, action, loading: false, result: '', error: formatError(error), source: null })
      return
    }

    setPanel({ open: true, action, loading: true, result: '', error: '', source })
    void runAiAssistant(settings, action, input, language)
      .then((result) => setPanel({ open: true, action, loading: false, result, error: '', source }))
      .catch((error) => setPanel({ open: true, action, loading: false, result: '', error: formatError(error), source }))
  }, [closeEditorOverlays, content, editor, editorMode, language, settings, t, textareaRef])

  const closePanel = useCallback(() => setPanel(EMPTY_PANEL), [])

  const applyResult = useCallback((mode: AiResultApplyMode) => {
    if (!panel.result.trim() || !panel.source) return
    const result = panel.result.trim()
    applyAiResult({
      editor,
      content,
      docDir: docDirRef.current,
      mode,
      onChange,
      result,
      source: panel.source,
      textarea: textareaRef.current,
    })
    setPanel(EMPTY_PANEL)
  }, [content, docDirRef, editor, onChange, panel.result, panel.source, textareaRef])

  return {
    enabled: settings.aiEnabled,
    busy: panel.loading,
    panelOpen: panel.open,
    action: panel.action,
    result: panel.result,
    error: panel.error,
    canApply: Boolean(panel.result.trim() && panel.source),
    canReplaceSelection: Boolean(panel.source?.hasSelection),
    runAction,
    closePanel,
    applyResult,
  }
}

function getAiSelection(
  editor: TiptapEditor | null,
  editorMode: EditorMode,
  content: string,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
): { source: AiSourceRange; input: string } {
  if (editorMode === 'source' || editorMode === 'split') {
    const textarea = textareaRef.current
    const text = textarea?.value ?? content
    const from = textarea?.selectionStart ?? 0
    const to = textarea?.selectionEnd ?? from
    const selected = text.slice(from, to).trim()
    return {
      source: { kind: 'text', from, to, hasSelection: to > from },
      input: selected || text.slice(0, from).trim() || text,
    }
  }

  if (editorMode === 'live' && editor) {
    const { from, to, empty } = editor.state.selection
    const selected = empty ? '' : editor.state.doc.textBetween(from, to, '\n').trim()
    const beforeCursor = editor.state.doc.textBetween(0, from, '\n').trim()
    return {
      source: { kind: 'tiptap', from, to, hasSelection: !empty },
      input: selected || beforeCursor || content,
    }
  }

  return {
    source: { kind: 'text', from: 0, to: content.length, hasSelection: false },
    input: content,
  }
}

function applyAiResult({
  editor,
  content,
  docDir,
  mode,
  onChange,
  result,
  source,
  textarea,
}: {
  editor: TiptapEditor | null
  content: string
  docDir: string | null
  mode: AiResultApplyMode
  onChange: (content: string) => void
  result: string
  source: AiSourceRange
  textarea: HTMLTextAreaElement | null
}) {
  if (source.kind === 'tiptap' && editor) {
    const html = markdownToHtml(result, docDir)
    const range = mode === 'insert'
      ? { from: source.to, to: source.to }
      : source.hasSelection
        ? { from: source.from, to: source.to }
        : { from: 0, to: editor.state.doc.content.size }
    editor.chain().focus().insertContentAt(range, html).run()
    return
  }

  const range = mode === 'insert'
    ? { from: source.to, to: source.to }
    : source.hasSelection
      ? { from: source.from, to: source.to }
      : { from: 0, to: content.length }
  const insertion = formatTextInsertion(content, range.from, range.to, result)
  const next = replaceRange(content, range.from, range.to, insertion)
  onChange(next)
  requestAnimationFrame(() => {
    textarea?.focus()
    const cursor = range.from + insertion.length
    textarea?.setSelectionRange(cursor, cursor)
  })
}

function replaceRange(text: string, from: number, to: number, insert: string): string {
  return text.slice(0, from) + insert + text.slice(to)
}

function formatTextInsertion(content: string, from: number, to: number, result: string): string {
  const trimmed = result.trim()
  if (from !== to || (from === 0 && to === content.length)) return trimmed

  const before = content.slice(0, from)
  const after = content.slice(to)
  const prefix = before && !before.endsWith('\n') ? '\n\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n\n' : ''
  return `${prefix}${trimmed}${suffix}`
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'AI request failed'
}
