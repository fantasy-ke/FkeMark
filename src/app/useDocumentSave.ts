import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { AppSettings } from '../types'
import type { DocumentSyncStatus } from '../utils/documentStats'
import type { EditorSerializationReason } from '../components/editor/useEditorMarkdownPipeline'
import { recordEditorPerformanceOperation } from '../components/editor/useEditorPerformanceDiagnostics'
import { showPrompt } from '../components/ConfirmDialog'
import { translate } from '../i18n'
import { normalizeVersionSnapshotLimit } from '../utils/versionHistory'
import { isTauri } from '../utils/tauri'
import { notifyError } from '../utils/toast'

interface UseDocumentSaveOptions {
  activeTabId: string | null
  currentFile: string | null
  currentFolderPath: string | null
  settings: AppSettings
  documentRevisionRef: MutableRefObject<number>
  getCurrentContentDeferred: (reason?: EditorSerializationReason) => Promise<string>
  markActiveDocumentSaved: (savedAt?: number, path?: string | null, content?: string) => void
  scanFolder: (path: string) => unknown
  setCurrentFile: Dispatch<SetStateAction<string | null>>
  setSaveStatus: Dispatch<SetStateAction<DocumentSyncStatus>>
  updateActiveTabPath: (path: string, name: string) => void
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
    const totalStartedAt = performance.now()
    setSaveStatus('saving')

    try {
      const flushStartedAt = performance.now()
      const content = await getCurrentContentDeferred('save')
      recordEditorPerformanceOperation('save.content-flush', performance.now() - flushStartedAt, {
        requestId,
        contentCharacters: content.length,
        existingFile: Boolean(currentFile),
      })
      const savedRevision = documentRevisionRef.current

      if (tauri) {
        const writeStartedAt = performance.now()
        await invoke('write_file_command', {
          path: targetPath,
          content,
          snapshotLimit: normalizeVersionSnapshotLimit(settings.versionSnapshotLimit),
        })
        recordEditorPerformanceOperation('save.disk-write', performance.now() - writeStartedAt, {
          requestId,
          contentCharacters: content.length,
          existingFile: Boolean(currentFile),
        })
      } else if (!currentFile) {
        const downloadStartedAt = performance.now()
        const blob = new Blob([content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = targetName || targetPath
        anchor.click()
        URL.revokeObjectURL(url)
        recordEditorPerformanceOperation('save.browser-download', performance.now() - downloadStartedAt, {
          requestId,
          contentCharacters: content.length,
        })
      }

      const stale = requestId !== saveRequestIdRef.current
        || documentRevisionRef.current !== savedRevision
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
    }
  }, [
    currentFile, currentFolderPath, documentRevisionRef, getCurrentContentDeferred,
    markActiveDocumentSaved, scanFolder, setCurrentFile, setSaveStatus, settings.language,
    settings.versionSnapshotLimit, updateActiveTabPath,
  ])
}
