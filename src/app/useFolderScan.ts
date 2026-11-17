import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { translate, type Lang } from '../i18n'
import { showAlert } from '../components/ConfirmDialog'
import type { FileTreeNode, FolderHistoryEntry } from '../types'
import { isTauri } from '../utils/tauri'

interface UseFolderScanParams {
  language: Lang
  setFileTree: Dispatch<SetStateAction<FileTreeNode[]>>
  setCurrentFolderPath: Dispatch<SetStateAction<string | null>>
  setFolderHistory: Dispatch<SetStateAction<FolderHistoryEntry[]>>
}

/** 递归扫描文件夹中的 Markdown 文件，并记录到打开历史。 */
export function useFolderScan({
  language,
  setFileTree,
  setCurrentFolderPath,
  setFolderHistory,
}: UseFolderScanParams) {
  return useCallback(async (dirPath: string, options: { silent?: boolean } = {}) => {
    if (!isTauri()) return
    try {
      const tree = await invoke<FileTreeNode[]>('scan_directory', { path: dirPath })
      setFileTree(tree)
      setCurrentFolderPath(dirPath)
      const name = dirPath.split(/[\\/]/).pop() || dirPath
      setFolderHistory((prev) => {
        const filtered = prev.filter((item) => item.path !== dirPath)
        return [{ path: dirPath, name, openedAt: Date.now() }, ...filtered].slice(0, 10)
      })
    } catch (e) {
      console.error('Failed to scan directory:', e)
      // 启动恢复会话时目录可能已被删除，静默跳过，不打断启动
      if (options.silent) return
      showAlert(
        translate(language, 'file.scanFolderFailed', { detail: String(e) }),
        translate(language, 'common.error'),
      )
    }
  }, [language, setFileTree, setCurrentFolderPath, setFolderHistory])
}
