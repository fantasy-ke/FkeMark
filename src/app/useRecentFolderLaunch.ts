import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { FolderHistoryEntry } from '../types'
import { isTauri } from '../utils/tauri'

/** 把最近文件夹同步到系统任务栏。 */
export function useRecentFolderTaskbar(folderHistory: FolderHistoryEntry[]) {
  useEffect(() => {
    if (!isTauri()) return
    invoke('sync_recent_folders', {
      folders: folderHistory.map((folder) => ({ path: folder.path, name: folder.name })),
    }).catch((error) => console.warn('同步最近文件夹失败:', error))
  }, [folderHistory])
}
