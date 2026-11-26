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
import { useConverterUpdate } from './useConverterUpdate'

const BUILD_CHANNEL = getBuildChannel()
const AUTO_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const AUTO_UPDATE_RETRY_MS = 60 * 1000
export type UpdateTab = 'app' | 'converter' | 'notes'

function ignoredKey(target: 'app' | 'converter', channel: UpdateChannel) {
  return `fkemark:ignored-update:${target === 'app' ? channel : target}`
}

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
  const pendingManualCheck = useRef<{ channel: UpdateChannel; tab: UpdateTab } | null>(null)
  const lastNotifiedUpdateVersionRef = useRef<string | null>(null)
  const lastShownUpdateVersionRef = useRef<string | null>(null)
  const lastShownConverterVersionRef = useRef<string | null>(null)
  const lastAppCheck = useRef<{ time: number; channel: UpdateChannel } | null>(null)
  const lastConverterCheck = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const autoCheckEnabledRef = useRef(false)
  autoCheckEnabledRef.current = settingsReady && settings.autoCheckUpdate && !isSecondaryWindow
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [initialTab, setInitialTab] = useState<UpdateTab>('app')
  const [checkedChannel, setCheckedChannel] = useState<UpdateChannel>(BUILD_CHANNEL)
  const [channel, setChannel] = useState<UpdateChannel>(BUILD_CHANNEL)
  const channelRef = useRef(channel)
  const dialogVisible = useRef(showUpdateDialog)
  channelRef.current = channel
  dialogVisible.current = showUpdateDialog
  const [appCheckFailed, setAppCheckFailed] = useState(false)
  const [, refreshIgnored] = useState(0)
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

  const converter = useConverterUpdate()
  const updater = useUpdater({ onBeforeInstall: saveAllForUpdate })
  const updaterRef = useRef(updater)
  updaterRef.current = updater

  const isIgnored = (target: 'app' | 'converter', version: string, selected: UpdateChannel) => {
    return localStorage.getItem(ignoredKey(target, selected)) === version
  }
  const appIgnored = Boolean(updateInfo && isIgnored('app', updateInfo.version, checkedChannel))
  const converterIgnored = Boolean(converter.info && isIgnored('converter', converter.info.tagName, checkedChannel))

  function toggleIgnored(target: 'app' | 'converter') {
    const info = target === 'app' ? updateInfo : converter.info
    if (!info?.isNewer) return
    const key = ignoredKey(target, checkedChannel)
    const current = 'version' in info ? info.version : info.tagName
    const version = isIgnored(target, current, checkedChannel) ? null : current
    if (version) localStorage.setItem(key, version)
    else localStorage.removeItem(key)
    refreshIgnored(previous => previous + 1)
  }

  function appCheckAge(selected: UpdateChannel) {
    return lastAppCheck.current?.channel === selected ? Date.now() - lastAppCheck.current.time : Infinity
  }

  function converterCheckAge() {
    return lastConverterCheck.current === null ? Infinity : Date.now() - lastConverterCheck.current
  }

  async function doCheckUpdate(channel: UpdateChannel, showLoading = true, openTab?: UpdateTab, reconnect = false) {
    // 下载开始后固定更新信息，避免定时检查把安装包与版本号替换掉。
    if (updateCheckRunningRef.current) {
      if (openTab) {
        pendingManualCheck.current = { channel, tab: openTab }
        setCheckingUpdate(true)
        if (['idle', 'error'].includes(updaterRef.current.phase)) setChannel(channel)
      }
      return null
    }
    const appUnlocked = ['idle', 'error'].includes(updaterRef.current.phase)
    const checkApp = appUnlocked && (showLoading || reconnect || appCheckAge(channel) >= AUTO_UPDATE_CHECK_INTERVAL_MS)
    const checkConverter = showLoading || reconnect || converterCheckAge() >= AUTO_UPDATE_CHECK_INTERVAL_MS
    updateCheckRunningRef.current = true
    if (showLoading) {
      setCheckingUpdate(true)
      if (appUnlocked) setChannel(channel)
    }
    const active = () => mountedRef.current && (showLoading || autoCheckEnabledRef.current)
    let updateAvailable = false
    let opened = false
    const reveal = (tab: UpdateTab) => {
      updateAvailable = true
      setUpdateNotification('available')
      if (openTab || pendingManualCheck.current || opened || dialogVisible.current) return
      opened = true
      setInitialTab(tab)
      setShowUpdateDialog(true)
    }
    try {
      const appResult = checkApp ? getLocalVersion().then(current => checkForUpdate(channel, current)).catch(() => null).then(info => {
        if (!active() || !['idle', 'error'].includes(updaterRef.current.phase)) return false
        if (info || showLoading) setAppCheckFailed(!info)
        if (!info) return false
        lastAppCheck.current = { time: Date.now(), channel }
        setUpdateInfo(info)
        setCheckedChannel(channel)
        if (!pendingManualCheck.current) setChannel(channel)
        if (info.version !== updateInfo?.version && updaterRef.current.phase === 'error') updaterRef.current.reset()
        if (info.isNewer && !isIgnored('app', info.version, channel)) {
          if (showLoading || lastShownUpdateVersionRef.current !== info.version) {
            lastShownUpdateVersionRef.current = info.version
            reveal('app')
          }
          if (!showLoading && lastNotifiedUpdateVersionRef.current !== info.version) {
            lastNotifiedUpdateVersionRef.current = info.version
            void sendUpdateAvailableNotification(settings.language, info.version)
          }
        }
        return true
      }) : true
      const converterResult = checkConverter ? converter.check().then(result => {
        if (!active() || !result) return false
        const info = converter.applyCheck(result)
        if ('error' in result) return false
        lastConverterCheck.current = Date.now()
        if (info?.isNewer && !isIgnored('converter', info.tagName, channel)
          && (showLoading || lastShownConverterVersionRef.current !== info.tagName)) {
          lastShownConverterVersionRef.current = info.tagName
          reveal('converter')
        }
        return true
      }) : true
      const results = await Promise.all([appResult, converterResult])
      const success = results.every(Boolean)
      if (active() && showLoading && !openTab && !updateAvailable) {
        setUpdateNotification(success ? 'uptodate' : 'error')
      }
      return success
    } catch (e) {
      console.error('检查更新失败:', e)
      if (showLoading && !openTab && mountedRef.current) setUpdateNotification('error')
      return null
    } finally {
      updateCheckRunningRef.current = false
      const pending = pendingManualCheck.current
      pendingManualCheck.current = null
      if (pending && mountedRef.current) void latestCheckRef.current(pending.channel, true, pending.tab)
      else if (showLoading && mountedRef.current) setCheckingUpdate(false)
    }
  }

  function openUpdateCenter(selected: UpdateChannel, tab: UpdateTab = 'app') {
    setInitialTab(tab)
    setShowUpdateDialog(true)
    void doCheckUpdate(selected, true, tab)
  }

  const latestCheckRef = useRef(doCheckUpdate)
  latestCheckRef.current = doCheckUpdate

  useEffect(() => {
    if (!settingsReady || !settings.autoCheckUpdate || isSecondaryWindow) return
    let active = true
    let timer: number
    const check = async (reconnect = false) => {
      window.clearTimeout(timer)
      const selected = dialogVisible.current ? channelRef.current : BUILD_CHANNEL
      const success = await latestCheckRef.current(selected, false, undefined, reconnect)
      if (active) {
        window.clearTimeout(timer)
        const delay = success ? Math.max(AUTO_UPDATE_RETRY_MS, AUTO_UPDATE_CHECK_INTERVAL_MS - Math.max(appCheckAge(selected), converterCheckAge())) : AUTO_UPDATE_RETRY_MS
        timer = window.setTimeout(check, delay)
      }
    }
    const checkOnReturn = () => {
      if (document.visibilityState !== 'visible') return
      const selected = dialogVisible.current ? channelRef.current : BUILD_CHANNEL
      if (Math.max(appCheckAge(selected), converterCheckAge()) >= AUTO_UPDATE_CHECK_INTERVAL_MS) void check()
    }
    const checkOnOnline = () => { void check(true) }
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
    updateCenter: { appIgnored, converterIgnored, converter, channel, checkedChannel, appCheckFailed, initialTab, open: openUpdateCenter, toggleIgnored },
  }
}

export type UpdateCenter = ReturnType<typeof useAppUpdates>['updateCenter']
