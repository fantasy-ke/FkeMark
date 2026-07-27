import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { EditorModeEnum } from '../../types'
import type { EditorMode } from '../../types'
import {
  serializeBlockNoteDocument,
  type AnyBlockNoteEditor,
  type BlockNoteBlocks,
} from './blockNoteMarkdown'
import { recordEditorPerformanceOperation } from './useEditorPerformanceDiagnostics'

const MARKDOWN_IDLE_DELAY = 1_500

export type EditorSerializationReason = 'idle' | 'mode-switch' | 'save' | 'export' | 'sync-read'

export interface EditorDocumentSnapshot {
  content: string
  docDir: string | null
  revision: number
}

interface EditorMarkdownPipelineOptions {
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
  return globalThis.performance?.now?.() ?? Date.now()
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

function markdownLineCount(content: string): number {
  if (!content) return 0
  let count = 1
  let from = 0
  while (true) {
    const next = content.indexOf('\n', from)
    if (next < 0) return count
    count += 1
    from = next + 1
  }
}

export function useEditorMarkdownPipeline({
  docDirRef,
  editorDocumentRef,
  editorModeRef,
  hasUserEditedRef,
  isSettingContentRef,
  onChange,
  onDirty,
  onLineCountChange,
}: EditorMarkdownPipelineOptions) {
  const pendingEditorRef = useRef<AnyBlockNoteEditor | null>(null)
  const revisionRef = useRef(editorDocumentRef.current.revision)
  const pendingSinceRef = useRef<number | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  const onDirtyRef = useRef(onDirty)
  const onLineCountChangeRef = useRef(onLineCountChange)
  onChangeRef.current = onChange
  onDirtyRef.current = onDirty
  onLineCountChangeRef.current = onLineCountChange

  const cancelIdleSerialization = useCallback(() => {
    if (idleTimerRef.current === null) return
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }, [])

  const finalizeSerialization = useCallback((options: {
    blocks: BlockNoteBlocks
    editor: AnyBlockNoteEditor
    notify: boolean
    reason: EditorSerializationReason
    revision: number
    startedAt: number
  }) => {
    const { blocks, editor, notify, reason, revision, startedAt } = options
    const pendingAgeMs = pendingSinceRef.current === null ? 0 : startedAt - pendingSinceRef.current
    const sourceContent = editorDocumentRef.current.content
    const markdown = serializeBlockNoteDocument({ blocks, editor, sourceContent })
    const stale = revision !== revisionRef.current || pendingEditorRef.current !== editor
    if (!stale) {
      pendingEditorRef.current = null
      pendingSinceRef.current = null
      editorDocumentRef.current = {
        content: markdown,
        docDir: docDirRef.current,
        revision,
      }
      onLineCountChangeRef.current?.(markdownLineCount(markdown))
      if (notify) onChangeRef.current(markdown)
    }
    recordEditorPerformanceOperation('editor.markdown.flush', now() - startedAt, {
      reason,
      revision,
      stale,
      blockCount: blocks.length,
      pendingAgeMs: Math.round(pendingAgeMs * 10) / 10,
      sourceCharacters: sourceContent.length,
      sourceLines: sourceContent ? sourceContent.split(/\r?\n/u).length : 1,
    })
    return { markdown, stale }
  }, [docDirRef, editorDocumentRef])

  const serializeEditor = useCallback((
    editor: AnyBlockNoteEditor,
    reason: EditorSerializationReason,
    notify: boolean,
  ) => {
    cancelIdleSerialization()
    return finalizeSerialization({
      blocks: editor.document,
      editor,
      notify,
      reason,
      revision: revisionRef.current,
      startedAt: now(),
    }).markdown
  }, [cancelIdleSerialization, finalizeSerialization])

  const scheduleIdleSerialization = useCallback((editor: AnyBlockNoteEditor) => {
    cancelIdleSerialization()
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null
      if (pendingEditorRef.current !== editor) return
      serializeEditor(editor, 'idle', true)
    }, MARKDOWN_IDLE_DELAY)
  }, [cancelIdleSerialization, serializeEditor])

  const handleEditorChange = useCallback((editor: AnyBlockNoteEditor) => {
    if (isSettingContentRef.current || editorModeRef.current !== EditorModeEnum.Live) return
    hasUserEditedRef.current = true
    revisionRef.current += 1
    editorDocumentRef.current.revision = revisionRef.current
    const alreadyPending = pendingEditorRef.current !== null
    pendingEditorRef.current = editor
    pendingSinceRef.current ??= now()
    scheduleIdleSerialization(editor)
    if (!alreadyPending) onDirtyRef.current?.()
  }, [editorDocumentRef, editorModeRef, hasUserEditedRef, isSettingContentRef, scheduleIdleSerialization])

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
    return pendingEditor ? serializeEditor(pendingEditor, reason, false) : null
  }, [serializeEditor])

  const cancelPendingChange = useCallback(() => {
    pendingEditorRef.current = null
    pendingSinceRef.current = null
    revisionRef.current += 1
    cancelIdleSerialization()
  }, [cancelIdleSerialization])

  useEffect(() => cancelIdleSerialization, [cancelIdleSerialization])

  return { cancelPendingChange, flushPendingChange, flushPendingChangeDeferred, handleEditorChange }
}
