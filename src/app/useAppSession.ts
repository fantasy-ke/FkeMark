import { useEffect, useRef, useState, type MutableRefObject } from 'react'
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
  restoreTabs: (entries: RestoredTabEntry[], activePath: string | null, order?: string[]) => void
  openFiles: (paths: string[]) => Promise<void>
  navigationRevision: MutableRefObject<number>
  activeTabRef: MutableRefObject<string | null>
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

async function readStartupTargets(isSecondaryWindow: boolean) {
  const folder = new URL(window.location.href).searchParams.get('folder')
  if (isSecondaryWindow) return { folder, files: [] }
  const [files, folderPath] = await Promise.all([
    invoke<string[]>('get_startup_open_files').catch(() => []),
    folder ?? invoke<string | null>('get_startup_open_folder').catch(() => null),
  ])
  return { folder: folderPath, files: Array.isArray(files) ? files : [] }
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
  openFiles,
  navigationRevision,
  activeTabRef,
}: UseAppSessionParams) {
  const [hydrated, setHydrated] = useState(false)
  const [startupPending, setStartupPending] = useState(() => isTauri())
  const startupTargetsRef = useRef<Promise<{ folder: string | null; files: string[] }> | null>(null)
  // 已写入的会话签名，避免仅修改标记等状态时重复写盘
  const lastSavedSignatureRef = useRef<string | null>(null)
  // 恢复期间使用最新渲染出的回调，避免闭包过期
  const callbacksRef = useRef({ scanFolder, restoreTabs, openFiles })
  callbacksRef.current = { scanFolder, restoreTabs, openFiles }

  useEffect(() => {
    if (!enabled || !isTauri()) return
    const revision = navigationRevision.current
    const targets = startupTargetsRef.current ??= readStartupTargets(isSecondaryWindow)
    let cancelled = false

    void (async () => {
      try {
        const { folder, files } = await targets
        if (cancelled || revision !== navigationRevision.current || activeTabRef.current) return
        if (folder || files.length) {
          await Promise.all([
            folder ? callbacksRef.current.scanFolder(folder) : undefined,
            files.length ? callbacksRef.current.openFiles(files) : undefined,
          ])
          return
        }
        if (isSecondaryWindow) return
        const session = await loadAppSession()
        if (!session || cancelled || revision !== navigationRevision.current) return

        const folderTask = session.folderPath
          ? callbacksRef.current.scanFolder(session.folderPath, { silent: true })
          : Promise.resolve()
        const preferredPath = session.activeTabPath ?? session.tabs[0]
        const first = preferredPath ? await readDocumentForRestore(preferredPath) : null
        if (cancelled || revision !== navigationRevision.current) return
        if (first) {
          callbacksRef.current.restoreTabs([{ path: preferredPath, ...first }], preferredPath)
          setStartupPending(false)
        }

        const background = session.tabs.filter((path) => path !== preferredPath)
        const entries: RestoredTabEntry[] = []
        for (let index = 0; index < background.length; index += 4) {
          const batch = background.slice(index, index + 4)
          const docs = await Promise.all(batch.map(readDocumentForRestore))
          if (cancelled || (navigationRevision.current !== revision && !activeTabRef.current)) return
          docs.forEach((doc, i) => { if (doc) entries.push({ path: batch[i], ...doc }) })
        }
        if (entries.length) {
          callbacksRef.current.restoreTabs(entries, null, first || activeTabRef.current ? session.tabs : undefined)
          setStartupPending(false)
        }
        await folderTask
      } catch (error) {
        if (!cancelled) console.warn('恢复启动会话失败:', error)
      } finally {
        if (!cancelled) {
          setStartupPending(false)
          setHydrated(true)
        }
      }
    })()

    return () => { cancelled = true }
  }, [enabled, isSecondaryWindow, activeTabRef, navigationRevision])

  // 恢复完成后才允许写回，避免启动初期的空标签覆盖已有会话
  useEffect(() => {
    if (!hydrated || isSecondaryWindow) return
    const session = buildAppSession(tabs, activeTabId, currentFolderPath)
    const signature = session ? JSON.stringify(session) : ''
    if (signature === lastSavedSignatureRef.current) return
    lastSavedSignatureRef.current = signature
    void saveAppSession(session)
  }, [hydrated, isSecondaryWindow, tabs, activeTabId, currentFolderPath])

  return startupPending
}
