import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { FolderHistoryEntry } from '../types'
import { isTauri } from '../utils/tauri'

interface RecentFolderLaunchOptions {
  folderHistory: FolderHistoryEntry[]
  openFolder: (path: string) => Promise<void>
}

function folderFromLocation(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('folder')
  } catch {
    return null
  }
}

/** 把最近文件夹同步到任务栏，并在跳转列表启动的新窗口里打开对应目录。 */
export function useRecentFolderLaunch({ folderHistory, openFolder }: RecentFolderLaunchOptions) {
  const openFolderRef = useRef(openFolder)
  openFolderRef.current = openFolder

  useEffect(() => {
    if (!isTauri()) return
    invoke('sync_recent_folders', {
      folders: folderHistory.map((folder) => ({ path: folder.path, name: folder.name })),
    }).catch((error) => console.warn('同步最近文件夹失败:', error))
  }, [folderHistory])

  useEffect(() => {
    if (!isTauri()) return
    const folder = folderFromLocation()
    if (folder) {
      void openFolderRef.current(folder)
      return
    }
    invoke<string | null>('get_startup_open_folder')
      .then((path) => {
        if (path) void openFolderRef.current(path)
      })
      .catch((error) => console.warn('读取启动文件夹失败:', error))
  }, [])
}
