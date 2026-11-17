import type { TabItem } from '../components/TabBar'
import { pathsEqual } from '../utils/filePaths'

export const APP_SESSION_STORAGE_KEY = 'fkemark:session'

const SESSION_VERSION = 1
// 会话只保存路径，限制数量避免异常数据把启动恢复拖慢
const MAX_SESSION_TABS = 50

export interface AppSession {
  version: number
  folderPath: string | null
  tabs: string[]
  activeTabPath: string | null
}

/** 去重并过滤非法路径，保留首次出现的顺序。 */
function normalizePathList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const path = item.trim()
    if (!path || path.includes('\0')) continue
    if (result.some((existing) => pathsEqual(existing, path))) continue
    result.push(path)
    if (result.length >= MAX_SESSION_TABS) break
  }
  return result
}

/**
 * 校验并归一化会话数据。
 * 返回 null 表示没有可恢复的内容（从未保存、数据损坏，或用户已关闭全部标签且未打开文件夹）。
 */
export function normalizeAppSession(value: unknown): AppSession | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const tabs = normalizePathList(record.tabs)
  const folderPath = typeof record.folderPath === 'string' && record.folderPath.trim()
    ? record.folderPath.trim()
    : null
  const rawActivePath = typeof record.activeTabPath === 'string' ? record.activeTabPath : null
  const activeTabPath = rawActivePath && tabs.some((path) => pathsEqual(path, rawActivePath))
    ? rawActivePath
    : null
  if (tabs.length === 0 && !folderPath) return null
  return { version: SESSION_VERSION, folderPath, tabs, activeTabPath }
}

export function loadAppSession(): AppSession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(APP_SESSION_STORAGE_KEY)
    return raw ? normalizeAppSession(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveAppSession(session: AppSession | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (!session) {
      localStorage.removeItem(APP_SESSION_STORAGE_KEY)
      return
    }
    localStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // 存储配额或隐私模式失败时忽略，不能影响编辑
  }
}

/**
 * 根据当前标签页和文件夹构造待持久化会话。
 * 只记录已落盘的文件；未命名标签无法在重启后恢复，直接忽略。
 */
export function buildAppSession(
  tabs: TabItem[],
  activeTabId: string | null,
  folderPath: string | null,
): AppSession | null {
  const paths = normalizePathList(
    tabs.map((tab) => tab.path).filter((path): path is string => Boolean(path)),
  )
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const activeTabPath = activeTab?.path && paths.some((path) => pathsEqual(path, activeTab.path as string))
    ? activeTab.path
    : null
  const normalizedFolder = folderPath?.trim() ? folderPath.trim() : null
  if (paths.length === 0 && !normalizedFolder) return null
  return { version: SESSION_VERSION, folderPath: normalizedFolder, tabs: paths, activeTabPath }
}
