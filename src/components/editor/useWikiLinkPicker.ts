import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { EditorMode, FileTreeNode } from '../../types'
import {
  buildWikiLinkSuggestions,
  findPendingWikiLink,
  wikiTargetToHref,
  type WikiLinkSuggestion,
} from '../../utils/markdown/wikiLinks'

interface WikiLinkPickerState {
  open: boolean
  query: string
  x: number
  y: number
  source: 'editor' | 'textarea'
  from: number
  to: number
  sourceValue: string
}

const CLOSED_STATE: WikiLinkPickerState = {
  open: false, query: '', x: 0, y: 0, source: 'editor', from: 0, to: 0, sourceValue: '',
}

interface WikiLinkPickerOptions {
  editor: TiptapEditor | null
  editorMode: EditorMode
  content: string
  fileTree: FileTreeNode[]
  currentFile?: string | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (content: string) => void
  onBeforeOpen: () => void
}

export function useWikiLinkPicker(options: WikiLinkPickerOptions) {
  const { editor, editorMode, content, fileTree, currentFile, textareaRef, onChange, onBeforeOpen } = options
  const [state, setState] = useState<WikiLinkPickerState>(CLOSED_STATE)
  const stateRef = useRef(state)
  const onBeforeOpenRef = useRef(onBeforeOpen)
  stateRef.current = state
  onBeforeOpenRef.current = onBeforeOpen
  const suggestions = useMemo(() => buildWikiLinkSuggestions(fileTree, currentFile), [currentFile, fileTree])

  const close = useCallback(() => setState((current) => current.open ? CLOSED_STATE : current), [])

  useEffect(() => {
    if (!editor || editorMode !== 'live') {
      if (stateRef.current.source === 'editor') close()
      return
    }

    const update = () => {
      const { selection } = editor.state
      const $from = selection.$from
      if (!selection.empty || ($from.parent.type.name !== 'paragraph' && $from.parent.type.name !== 'heading')
        || editor.isActive('code')) {
        if (stateRef.current.source === 'editor') close()
        return
      }

      const pending = findPendingWikiLink($from.parent.textContent, $from.parentOffset)
      if (!pending) {
        if (stateRef.current.source === 'editor') close()
        return
      }

      try {
        const coords = editor.view.coordsAtPos(selection.from)
        if (!stateRef.current.open || stateRef.current.source !== 'editor') onBeforeOpenRef.current()
        setState({
          open: true,
          query: pending.query,
          x: coords.left,
          y: coords.bottom + 4,
          source: 'editor',
          from: $from.start() + pending.from,
          to: $from.start() + pending.to,
          sourceValue: '',
        })
      } catch { /* Ignore unavailable coordinates while the editor view is updating. */ }
    }

    editor.on('transaction', update)
    return () => { editor.off('transaction', update) }
  }, [close, editor, editorMode])

  useEffect(() => { close() }, [close, editorMode, currentFile])

  const openFromEditor = useCallback(() => {
    if (!editor) return
    onBeforeOpenRef.current()
    editor.chain().focus().insertContent('[[').run()
  }, [editor])

  const handleSourceChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value
    const cursor = event.currentTarget.selectionStart
    onChange(value)
    const pending = findPendingWikiLink(value, cursor)
    if (!pending) {
      if (stateRef.current.source === 'textarea') close()
      return
    }

    if (!stateRef.current.open || stateRef.current.source !== 'textarea') onBeforeOpenRef.current()
    const rect = event.currentTarget.getBoundingClientRect()
    setState({
      open: true,
      query: pending.query,
      x: rect.left + 24,
      y: rect.top + 48,
      source: 'textarea',
      from: pending.from,
      to: pending.to,
      sourceValue: value,
    })
  }, [close, onChange])

  const select = useCallback((suggestion: WikiLinkSuggestion) => {
    const current = stateRef.current
    if (!current.open) return
    setState(CLOSED_STATE)
    if (current.source === 'editor' && editor) {
      editor.chain().focus()
        .insertContentAt({ from: current.from, to: current.to }, {
          type: 'text',
          text: suggestion.target,
          marks: [{ type: 'link', attrs: { href: wikiTargetToHref(suggestion.target) } }],
        })
        .setTextSelection(current.from + suggestion.target.length)
        .run()
      return
    }

    const sourceValue = current.sourceValue || content
    const inserted = `[[${suggestion.target}]]`
    onChange(sourceValue.slice(0, current.from) + inserted + sourceValue.slice(current.to))
    setTimeout(() => {
      const textarea = textareaRef.current
      const cursor = current.from + inserted.length
      textarea?.focus()
      textarea?.setSelectionRange(cursor, cursor)
    }, 0)
  }, [content, editor, onChange, textareaRef])

  return { state, suggestions, close, openFromEditor, handleSourceChange, select }
}
