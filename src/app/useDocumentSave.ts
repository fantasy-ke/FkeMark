import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { AppSettings } from '../types'
import type { DocumentSyncStatus } from '../utils/documentStats'
import type { EditorSerializationReason } from '../components/editor/useEditorMarkdownPipeline'
import {
  recordEditorPerformanceOperation,
  recordEditorPerformanceState,
} from '../components/editor/useEditorPerformanceDiagnostics'
import { showPrompt } from '../components/ConfirmDialog'
import { translate } from '../i18n'
import { normalizeVersionSnapshotLimit } from '../utils/versionHistory'
import { enqueueDocumentSave } from './documentSaveQueue'
import { isTauri } from '../utils/tauri'
import { notifyError, notifyWarning } from '../utils/toast'

const SAVE_STALL_WARNING_MS = 8_000

interface FileWriteMetrics {
  contentBytes: number
  existingFile: boolean
  historyInitMs: number
  previousReadMs: number
  snapshotMs: number
  finalWriteMs: number
  totalMs: number
  snapshotAttempted: boolean
  snapshotSaved: boolean
  snapshotError: string | null
}

interface UseDocumentSaveOptions {
  activeTabId: string | null
  currentFile: string | null
  currentFolderPath: string | null
  settings: AppSettings
  documentRevisionRef: MutableRefObject<Map<string, number>>
  getCurrentContentDeferred: (reason?: EditorSerializationReason) => Promise<string>
  markActiveDocumentSaved: (savedAt?: number, path?: string | null, content?: string) => void
  scanFolder: (path: string) => unknown
  setCurrentFile: Dispatch<SetStateAction<string | null>>
  setSaveStatus: Dispatch<SetStateAction<DocumentSyncStatus>>
  updateActiveTabPath: (path: string, name: string) => void
  onSaved?: (path: string, content: string) => void
}

export function useDocumentSave({
  activeTabId,
  currentFile,
  currentFolderPath,
  settings,
  documentRevisionRef,
  getCurrentContentDeferred,
  markActiveDocumentSaved,
  scanFolder,
  setCurrentFile,
  setSaveStatus,
  updateActiveTabPath,
  onSaved,
}: UseDocumentSaveOptions) {
  const activeTabIdRef = useRef(activeTabId)
  const saveRequestIdRef = useRef(0)
  activeTabIdRef.current = activeTabId

  return useCallback(async () => {
    const targetTabId = activeTabIdRef.current
    const tauri = isTauri()
    let targetPath = currentFile
    let targetName = currentFile?.split(/[\\/]/).pop() || null

    if (!targetPath) {
      if (tauri) {
        const savePath = await openDialog({
          directory: true,
          multiple: false,
          title: translate(settings.language, 'tab.selectSaveLocation'),
        })
        if (typeof savePath !== 'string' || activeTabIdRef.current !== targetTabId) return
        targetName = await showPrompt(
          translate(settings.language, 'tab.enterFileName'),
          translate(settings.language, 'document.untitledFileName'),
        )
        if (!targetName || activeTabIdRef.current !== targetTabId) return
        targetPath = `${savePath}/${targetName}`
      } else {
        targetName = await showPrompt(
          translate(settings.language, 'tab.enterFileName'),
          translate(settings.language, 'document.untitledFileName'),
        )
        if (!targetName || activeTabIdRef.current !== targetTabId) return
        targetPath = targetName
      }
    }
    if (!targetPath) return

    const requestId = ++saveRequestIdRef.current
    const revisionKey = targetTabId ?? targetPath
    const savedRevision = documentRevisionRef.current.get(revisionKey) ?? 0
    const contentPromise = getCurrentContentDeferred('save')
    const totalStartedAt = performance.now()
    let activeStage = 'content-flush'
    const commonDetails = {
      requestId,
      existingFile: Boolean(currentFile),
      targetPath,
    }
    setSaveStatus('saving')
    recordEditorPerformanceState('save.started', commonDetails)
    recordEditorPerformanceState('save.content-flush.started', commonDetails)
    const stallTimer = window.setTimeout(() => {
      recordEditorPerformanceState(`save.${activeStage}.stalled`, {
        ...commonDetails,
        elapsedMs: Math.round(performance.now() - totalStartedAt),
      })
      notifyWarning(translate(settings.language, 'file.saveSlow'))
    }, SAVE_STALL_WARNING_MS)

    try {
      const content = await enqueueDocumentSave(async () => {
        const flushStartedAt = performance.now()
        const flushedContent = await contentPromise
        recordEditorPerformanceOperation('save.content-flush', performance.now() - flushStartedAt, {
          requestId,
          contentCharacters: flushedContent.length,
          existingFile: Boolean(currentFile),
        })
        const pathIsCurrent = (documentRevisionRef.current.get(revisionKey) ?? 0) === savedRevision
        if (!pathIsCurrent) return flushedContent
        if (tauri) {
          activeStage = 'disk-write'
          const writeStartedAt = performance.now()
          recordEditorPerformanceState('save.disk-write.started', {
            ...commonDetails,
            contentCharacters: flushedContent.length,
          })
          const writeMetrics = await invoke<FileWriteMetrics>('write_file_command', {
            path: targetPath,
            content: flushedContent,
            snapshotLimit: normalizeVersionSnapshotLimit(settings.versionSnapshotLimit),
          })
          recordEditorPerformanceOperation('save.disk-write', performance.now() - writeStartedAt, {
            ...commonDetails,
            contentCharacters: flushedContent.length,
            backend: writeMetrics,
          })
        } else if (!currentFile) {
          const downloadStartedAt = performance.now()
          const blob = new Blob([flushedContent], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = targetName || targetPath
          anchor.click()
          URL.revokeObjectURL(url)
          recordEditorPerformanceOperation('save.browser-download', performance.now() - downloadStartedAt, {
            requestId,
            contentCharacters: flushedContent.length,
          })
        }

        return flushedContent
      })

      const stale = requestId !== saveRequestIdRef.current
        || (documentRevisionRef.current.get(revisionKey) ?? 0) !== savedRevision
        || activeTabIdRef.current !== targetTabId
      recordEditorPerformanceOperation('save.total', performance.now() - totalStartedAt, {
        requestId,
        contentCharacters: content.length,
        stale,
        outcome: stale ? 'stale' : 'saved',
      })
      if (stale) return

      if (!currentFile) {
        setCurrentFile(targetPath)
        updateActiveTabPath(targetPath, targetName || targetPath)
      }
      markActiveDocumentSaved(Date.now(), targetPath, content)
      try {
        onSaved?.(targetPath, content)
      } catch (callbackError) {
        console.error('保存后回调执行失败:', callbackError)
      }
      if (tauri && !currentFile && currentFolderPath) scanFolder(currentFolderPath)
    } catch (error) {
      recordEditorPerformanceOperation('save.total', performance.now() - totalStartedAt, {
        requestId,
        outcome: 'error',
        errorName: error instanceof Error ? error.name : 'unknown',
      })
      if (requestId !== saveRequestIdRef.current || activeTabIdRef.current !== targetTabId) return
      setSaveStatus('error')
      notifyError(translate(settings.language, 'file.saveFailed', { detail: String(error) }))
    } finally {
      window.clearTimeout(stallTimer)
    }
  }, [
    currentFile, currentFolderPath, documentRevisionRef, getCurrentContentDeferred,
    markActiveDocumentSaved, scanFolder, setCurrentFile, setSaveStatus, settings.language,
    settings.versionSnapshotLimit, onSaved, updateActiveTabPath,
  ])
}
