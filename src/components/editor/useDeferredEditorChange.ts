import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { EditorMode } from '../../types'
import { htmlToMarkdown, htmlToMarkdownDeferred } from '../../utils/markdown/engine'
import { countEditorLines } from './editorLineCount'
import {
  measureEditorPerformance,
  measureEditorPerformanceAsync,
  type EditorPerformanceDetails,
} from './useEditorPerformanceDiagnostics'

const LARGE_DOCUMENT_LINE_COUNT_DELAY = 300

interface EditorUpdateEvent {
  editor: TiptapEditor
  transaction: { docChanged: boolean }
}

interface EditorDocumentSnapshot {
  content: string
  docDir: string | null
  sourceHtml?: string
}

interface DeferredEditorChangeOptions {
  deferExpensiveUpdates: boolean
  docDirRef: MutableRefObject<string | null>
  editorDocumentRef: MutableRefObject<EditorDocumentSnapshot>
  editorModeRef: MutableRefObject<EditorMode>
  hasUserEditedRef: MutableRefObject<boolean>
  isSettingContentRef: MutableRefObject<boolean>
  onChange: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
}

export function useDeferredEditorChange({
  deferExpensiveUpdates,
  docDirRef,
  editorDocumentRef,
  editorModeRef,
  hasUserEditedRef,
  isSettingContentRef,
  onChange,
  onDirty,
  onLineCountChange,
}: DeferredEditorChangeOptions) {
  const pendingEditorRef = useRef<TiptapEditor | null>(null)
  const pendingChangeVersionRef = useRef(0)
  const lineCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  const onDirtyRef = useRef(onDirty)
  const onLineCountChangeRef = useRef(onLineCountChange)
  onChangeRef.current = onChange
  onDirtyRef.current = onDirty
  onLineCountChangeRef.current = onLineCountChange

  const performanceDetails = useCallback((editor: TiptapEditor): EditorPerformanceDetails => ({
    mode: editorModeRef.current,
    sourceCharacters: editorDocumentRef.current.content.length,
    documentSize: editor.state.doc.content.size,
    topLevelBlocks: editor.state.doc.childCount,
    deferExpensiveUpdates,
  }), [deferExpensiveUpdates, editorDocumentRef, editorModeRef])

  const cancelScheduledLineCount = useCallback(() => {
    if (lineCountTimerRef.current === null) return
    clearTimeout(lineCountTimerRef.current)
    lineCountTimerRef.current = null
  }, [])

  const countLines = useCallback((editor: TiptapEditor) => measureEditorPerformance(
    'editor.line-count',
    performanceDetails(editor),
    () => countEditorLines(editor),
  ), [performanceDetails])

  const scheduleLineCount = useCallback((editor: TiptapEditor) => {
    if (!onLineCountChangeRef.current) return
    cancelScheduledLineCount()
    lineCountTimerRef.current = setTimeout(() => {
      lineCountTimerRef.current = null
      onLineCountChangeRef.current?.(countLines(editor))
    }, LARGE_DOCUMENT_LINE_COUNT_DELAY)
  }, [cancelScheduledLineCount, countLines])

  const serializeEditor = useCallback((editor: TiptapEditor, notify: boolean) => {
    pendingEditorRef.current = null
    pendingChangeVersionRef.current += 1
    const details = performanceDetails(editor)
    const html = measureEditorPerformance('editor.serialize.get-html', details, () => editor.getHTML())
    const md = measureEditorPerformance(
      'editor.serialize.html-to-markdown',
      { ...details, htmlCharacters: html.length },
      () => htmlToMarkdown(html, docDirRef.current),
    )
    editorDocumentRef.current = { content: md, docDir: docDirRef.current, sourceHtml: html }
    if (notify) onChangeRef.current(md)
    return md
  }, [docDirRef, editorDocumentRef, performanceDetails])

  const serializeEditorDeferred = useCallback(async (editor: TiptapEditor, signal?: AbortSignal) => {
    const changeVersion = pendingChangeVersionRef.current
    const details = performanceDetails(editor)
    const html = measureEditorPerformance('editor.serialize.get-html', details, () => editor.getHTML())
    const md = await measureEditorPerformanceAsync(
      'editor.serialize.html-to-markdown.deferred',
      { ...details, htmlCharacters: html.length },
      () => htmlToMarkdownDeferred(html, docDirRef.current, signal),
    )
    if (signal?.aborted || pendingChangeVersionRef.current !== changeVersion) {
      const error = new Error('Deferred editor serialization was aborted')
      error.name = 'AbortError'
      throw error
    }
    pendingEditorRef.current = null
    pendingChangeVersionRef.current += 1
    editorDocumentRef.current = { content: md, docDir: docDirRef.current, sourceHtml: html }
    return md
  }, [docDirRef, editorDocumentRef, performanceDetails])

  const handleEditorUpdate = useCallback(({ editor, transaction }: EditorUpdateEvent) => {
    if (!transaction.docChanged) return
    if (isSettingContentRef.current || editorModeRef.current !== 'live') return

    hasUserEditedRef.current = true
    pendingChangeVersionRef.current += 1
    editorDocumentRef.current.sourceHtml = undefined
    if (!deferExpensiveUpdates) {
      cancelScheduledLineCount()
      onLineCountChangeRef.current?.(countLines(editor))
      serializeEditor(editor, true)
      return
    }

    scheduleLineCount(editor)
    const alreadyPending = pendingEditorRef.current !== null
    pendingEditorRef.current = editor
    if (!alreadyPending) onDirtyRef.current?.()
  }, [
    cancelScheduledLineCount,
    countLines,
    deferExpensiveUpdates,
    editorModeRef,
    hasUserEditedRef,
    isSettingContentRef,
    scheduleLineCount,
    serializeEditor,
  ])

  const flushPendingChange = useCallback(() => {
    const pendingEditor = pendingEditorRef.current
    return pendingEditor ? serializeEditor(pendingEditor, false) : null
  }, [serializeEditor])

  const flushPendingChangeDeferred = useCallback((signal?: AbortSignal) => {
    const pendingEditor = pendingEditorRef.current
    return pendingEditor ? serializeEditorDeferred(pendingEditor, signal) : Promise.resolve(null)
  }, [serializeEditorDeferred])

  const cancelPendingChange = useCallback(() => {
    pendingEditorRef.current = null
    pendingChangeVersionRef.current += 1
    cancelScheduledLineCount()
  }, [cancelScheduledLineCount])

  useEffect(() => cancelScheduledLineCount, [cancelScheduledLineCount])

  return { cancelPendingChange, flushPendingChange, flushPendingChangeDeferred, handleEditorUpdate }
}
