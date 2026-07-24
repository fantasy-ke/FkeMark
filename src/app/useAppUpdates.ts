import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { Lang } from '../i18n'
import { translate } from '../i18n'
import { useUpdater } from '../hooks/useUpdater'
import { isTauri } from '../utils/tauri'
import { checkForUpdate, finalizeUpdate, getBuildChannel, getLocalVersion, type UpdateChannel, type UpdateInfo } from '../utils/updater'
import { getDocumentSyncStatus, type DocumentSyncStatus } from '../utils/documentStats'
import { notifyError } from '../utils/toast'
import { normalizeVersionSnapshotLimit } from '../utils/versionHistory'
import type { AppSettings, EditorMode } from '../types'
import type { TabContentCacheEntry } from './useAppTabs'

const BUILD_CHANNEL = getBuildChannel()
const AUTO_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

async function sendUpdateAvailableNotification(language: Lang, version: string) {
  if (!isTauri()) return

  try {
    let permissionGranted = await isPermissionGranted()
    if (!permissionGranted) {
      permissionGranted = await requestPermission() === 'granted'
    }
    if (!permissionGranted) return

    sendNotification({
      title: translate(language, 'update.systemNotification.title', { version }),
      body: translate(language, 'update.systemNotification.body', { version }),
    })
  } catch (error) {
    console.warn('Failed to send update notification:', error)
  }
}

interface UseAppUpdatesParams {
  activeTabId: string | null
  tabContentCache: MutableRefObject<Map<string, TabContentCacheEntry>>
  getCurrentContent: () => string
  isModified: boolean
  editorMode: EditorMode
  currentFile: string | null
  lastSavedAt: number | null
  settings: AppSettings
  isSecondaryWindow: boolean
  setIsModified: Dispatch<SetStateAction<boolean>>
  setSaveStatus: Dispatch<SetStateAction<DocumentSyncStatus>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
}

export function useAppUpdates({
  activeTabId,
  tabContentCache,
  getCurrentContent,
  isModified,
  editorMode,
  currentFile,
  lastSavedAt,
  settings,
  isSecondaryWindow,
  setIsModified,
  setSaveStatus,
  setLastSavedAt,
}: UseAppUpdatesParams) {
  const [appVersion, setAppVersion] = useState<string>('0.2.0')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const updateCheckRunningRef = useRef(false)
  const lastNotifiedUpdateVersionRef = useRef<string | null>(null)
  const [showUpdateToast, setShowUpdateToast] = useState(false)
  const [updateNotification, setUpdateNotification] = useState<'available' | 'uptodate' | 'error' | null>(null)
  const [rollbackAvailable, setRollbackAvailable] = useState(false)
  const [finalizeNotice, setFinalizeNotice] = useState<{ status: 'success' | 'failed'; version: string } | null>(null)

  useEffect(() => {
    getLocalVersion().then(v => setAppVersion(v))
  }, [])

  useEffect(() => {
    if (!settings.autoCheckUpdate) return
    if (isSecondaryWindow) return

    const check = () => { void doCheckUpdate(BUILD_CHANNEL, false) }
    const startupTimer = window.setTimeout(check, 2000)
    const intervalTimer = window.setInterval(check, AUTO_UPDATE_CHECK_INTERVAL_MS)
    return () => {
      window.clearTimeout(startupTimer)
      window.clearInterval(intervalTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoCheckUpdate, isSecondaryWindow])

  async function doCheckUpdate(channel: UpdateChannel, showLoading = true) {
    if (updateCheckRunningRef.current) return null
    updateCheckRunningRef.current = true
    if (showLoading) setCheckingUpdate(true)
    try {
      const currentVersion = await getLocalVersion()
      const info = await checkForUpdate(channel, currentVersion)
      setUpdateInfo(info)
      if (showLoading) {
        if (info && info.isNewer) {
          setUpdateNotification('available')
          setShowUpdateToast(true)
        } else if (info && !info.isNewer) {
          setUpdateNotification('uptodate')
        } else {
          setUpdateNotification('error')
        }
      } else if (info && info.isNewer) {
        setUpdateNotification('available')
        setShowUpdateToast(true)
        if (lastNotifiedUpdateVersionRef.current !== info.version) {
          lastNotifiedUpdateVersionRef.current = info.version
          void sendUpdateAvailableNotification(settings.language, info.version)
        }
      }
      return info
    } catch (e) {
      console.error('Auto-check update failed:', e)
      if (showLoading) {
        setUpdateNotification('error')
      }
      return null
    } finally {
      updateCheckRunningRef.current = false
      if (showLoading) setCheckingUpdate(false)
    }
  }

  const saveAllForUpdate = useCallback(async (): Promise<boolean> => {
    if (!isTauri()) return true
    try {
      if (activeTabId) {
        tabContentCache.current.set(activeTabId, {
          content: getCurrentContent(),
          isModified,
          editorMode,
          path: currentFile ?? undefined,
          lastSavedAt,
        })
      }
      for (const [id, cached] of tabContentCache.current.entries()) {
        if (cached.isModified && cached.path) {
          await invoke('write_file_command', { path: cached.path, content: cached.content, snapshotLimit: normalizeVersionSnapshotLimit(settings.versionSnapshotLimit) })
          tabContentCache.current.set(id, { ...cached, isModified: false, lastSavedAt: Date.now() })
        }
      }
      const activeCached = activeTabId ? tabContentCache.current.get(activeTabId) : null
      const activeModified = activeCached?.isModified ?? false
      setIsModified(activeModified)
      setSaveStatus(activeCached ? getDocumentSyncStatus(activeModified, activeCached.path) : 'saved')
      setLastSavedAt(activeCached?.lastSavedAt ?? null)
      return true
    } catch (e) {
      setSaveStatus('error')
      console.error('???????:', e)
      notifyError(translate(settings.language, 'file.saveBeforeInstallFailed', { detail: String(e) }))
      return false
    }
  }, [activeTabId, getCurrentContent, isModified, editorMode, currentFile, lastSavedAt, settings.language, setIsModified, setSaveStatus, setLastSavedAt, tabContentCache])

  const updater = useUpdater({ onBeforeInstall: saveAllForUpdate })

  useEffect(() => {
    if (isSecondaryWindow) return
    finalizeUpdate().then((r) => {
      if (!r) return
      setRollbackAvailable(r.rollbackAvailable)
      if (r.status === 'success') {
        setFinalizeNotice({ status: 'success', version: r.newVersion })
      } else if (r.status === 'failed') {
        setFinalizeNotice({ status: 'failed', version: r.newVersion })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (finalizeNotice) {
      const timer = setTimeout(() => setFinalizeNotice(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [finalizeNotice])

  useEffect(() => {
    if (updateNotification === 'uptodate' || updateNotification === 'error') {
      const timer = setTimeout(() => setUpdateNotification(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [updateNotification])

  return {
    appVersion,
    updateInfo,
    checkingUpdate,
    showUpdateToast,
    setShowUpdateToast,
    updateNotification,
    setUpdateNotification,
    rollbackAvailable,
    finalizeNotice,
    setFinalizeNotice,
    updater,
    doCheckUpdate,
  }
}
