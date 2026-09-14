import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AppSettings } from '../types'
import { isTauri } from '../utils/tauri'
import { buildWebdavFileUrl } from '../utils/webdav'
import { notifyError } from '../utils/toast'
import { translate } from '../i18n'

const WEBDAV_PUSH_DEBOUNCE_MS = 800

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/u).pop()?.trim() || ''
}

export function useWebdavSync(settings: AppSettings) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef(Promise.resolve())

  const scheduleWebdavSync = useCallback((filePath: string, content: string) => {
    if (!isTauri() || !settings.webdavSyncEnabled || !settings.webdavSyncUrl.trim()) return
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const localFileName = getFileName(filePath)
      const remoteFileName = settings.webdavSyncFileName.trim() || localFileName
      let url: string
      try {
        url = buildWebdavFileUrl(settings.webdavSyncUrl, settings.webdavSyncRoot, remoteFileName)
      } catch (error) {
        notifyError(translate(settings.language, 'webdavSync.failed', { detail: String(error) }))
        return
      }

      const push = async () => {
        try {
          await invoke('push_webdav_file', {
            url,
            username: settings.webdavSyncUsername,
            password: settings.webdavSyncPassword,
            content,
          })
        } catch (error) {
          notifyError(translate(settings.language, 'webdavSync.failed', { detail: String(error) }))
        }
      }
      queueRef.current = queueRef.current.catch(() => {}).then(push)
    }, WEBDAV_PUSH_DEBOUNCE_MS)
  }, [settings.language, settings.webdavSyncEnabled, settings.webdavSyncFileName, settings.webdavSyncPassword, settings.webdavSyncRoot, settings.webdavSyncUrl, settings.webdavSyncUsername])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [scheduleWebdavSync])

  return scheduleWebdavSync
}
