import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { EditorMode } from '../../types'
import { type Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  createProseMirrorMarkdownSerializer,
  type ProseMirrorMarkdownResult,
} from '../../utils/markdown/proseMirrorSerializer'
import { countEditorLines } from './editorLineCount'
import {
  measureEditorPerformance,
  recordEditorPerformanceOperation,
  type EditorPerformanceDetails,
} from './useEditorPerformanceDiagnostics'

const MARKDOWN_IDLE_DELAY = 1_500
const LARGE_DOCUMENT_LINE_COUNT_DELAY = 300

export type EditorSerializationReason = 'idle' | 'mode-switch' | 'save' | 'export' | 'sync-read'

interface EditorUpdateEvent {
  editor: TiptapEditor
  transaction: { docChanged: boolean }
}

export interface EditorDocumentSnapshot {
  content: string
  docDir: string | null
  revision: number
}

interface EditorMarkdownPipelineOptions {
  performanceSensitive: boolean
  docDirRef: MutableRefObject<string | null>
  editorDocumentRef: MutableRefObject<EditorDocumentSnapshot>
  editorModeRef: MutableRefObject<EditorMode>
  hasUserEditedRef: MutableRefObject<boolean>
  isSettingContentRef: MutableRefObject<boolean>
  onChange: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function abortError(): Error {
  const error = new Error('Editor Markdown serialization was aborted')
  error.name = 'AbortError'
  return error
}

function waitForBrowserTurn(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, 0)
    const handleAbort = () => {
      window.clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

export function useEditorMarkdownPipeline({
  performanceSensitive,
  docDirRef,
  editorDocumentRef,
  editorModeRef,
  hasUserEditedRef,
  isSettingContentRef,
  onChange,
  onDirty,
  onLineCountChange,
}: EditorMarkdownPipelineOptions) {
  const pendingEditorRef = useRef<TiptapEditor | null>(null)
  const revisionRef = useRef(editorDocumentRef.current.revision)
  const pendingSinceRef = useRef<number | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lineCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serializerRef = useRef<{
    schema: TiptapEditor['schema']
    serializer: ReturnType<typeof createProseMirrorMarkdownSerializer>
  } | null>(null)
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
    performanceSensitive,
  }), [editorDocumentRef, editorModeRef, performanceSensitive])

  const getSerializer = useCallback((editor: TiptapEditor) => {
    const current = serializerRef.current
    if (current?.schema === editor.schema) return current.serializer
    const serializer = createProseMirrorMarkdownSerializer(editor.schema)
    serializerRef.current = { schema: editor.schema, serializer }
    return serializer
  }, [])

  const cancelIdleSerialization = useCallback(() => {
    if (idleTimerRef.current === null) return
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }, [])

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
    if (!performanceSensitive) {
      onLineCountChangeRef.current(countLines(editor))
      return
    }
    lineCountTimerRef.current = setTimeout(() => {
      lineCountTimerRef.current = null
      onLineCountChangeRef.current?.(countLines(editor))
    }, LARGE_DOCUMENT_LINE_COUNT_DELAY)
  }, [cancelScheduledLineCount, countLines, performanceSensitive])

  const finalizeSerialization = useCallback((
    editor: TiptapEditor,
    documentNode: ProseMirrorNode,
    docDir: string | null,
    result: ProseMirrorMarkdownResult,
    reason: EditorSerializationReason,
    revision: number,
    startedAt: number,
    pendingAgeMs: number,
    notify: boolean,
  ) => {
    const stale = revisionRef.current !== revision
      || pendingEditorRef.current !== editor
      || docDirRef.current !== docDir
    if (!stale) {
      cancelIdleSerialization()
      pendingEditorRef.current = null
      pendingSinceRef.current = null
      editorDocumentRef.current = { content: result.markdown, docDir, revision }
      if (notify) onChangeRef.current(result.markdown)
    }
    recordEditorPerformanceOperation('editor.markdown.serialize', now() - startedAt, {
      ...performanceDetails(editor),
      ...result.metrics,
      reason,
      revision,
      stale,
      serializedDocumentSize: documentNode.content.size,
      serializedTopLevelBlocks: documentNode.childCount,
      pendingAgeMs: Math.round(pendingAgeMs * 10) / 10,
    })
    return { markdown: result.markdown, stale }
  }, [cancelIdleSerialization, docDirRef, editorDocumentRef, performanceDetails])

  const serializeEditor = useCallback((
    editor: TiptapEditor,
    reason: EditorSerializationReason,
    notify: boolean,
  ) => {
    cancelIdleSerialization()
    const startedAt = now()
    const revision = revisionRef.current
    const documentNode = editor.state.doc
    const docDir = docDirRef.current
    const pendingAgeMs = pendingSinceRef.current === null ? 0 : startedAt - pendingSinceRef.current
    const result = getSerializer(editor).serialize(documentNode, docDir)
    return finalizeSerialization(
      editor,
      documentNode,
      docDir,
      result,
      reason,
      revision,
      startedAt,
      pendingAgeMs,
      notify,
    ).markdown
  }, [cancelIdleSerialization, docDirRef, finalizeSerialization, getSerializer])

  const serializeEditorDeferred = useCallback(async (
    editor: TiptapEditor,
    reason: EditorSerializationReason,
    signal?: AbortSignal,
  ): Promise<string | null> => {
    while (pendingEditorRef.current === editor) {
      if (signal?.aborted) throw abortError()
      cancelIdleSerialization()
      const startedAt = now()
      const revision = revisionRef.current
      const documentNode = editor.state.doc
      const docDir = docDirRef.current
      const pendingAgeMs = pendingSinceRef.current === null ? 0 : startedAt - pendingSinceRef.current
      const result = await getSerializer(editor).serializeAsync(
        documentNode,
        docDir,
        () => waitForBrowserTurn(signal),
      )
      const completed = finalizeSerialization(
        editor,
        documentNode,
        docDir,
        result,
        reason,
        revision,
        startedAt,
        pendingAgeMs,
        false,
      )
      if (!completed.stale) return completed.markdown
    }
    return null
  }, [cancelIdleSerialization, docDirRef, finalizeSerialization, getSerializer])

  const scheduleIdleSerialization = useCallback((editor: TiptapEditor) => {
    cancelIdleSerialization()
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null
      if (pendingEditorRef.current !== editor) return
      serializeEditor(editor, 'idle', true)
    }, MARKDOWN_IDLE_DELAY)
  }, [cancelIdleSerialization, serializeEditor])

  const handleEditorUpdate = useCallback(({ editor, transaction }: EditorUpdateEvent) => {
    if (!transaction.docChanged) return
    if (isSettingContentRef.current || editorModeRef.current !== 'live') return

    hasUserEditedRef.current = true
    revisionRef.current += 1
    editorDocumentRef.current.revision = revisionRef.current
    scheduleLineCount(editor)

    const alreadyPending = pendingEditorRef.current !== null
    pendingEditorRef.current = editor
    pendingSinceRef.current ??= now()
    scheduleIdleSerialization(editor)
    if (!alreadyPending) onDirtyRef.current?.()
  }, [editorDocumentRef, editorModeRef, hasUserEditedRef, isSettingContentRef, scheduleIdleSerialization, scheduleLineCount])

  const flushPendingChange = useCallback((reason: EditorSerializationReason = 'sync-read') => {
    const pendingEditor = pendingEditorRef.current
    return pendingEditor ? serializeEditor(pendingEditor, reason, false) : null
  }, [serializeEditor])

  const flushPendingChangeDeferred = useCallback(async (
    signal?: AbortSignal,
    reason: EditorSerializationReason = 'save',
  ) => {
    if (!pendingEditorRef.current) return null
    await waitForBrowserTurn(signal)
    if (signal?.aborted) throw abortError()
    const pendingEditor = pendingEditorRef.current
    return pendingEditor ? serializeEditorDeferred(pendingEditor, reason, signal) : null
  }, [serializeEditorDeferred])

  const cancelPendingChange = useCallback(() => {
    pendingEditorRef.current = null
    pendingSinceRef.current = null
    revisionRef.current += 1
    cancelIdleSerialization()
    cancelScheduledLineCount()
    serializerRef.current?.serializer.clearCache()
  }, [cancelIdleSerialization, cancelScheduledLineCount])

  useEffect(() => () => {
    cancelIdleSerialization()
    cancelScheduledLineCount()
  }, [cancelIdleSerialization, cancelScheduledLineCount])

  return { cancelPendingChange, flushPendingChange, flushPendingChangeDeferred, handleEditorUpdate }
}
