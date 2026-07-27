import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { EditorHandle } from '../components/Editor'
import type { EditorSerializationReason } from '../components/editor/useEditorMarkdownPipeline'
import {
  measureEditorPerformance,
  measureEditorPerformanceAsync,
} from '../components/editor/useEditorPerformanceDiagnostics'
import { EditorModeEnum } from '../types'
import type { EditorMode } from '../types'

interface CurrentEditorContentOptions {
  editorMode: EditorMode
  fileContent: string
  setFileContent: Dispatch<SetStateAction<string>>
  setEditorMode: Dispatch<SetStateAction<EditorMode>>
}

interface PendingModeContentSync {
  editorHandle: EditorHandle | null
  fileContent: string
  targetMode: EditorMode
}

export function useCurrentEditorContent({
  editorMode,
  fileContent,
  setFileContent,
  setEditorMode,
}: CurrentEditorContentOptions) {
  const editorHandleRef = useRef<EditorHandle>(null)
  const pendingModeSyncRef = useRef<PendingModeContentSync | null>(null)
  const modeSyncFrameRef = useRef<number | null>(null)
  const modeSyncTimerRef = useRef<number | null>(null)
  const modeSyncAbortRef = useRef<AbortController | null>(null)

  const cancelScheduledModeSync = useCallback(() => {
    if (modeSyncFrameRef.current !== null) window.cancelAnimationFrame(modeSyncFrameRef.current)
    if (modeSyncTimerRef.current !== null) window.clearTimeout(modeSyncTimerRef.current)
    modeSyncAbortRef.current?.abort()
    modeSyncFrameRef.current = null
    modeSyncTimerRef.current = null
    modeSyncAbortRef.current = null
  }, [])

  const applySyncedContent = useCallback((pending: PendingModeContentSync, content: string) => {
    if (content !== pending.fileContent) {
      setFileContent((current) => current === pending.fileContent ? content : current)
    }
    return content
  }, [setFileContent])

  const syncPendingModeContent = useCallback((pending: PendingModeContentSync) => {
    const content = measureEditorPerformance('editor.mode-switch.sync', {
      fromMode: EditorModeEnum.Live,
      toMode: pending.targetMode,
      sourceCharacters: pending.fileContent.length,
    }, () => pending.editorHandle?.getContent() ?? pending.fileContent)
    return applySyncedContent(pending, content)
  }, [applySyncedContent])

  const syncPendingModeContentDeferred = useCallback(async (
    pending: PendingModeContentSync,
    signal: AbortSignal,
  ) => {
    const content = await measureEditorPerformanceAsync('editor.mode-switch.sync.deferred', {
      fromMode: EditorModeEnum.Live,
      toMode: pending.targetMode,
      sourceCharacters: pending.fileContent.length,
    }, () => pending.editorHandle?.getContentDeferred(signal, 'mode-switch') ?? Promise.resolve(pending.fileContent))
    if (signal.aborted) return pending.fileContent
    return applySyncedContent(pending, content)
  }, [applySyncedContent])

  const getCurrentContent = useCallback(() => {
    cancelScheduledModeSync()
    const pending = pendingModeSyncRef.current
    pendingModeSyncRef.current = null
    if (pending) return syncPendingModeContent(pending)

    const content = editorMode === EditorModeEnum.Live ? (editorHandleRef.current?.getContent() ?? fileContent) : fileContent
    if (content !== fileContent) setFileContent(content)
    return content
  }, [cancelScheduledModeSync, editorMode, fileContent, setFileContent, syncPendingModeContent])

  const getCurrentContentDeferred = useCallback(async (
    reason: EditorSerializationReason = 'save',
  ) => {
    cancelScheduledModeSync()
    const pending = pendingModeSyncRef.current
    pendingModeSyncRef.current = null
    const editorHandle = pending?.editorHandle ?? (editorMode === EditorModeEnum.Live ? editorHandleRef.current : null)
    const fallbackContent = pending?.fileContent ?? fileContent
    if (!editorHandle) return fallbackContent

    const content = await measureEditorPerformanceAsync('editor.content.flush.deferred', {
      mode: editorMode,
      reason,
      sourceCharacters: fallbackContent.length,
      pendingModeSwitch: Boolean(pending),
    }, () => editorHandle.getContentDeferred(undefined, reason))
    if (content !== fallbackContent) {
      setFileContent((current) => current === fallbackContent ? content : current)
    }
    return content
  }, [cancelScheduledModeSync, editorMode, fileContent, setFileContent])

  const handleEditorModeChange = useCallback((mode: EditorMode) => {
    if (mode === editorMode) return
    cancelScheduledModeSync()
    if (editorMode === EditorModeEnum.Live) {
      pendingModeSyncRef.current = {
        editorHandle: editorHandleRef.current,
        fileContent,
        targetMode: mode,
      }
    } else if (mode === EditorModeEnum.Live) {
      pendingModeSyncRef.current = null
    } else if (pendingModeSyncRef.current) {
      pendingModeSyncRef.current.targetMode = mode
    }
    setEditorMode(mode)
  }, [cancelScheduledModeSync, editorMode, fileContent, setEditorMode])

  useEffect(() => {
    const pending = pendingModeSyncRef.current
    if (!pending || editorMode === EditorModeEnum.Live) return

    modeSyncFrameRef.current = window.requestAnimationFrame(() => {
      modeSyncFrameRef.current = null
      modeSyncTimerRef.current = window.setTimeout(() => {
        modeSyncTimerRef.current = null
        if (pendingModeSyncRef.current !== pending) return
        const controller = new AbortController()
        modeSyncAbortRef.current = controller
        void syncPendingModeContentDeferred(pending, controller.signal)
          .then(() => {
            if (!controller.signal.aborted && pendingModeSyncRef.current === pending) {
              pendingModeSyncRef.current = null
            }
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return
            console.error('[editor-mode-sync] deferred content sync failed; using synchronous fallback', error)
            if (pendingModeSyncRef.current !== pending) return
            pendingModeSyncRef.current = null
            syncPendingModeContent(pending)
          })
          .finally(() => {
            if (modeSyncAbortRef.current === controller) modeSyncAbortRef.current = null
          })
      }, 0)
    })

    return cancelScheduledModeSync
  }, [cancelScheduledModeSync, editorMode, syncPendingModeContent, syncPendingModeContentDeferred])

  return { editorHandleRef, getCurrentContent, getCurrentContentDeferred, handleEditorModeChange }
}
