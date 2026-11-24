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
import { enqueueDocumentSave } from './documentSaveQueue'
import type { TabContentCacheEntry } from './useAppTabs'

const BUILD_CHANNEL = getBuildChannel()
const AUTO_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const AUTO_UPDATE_RETRY_MS = 60 * 1000

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
  activeTabIdRef: MutableRefObject<string | null>
  documentRevisionRef: MutableRefObject<Map<string, number>>
  tabContentCache: MutableRefObject<Map<string, TabContentCacheEntry>>
  markTabSaved?: (tabId: string) => void
  getCurrentContent: () => string
  isModified: boolean
  editorMode: EditorMode
  currentFile: string | null
  lastSavedAt: number | null
  settings: AppSettings
  settingsReady: boolean
  isSecondaryWindow: boolean
  setIsModified: Dispatch<SetStateAction<boolean>>
  setSaveStatus: Dispatch<SetStateAction<DocumentSyncStatus>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
}

export function useAppUpdates({
  activeTabId,
  activeTabIdRef,
  documentRevisionRef,
  tabContentCache,
  markTabSaved,
  getCurrentContent,
  isModified,
  editorMode,
  currentFile,
  lastSavedAt,
  settings,
  settingsReady,
  isSecondaryWindow,
  setIsModified,
  setSaveStatus,
  setLastSavedAt,
}: UseAppUpdatesParams) {
  const [appVersion, setAppVersion] = useState<string>('0.2.8')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const updateCheckRunningRef = useRef(false)
  const lastNotifiedUpdateVersionRef = useRef<string | null>(null)
  const lastShownUpdateVersionRef = useRef<string | null>(null)
  const lastSuccessfulCheckRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const autoCheckEnabledRef = useRef(false)
  autoCheckEnabledRef.current = settingsReady && settings.autoCheckUpdate && !isSecondaryWindow
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [updateNotification, setUpdateNotification] = useState<'available' | 'uptodate' | 'error' | null>(null)
  const [rollbackAvailable, setRollbackAvailable] = useState(false)
  const [finalizeNotice, setFinalizeNotice] = useState<{ status: 'success' | 'failed'; version: string } | null>(null)

  useEffect(() => {
    mountedRef.current = true
    getLocalVersion().then(v => { if (mountedRef.current) setAppVersion(v) })
    return () => { mountedRef.current = false }
  }, [])

  const saveAllForUpdate = useCallback(async (): Promise<boolean> => {
    if (!isTauri()) return true
    const syncActiveDocumentState = () => {
      const currentActiveTabId = activeTabIdRef.current
      const activeCached = currentActiveTabId ? tabContentCache.current.get(currentActiveTabId) : null
      const activeModified = activeCached?.isModified ?? false
      setIsModified(activeModified)
      setSaveStatus(activeCached ? getDocumentSyncStatus(activeModified, activeCached.path) : 'saved')
      setLastSavedAt(activeCached?.lastSavedAt ?? null)
    }

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
        if (!cached.isModified) continue
        if (!cached.path) {
          syncActiveDocumentState()
          return false
        }

        const saveRequest = {
          tabId: id,
          path: cached.path,
          content: cached.content,
          revision: documentRevisionRef.current.get(id) ?? 0,
        }
        const saveResult = await enqueueDocumentSave(async (): Promise<'saved' | 'stale'> => {
          const current = tabContentCache.current.get(saveRequest.tabId)
          const matchesRequest = Boolean(current)
            && current!.isModified
            && current!.path === saveRequest.path
            && current!.content === saveRequest.content
            && (documentRevisionRef.current.get(saveRequest.tabId) ?? 0) === saveRequest.revision
          if (!matchesRequest) {
            const alreadySaved = Boolean(current)
              && !current!.isModified
              && current!.path === saveRequest.path
              && current!.content === saveRequest.content
            return alreadySaved ? 'saved' : 'stale'
          }

          await invoke('write_file_command', {
            path: saveRequest.path,
            content: saveRequest.content,
            snapshotLimit: normalizeVersionSnapshotLimit(settings.versionSnapshotLimit),
          })

          const latest = tabContentCache.current.get(saveRequest.tabId)
          const stillCurrent = Boolean(latest)
            && latest!.isModified
            && latest!.path === saveRequest.path
            && latest!.content === saveRequest.content
            && (documentRevisionRef.current.get(saveRequest.tabId) ?? 0) === saveRequest.revision
          if (!stillCurrent) {
            const alreadySaved = Boolean(latest)
              && !latest!.isModified
              && latest!.path === saveRequest.path
              && latest!.content === saveRequest.content
            return alreadySaved ? 'saved' : 'stale'
          }

          tabContentCache.current.set(saveRequest.tabId, {
            ...latest!,
            isModified: false,
            lastSavedAt: Date.now(),
          })
          markTabSaved?.(saveRequest.tabId)
          return 'saved'
        })
        if (saveResult === 'stale') {
          syncActiveDocumentState()
          return false
        }
      }
      syncActiveDocumentState()
      return true
    } catch (e) {
      setSaveStatus('error')
      console.error('更新前保存文件失败:', e)
      notifyError(translate(settings.language, 'file.saveBeforeInstallFailed', { detail: String(e) }))
      return false
    }
  }, [activeTabId, activeTabIdRef, getCurrentContent, isModified, editorMode, currentFile, lastSavedAt, settings.language, settings.versionSnapshotLimit, setIsModified, setSaveStatus, setLastSavedAt, tabContentCache, documentRevisionRef, markTabSaved])

  const updater = useUpdater({ onBeforeInstall: saveAllForUpdate })
  const updaterRef = useRef(updater)
  updaterRef.current = updater

  async function doCheckUpdate(channel: UpdateChannel, showLoading = true) {
    // 下载开始后固定更新信息，避免定时检查把安装包与版本号替换掉。
    if (updateCheckRunningRef.current || !['idle', 'error'].includes(updaterRef.current.phase)) return null
    updateCheckRunningRef.current = true
    if (showLoading) setCheckingUpdate(true)
    try {
      const currentVersion = await getLocalVersion()
      const info = await checkForUpdate(channel, currentVersion)
      if (!mountedRef.current || (!showLoading && !autoCheckEnabledRef.current)) return null
      if (!['idle', 'error'].includes(updaterRef.current.phase)) return null
      // 网络失败保留已发现的版本，避免正在显示的提醒突然消失。
      if (info) {
        lastSuccessfulCheckRef.current = Date.now()
        setUpdateInfo(info)
        if (info.version !== updateInfo?.version && updaterRef.current.phase === 'error') updaterRef.current.reset()
      }
      if (info?.isNewer) {
        setUpdateNotification('available')
        if (showLoading || lastShownUpdateVersionRef.current !== info.version) {
          lastShownUpdateVersionRef.current = info.version
          setShowUpdateDialog(true)
        }
        if (!showLoading && lastNotifiedUpdateVersionRef.current !== info.version) {
          lastNotifiedUpdateVersionRef.current = info.version
          void sendUpdateAvailableNotification(settings.language, info.version)
        }
      } else if (showLoading) {
        setUpdateNotification(info ? 'uptodate' : 'error')
      }
      return info
    } catch (e) {
      console.error('检查更新失败:', e)
      if (showLoading && mountedRef.current) setUpdateNotification('error')
      return null
    } finally {
      updateCheckRunningRef.current = false
      if (showLoading && mountedRef.current) setCheckingUpdate(false)
    }
  }

  const latestCheckRef = useRef(doCheckUpdate)
  latestCheckRef.current = doCheckUpdate

  useEffect(() => {
    if (!settingsReady || !settings.autoCheckUpdate || isSecondaryWindow) return
    let active = true
    let timer: number
    const check = async () => {
      window.clearTimeout(timer)
      const info = await latestCheckRef.current(BUILD_CHANNEL, false)
      if (active) {
        window.clearTimeout(timer)
        timer = window.setTimeout(check, info ? AUTO_UPDATE_CHECK_INTERVAL_MS : AUTO_UPDATE_RETRY_MS)
      }
    }
    const checkOnReturn = () => {
      if (document.visibilityState !== 'visible') return
      const lastCheck = lastSuccessfulCheckRef.current
      if (lastCheck === null || Date.now() - lastCheck >= AUTO_UPDATE_CHECK_INTERVAL_MS) void check()
    }
    const checkOnOnline = () => { void check() }
    timer = window.setTimeout(check, 2000)
    window.addEventListener('online', checkOnOnline)
    window.addEventListener('focus', checkOnReturn)
    document.addEventListener('visibilitychange', checkOnReturn)
    return () => {
      active = false
      window.clearTimeout(timer)
      window.removeEventListener('online', checkOnOnline)
      window.removeEventListener('focus', checkOnReturn)
      document.removeEventListener('visibilitychange', checkOnReturn)
    }
  }, [settingsReady, settings.autoCheckUpdate, isSecondaryWindow])

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
    showUpdateDialog,
    setShowUpdateDialog,
    updateNotification,
    setUpdateNotification,
    rollbackAvailable,
    finalizeNotice,
    setFinalizeNotice,
    updater,
    doCheckUpdate,
  }
}
