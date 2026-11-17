import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { TabItem } from '../components/TabBar'
import { isTauri } from '../utils/tauri'
import { buildAppSession, loadAppSession, saveAppSession } from './session'
import type { RestoredTabEntry } from './useAppTabs'

interface UseAppSessionParams {
  /** 设置加载完成后才恢复，确保使用用户偏好的编辑器模式 */
  enabled: boolean
  isSecondaryWindow: boolean
  tabs: TabItem[]
  activeTabId: string | null
  currentFolderPath: string | null
  scanFolder: (dirPath: string, options?: { silent?: boolean }) => Promise<void>
  restoreTabs: (entries: RestoredTabEntry[], activePath: string | null) => void
}

interface RestoredDocument {
  content: string
  savedAt: number | null
}

async function readDocumentForRestore(path: string): Promise<RestoredDocument | null> {
  try {
    const [content, metadata] = await Promise.all([
      invoke<string>('read_file_command', { path }),
      invoke<{ modified: string }>('get_file_info', { path }).catch(() => null),
    ])
    const modifiedAt = metadata ? new Date(metadata.modified).getTime() : null
    return { content, savedAt: Number.isFinite(modifiedAt) ? modifiedAt : null }
  } catch {
    // 文件已被删除或无权限时静默跳过，避免启动时连续报错
    return null
  }
}

/**
 * 判断本次启动是否由用户显式指定了目标（系统“打开方式”或任务栏最近文件夹）。
 * 这种情况下应优先打开指定目标，不再恢复上次会话。
 */
async function hasExplicitStartupTarget(): Promise<boolean> {
  try {
    if (new URL(window.location.href).searchParams.get('folder')) return true
  } catch {
    // 非法地址按没有显式目标处理
  }
  try {
    const files = await invoke<string[]>('get_startup_open_files')
    if (Array.isArray(files) && files.length > 0) return true
    const folder = await invoke<string | null>('get_startup_open_folder')
    return Boolean(folder)
  } catch {
    return false
  }
}

/**
 * 持久化并恢复上次会话（打开的文件夹、标签页和当前标签）。
 * 用户手动关闭全部标签后会话为空，下次启动不会再恢复任何文件。
 */
export function useAppSession({
  enabled,
  isSecondaryWindow,
  tabs,
  activeTabId,
  currentFolderPath,
  scanFolder,
  restoreTabs,
}: UseAppSessionParams) {
  const [hydrated, setHydrated] = useState(false)
  const restoreStartedRef = useRef(false)
  // 已写入的会话签名，避免仅修改标记等状态时重复写盘
  const lastSavedSignatureRef = useRef<string | null>(null)
  // 恢复期间使用最新渲染出的回调，避免闭包过期
  const callbacksRef = useRef({ scanFolder, restoreTabs })
  callbacksRef.current = { scanFolder, restoreTabs }

  useEffect(() => {
    if (!enabled || isSecondaryWindow || restoreStartedRef.current) return
    restoreStartedRef.current = true
    let cancelled = false

    void (async () => {
      try {
        if (!isTauri()) return
        const session = await loadAppSession()
        if (!session) return
        if (await hasExplicitStartupTarget()) return

        const folderTask = session.folderPath
          ? callbacksRef.current.scanFolder(session.folderPath, { silent: true })
          : Promise.resolve()
        const documents = await Promise.all(session.tabs.map(readDocumentForRestore))
        await folderTask
        if (cancelled) return

        const entries: RestoredTabEntry[] = []
        documents.forEach((document, index) => {
          if (document) entries.push({ path: session.tabs[index], ...document })
        })
        if (entries.length > 0) {
          callbacksRef.current.restoreTabs(entries, session.activeTabPath)
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()

    return () => { cancelled = true }
    // 只在设置加载完成的那一刻恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isSecondaryWindow])

  // 恢复完成后才允许写回，避免启动初期的空标签覆盖已有会话
  useEffect(() => {
    if (!hydrated || isSecondaryWindow) return
    const session = buildAppSession(tabs, activeTabId, currentFolderPath)
    const signature = session ? JSON.stringify(session) : ''
    if (signature === lastSavedSignatureRef.current) return
    lastSavedSignatureRef.current = signature
    void saveAppSession(session)
  }, [hydrated, isSecondaryWindow, tabs, activeTabId, currentFolderPath])
}
