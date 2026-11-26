import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppTabs } from '../src/app/useAppTabs'
import { useAppSession } from '../src/app/useAppSession'
import {
  APP_SESSION_STORAGE_KEY,
  buildAppSession,
  loadAppSession,
  normalizeAppSession,
  saveAppSession,
} from '../src/app/session'
import type { TabItem } from '../src/components/TabBar'
import type { DocumentSyncStatus } from '../src/utils/documentStats'
import { EditorModeEnum, type EditorMode } from '../src/types'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: isTauriMock }))
vi.mock('../src/components/ConfirmDialog', () => ({
  showAlert: vi.fn(),
  showCloseTabDialog: vi.fn(),
  showConfirm: vi.fn(async () => true),
  showPrompt: vi.fn(),
}))

interface HarnessSnapshot {
  tabs: TabItem[]
  activeTabId: string | null
  currentFile: string | null
  fileContent: string
  currentFolderPath: string | null
  closeAllTabs: () => Promise<void>
}

function Harness({ onReady }: { onReady: (snapshot: HarnessSnapshot) => void }) {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(EditorModeEnum.Live)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<DocumentSyncStatus>('saved')
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>(null)

  const scanFolder = async (dirPath: string) => { setCurrentFolderPath(dirPath) }
  const activeTabRef = useRef<string | null>(null)

  const {
    tabs, activeTabId, restoreTabs, closeAllTabs, navigationRevision,
  } = useAppTabs({
    currentFile, setCurrentFile, setFileContent, isModified, setIsModified,
    editorMode, setEditorMode, lastSavedAt, setLastSavedAt, setSaveStatus,
    currentFolderPath, scanFolder, language: 'zh-CN', getCurrentContent: () => fileContent,
    snapshotLimit: 50,
    activeTabRef,
  })

  useAppSession({
    enabled: true,
    isSecondaryWindow: false,
    tabs,
    activeTabId,
    currentFolderPath,
    scanFolder,
    restoreTabs,
    navigationRevision,
    activeTabRef,
    openFiles: async () => {},
  })

  onReady({ tabs, activeTabId, currentFile, fileContent, currentFolderPath, closeAllTabs })
  return null
}

describe('启动会话恢复', () => {
  let container: HTMLDivElement
  let root: Root
  let snapshot: HarnessSnapshot | null = null
  // 模拟磁盘上的 session.json，由 invoke mock 读写
  let storedSession: unknown = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    snapshot = null
    storedSession = null
    isTauriMock.mockReturnValue(true)
    invokeMock.mockReset().mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'load_session_state') return Promise.resolve(storedSession)
      if (command === 'save_session_state') {
        storedSession = (args as { session?: unknown } | undefined)?.session ?? null
        return Promise.resolve()
      }
      if (command === 'clear_session_state') {
        storedSession = null
        return Promise.resolve()
      }
      if (command === 'get_startup_open_files') return Promise.resolve([])
      if (command === 'get_startup_open_folder') return Promise.resolve(null)
      if (command === 'scan_directory') return Promise.resolve([])
      if (command === 'read_file_command') return Promise.resolve(`# ${(args as { path?: string } | undefined)?.path}`)
      if (command === 'get_file_info') return Promise.resolve({ modified: '2026-01-01T00:00:00.000Z' })
      return Promise.resolve(undefined)
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    act(() => root.unmount())
    // 等排队的写盘结束，避免影响下一个用例
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    container.remove()
  })

  function render() {
    act(() => root.render(<Harness onReady={(next) => { snapshot = next }} />))
  }

  // 每次轮询都在 act 内推进一次宏任务，让异步恢复的状态更新正常提交
  async function waitFor(assertion: () => void) {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
      try {
        assertion()
        return
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  it('恢复会话文件中上次打开的文件夹、标签页和当前标签', async () => {
    storedSession = {
      version: 1,
      folderPath: 'D:/notes',
      tabs: ['D:/notes/a.md', 'D:/notes/b.md'],
      activeTabPath: 'D:/notes/b.md',
    }

    render()
    await waitFor(() => expect(snapshot?.tabs).toHaveLength(2))

    expect(snapshot?.tabs.map((tab) => tab.name)).toEqual(['a.md', 'b.md'])
    expect(snapshot?.currentFolderPath).toBe('D:/notes')
    expect(snapshot?.currentFile).toBe('D:/notes/b.md')
    expect(snapshot?.fileContent).toBe('# D:/notes/b.md')
  })

  it('shows the active document while a background tab is still reading, then keeps the saved tab order', async () => {
    storedSession = {
      version: 1, folderPath: null, tabs: ['D:/notes/a.md', 'D:/notes/b.md'], activeTabPath: 'D:/notes/b.md',
    }
    const invoke = invokeMock.getMockImplementation()!
    let finish!: (content: string) => void
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) =>
      command === 'read_file_command' && args?.path === 'D:/notes/a.md'
        ? new Promise<string>((resolve) => { finish = resolve })
        : invoke(command, args))

    await act(async () => render())
    expect(snapshot?.currentFile).toBe('D:/notes/b.md')
    expect(storedSession).toMatchObject({ tabs: ['D:/notes/a.md', 'D:/notes/b.md'] })
    await act(async () => { finish('# A') })
    expect(snapshot?.tabs.map((tab) => tab.name)).toEqual(['a.md', 'b.md'])
    expect(snapshot?.currentFile).toBe('D:/notes/b.md')
  })

  it('用户手动关闭全部标签后不再恢复任何文件', async () => {
    storedSession = { version: 1, folderPath: null, tabs: [], activeTabPath: null }

    render()
    await waitFor(() => expect(storedSession).toBeNull())

    expect(snapshot?.tabs).toHaveLength(0)
    expect(invokeMock).not.toHaveBeenCalledWith('read_file_command', expect.anything())
  })

  it('恢复后关闭全部标签会清空会话中的文件，仅保留文件夹', async () => {
    storedSession = {
      version: 1,
      folderPath: 'D:/notes',
      tabs: ['D:/notes/a.md'],
      activeTabPath: 'D:/notes/a.md',
    }

    render()
    await waitFor(() => expect(snapshot?.tabs).toHaveLength(1))

    await act(async () => { await snapshot!.closeAllTabs() })
    await waitFor(() => expect((storedSession as { tabs?: string[] } | null)?.tabs).toHaveLength(0))

    expect(snapshot?.tabs).toHaveLength(0)
    expect((storedSession as { folderPath?: string | null }).folderPath).toBe('D:/notes')
  })

  it('由系统“打开方式”指定文件时优先打开目标，不恢复旧会话', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'load_session_state') return Promise.resolve(storedSession)
      if (command === 'clear_session_state') {
        storedSession = null
        return Promise.resolve()
      }
      if (command === 'save_session_state') return Promise.resolve()
      if (command === 'get_startup_open_files') return Promise.resolve(['D:/notes/explicit.md'])
      if (command === 'get_startup_open_folder') return Promise.resolve(null)
      return Promise.resolve(undefined)
    })
    storedSession = {
      version: 1,
      folderPath: 'D:/notes',
      tabs: ['D:/notes/a.md'],
      activeTabPath: 'D:/notes/a.md',
    }

    render()
    // 会话被跳过且水合完成后，空标签会清除旧会话
    await waitFor(() => expect(storedSession).toBeNull())

    expect(snapshot?.tabs).toHaveLength(0)
    expect(invokeMock).not.toHaveBeenCalledWith('read_file_command', expect.anything())
  })

  it('把旧版本保存在 localStorage 的会话迁移到会话文件', async () => {
    localStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      folderPath: null,
      tabs: ['D:/notes/legacy.md'],
      activeTabPath: 'D:/notes/legacy.md',
    }))

    render()
    await waitFor(() => expect(snapshot?.tabs).toHaveLength(1))
    await waitFor(() => expect(storedSession).toMatchObject({ tabs: ['D:/notes/legacy.md'] }))

    expect(localStorage.getItem(APP_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('浏览器环境回退到 localStorage', async () => {
    isTauriMock.mockReturnValue(false)
    const session = {
      version: 1,
      folderPath: null,
      tabs: ['D:/notes/browser.md'],
      activeTabPath: 'D:/notes/browser.md',
    }

    await saveAppSession(session)

    expect(await loadAppSession()).toEqual(session)
    expect(invokeMock).not.toHaveBeenCalledWith('save_session_state', expect.anything())
  })

  it('会话数据损坏或缺少标签时视为无内容', () => {
    expect(normalizeAppSession(null)).toBeNull()
    expect(normalizeAppSession('broken')).toBeNull()
    expect(normalizeAppSession({ tabs: [], folderPath: null })).toBeNull()
    expect(normalizeAppSession({ tabs: [1, '', '  '], folderPath: '' })).toBeNull()
  })

  it('构造会话时忽略未命名标签并校验当前标签', () => {
    const tabs: TabItem[] = [
      { id: 'tab-1', name: '未命名', path: null, isModified: false },
      { id: 'tab-2', name: 'a.md', path: 'D:\\notes\\a.md', isModified: false },
      { id: 'tab-3', name: 'b.md', path: 'D:/notes/b.md', isModified: false },
    ]

    const session = buildAppSession(tabs, 'tab-3', 'D:/notes')

    expect(session).toEqual({
      version: 1,
      folderPath: 'D:/notes',
      tabs: ['D:\\notes\\a.md', 'D:/notes/b.md'],
      activeTabPath: 'D:/notes/b.md',
    })
    expect(buildAppSession([tabs[0]], null, null)).toBeNull()
    expect(buildAppSession(tabs, 'tab-1', null)?.activeTabPath).toBeNull()
  })
})
