import { invoke } from '@tauri-apps/api/core'
import type { TabItem } from '../components/TabBar'
import { pathsEqual } from '../utils/filePaths'
import { isTauri } from '../utils/tauri'

// 浏览器调试环境与旧版本迁移使用的键；桌面端会话文件以 session.json 为准
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

function loadLocalSession(): AppSession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(APP_SESSION_STORAGE_KEY)
    return raw ? normalizeAppSession(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function clearLocalSession(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(APP_SESSION_STORAGE_KEY)
  } catch {
    // 隐私模式下删除失败可以忽略
  }
}

function saveLocalSession(session: AppSession | null): void {
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
 * 读取上次会话：桌面端读取应用数据目录下的 session.json，
 * 浏览器环境回退 localStorage，并自动迁移旧版本保存在 localStorage 的会话。
 */
export async function loadAppSession(): Promise<AppSession | null> {
  if (!isTauri()) return loadLocalSession()

  let stored: unknown = null
  try {
    stored = await invoke<unknown>('load_session_state')
  } catch (error) {
    console.warn('读取会话文件失败:', error)
  }
  const session = normalizeAppSession(stored)
  if (session) return session

  const legacy = loadLocalSession()
  if (legacy) void saveAppSession(legacy)
  return legacy
}

// 串行化写盘，避免快速切换标签时后发起的写入先完成导致会话倒退
let writeQueue: Promise<void> = Promise.resolve()

/**
 * 保存会话：桌面端写入 session.json，浏览器环境写入 localStorage。
 * session 为 null 时删除会话文件。
 */
export function saveAppSession(session: AppSession | null): Promise<void> {
  const normalized = session ? normalizeAppSession(session) : null
  if (!isTauri()) {
    saveLocalSession(normalized)
    return Promise.resolve()
  }

  writeQueue = writeQueue
    .then(() => (normalized
      ? invoke('save_session_state', { session: normalized })
      : invoke('clear_session_state')))
    .then(() => {
      // 文件写入成功后再清理旧版本残留，避免写盘失败时丢失最后的会话
      clearLocalSession()
    })
    .catch((error) => {
      console.warn('保存会话文件失败:', error)
    })
  return writeQueue
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
