import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AppSettings } from '../types'
import { isTauri } from '../utils/tauri'
import { buildWebdavFileUrl } from '../utils/webdav'
import { notifyError } from '../utils/toast'
import { translate } from '../i18n'

const WEBDAV_PUSH_DEBOUNCE_MS = 800

type PendingPush = {
  url: string
  username: string
  password: string
  content: string
  language: AppSettings['language']
}

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/u).pop()?.trim() || ''
}

export function useWebdavSync(settings: AppSettings) {
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingRef = useRef(new Map<string, PendingPush>())
  const inFlightRef = useRef(new Set<string>())
  const settingsRef = useRef(settings)
  const activeRef = useRef(false)
  settingsRef.current = settings

  const flush = useCallback(async (url: string) => {
    if (inFlightRef.current.has(url)) return
    const pending = pendingRef.current.get(url)
    if (!pending) return

    inFlightRef.current.add(url)
    pendingRef.current.delete(url)
    try {
      await invoke('push_webdav_file', {
        url: pending.url,
        username: pending.username,
        password: pending.password,
        content: pending.content,
      })
    } catch (error) {
      // 仅在组件已卸载时抑制错误提示；配置变更导致的 effect 重跑仍应报告真实的推送失败。
      if (activeRef.current) {
        notifyError(translate(pending.language, 'webdavSync.failed', { detail: String(error) }))
      }
    } finally {
      inFlightRef.current.delete(url)
      if (pendingRef.current.has(url)) void flush(url)
    }
  }, [])

  const scheduleWebdavSync = useCallback((filePath: string, content: string) => {
    if (!activeRef.current) return
    const currentSettings = settingsRef.current
    if (!isTauri() || !currentSettings.webdavSyncEnabled || !currentSettings.webdavSyncUrl.trim()) return

    const localFileName = getFileName(filePath)
    const remoteFileName = currentSettings.webdavSyncFileName.trim() || localFileName
    let url: string
    try {
      url = buildWebdavFileUrl(currentSettings.webdavSyncUrl, currentSettings.webdavSyncRoot, remoteFileName)
    } catch (error) {
      notifyError(translate(currentSettings.language, 'webdavSync.failed', { detail: String(error) }))
      return
    }

    const existingTimer = timersRef.current.get(url)
    if (existingTimer) clearTimeout(existingTimer)
    pendingRef.current.set(url, {
      url,
      username: currentSettings.webdavSyncUsername,
      password: currentSettings.webdavSyncPassword,
      content,
      language: currentSettings.language,
    })
    timersRef.current.set(url, setTimeout(() => {
      timersRef.current.delete(url)
      void flush(url)
    }, WEBDAV_PUSH_DEBOUNCE_MS))
  }, [flush])

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      // 先推送仍在防抖等待中的内容，避免 800ms 窗口内的最后一次编辑被静默丢弃。
      for (const url of pendingRef.current.keys()) {
        if (!inFlightRef.current.has(url)) void flush(url)
      }
      pendingRef.current.clear()
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [
    settings.language, settings.webdavSyncEnabled, settings.webdavSyncFileName,
    settings.webdavSyncPassword, settings.webdavSyncRoot, settings.webdavSyncUrl,
    settings.webdavSyncUsername,
  ])

  return scheduleWebdavSync
}
