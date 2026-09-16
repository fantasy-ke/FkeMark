import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'

const {
  getCurrentWebviewMock,
  getCurrentWebviewWindowMock,
  invokeMock,
  listenMock,
  openDialogMock,
  showConfirmMock,
  replaceState,
} = vi.hoisted(() => ({
  getCurrentWebviewMock: vi.fn(),
  getCurrentWebviewWindowMock: vi.fn(),
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  openDialogMock: vi.fn(),
  showConfirmMock: vi.fn(),
  replaceState: {
    deferred: false,
    fixedRemoteName: '',
    release: null as (() => void) | null,
  },
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: getCurrentWebviewMock }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({ getCurrentWebviewWindow: getCurrentWebviewWindowMock }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openDialogMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: () => true }))
vi.mock('../src/hooks/useTauriWindow', () => ({
  useTauriWindow: () => ({ isMaximized: false, close: vi.fn(), hideToTray: vi.fn() }),
}))
vi.mock('../src/app/useAppUpdates', () => ({
  useAppUpdates: () => ({
    appVersion: 'test', updateInfo: null, checkingUpdate: false, showUpdateToast: false,
    setShowUpdateToast: vi.fn(), updateNotification: null, setUpdateNotification: vi.fn(),
    rollbackAvailable: false, finalizeNotice: null, setFinalizeNotice: vi.fn(), updater: null, doCheckUpdate: vi.fn(),
  }),
}))
vi.mock('../src/components/ConfirmDialog', () => ({
  showAlert: vi.fn(),
  showCloseActionDialog: vi.fn(),
  showConfirm: showConfirmMock,
}))
vi.mock('../src/app/AppLayout', () => ({
  AppLayout: (props: any) => (
    <div data-current={props.currentFile || ''} data-content={props.fileContent}>
      <button data-open-folder onClick={() => void props.handleOpenFolder()}>open folder</button>
      <button data-open-file onClick={() => void props.handleOpenFile('D:/notes/current.md')}>open file</button>
      <button data-open-other onClick={() => void props.handleOpenFile('D:/notes/other.md')}>open other</button>
      <button data-edit onClick={() => props.handleDocumentContentChange('edited')}>edit</button>
      <button
        data-replace
        onClick={() => void props.handleGlobalReplace('old', 'new', {
          caseSensitive: true,
          useRegex: false,
          wholeWord: false,
        })}
      >
        replace
      </button>
    </div>
  ),
}))

describe('全局替换同步', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    replaceState.deferred = false
    replaceState.fixedRemoteName = ''
    replaceState.release = null

    showConfirmMock.mockReset().mockResolvedValue(true)
    listenMock.mockReset().mockResolvedValue(vi.fn())
    getCurrentWebviewMock.mockReset().mockReturnValue({ onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()) })
    getCurrentWebviewWindowMock.mockReset().mockReturnValue({ show: vi.fn().mockResolvedValue(undefined) })
    openDialogMock.mockReset().mockResolvedValue('D:/notes')
    invokeMock.mockReset().mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({
          webdavSyncEnabled: true,
          webdavSyncUrl: 'https://dav.example.com/dav',
          webdavSyncUsername: 'user',
          webdavSyncPassword: 'secret',
          webdavSyncRoot: 'notes',
          webdavSyncFileName: replaceState.fixedRemoteName,
        })
      }
      if (command === 'get_startup_open_files') return Promise.resolve([])
      if (command === 'scan_directory') return Promise.resolve([])
      if (command === 'read_file_command') return Promise.resolve('old')
      if (command === 'get_file_info') return Promise.resolve({ modified: '2026-01-01T00:00:00.000Z' })
      if (command === 'replace_in_files_command') {
        const result = {
          files: [
            { filePath: 'D:/notes/current.md', content: 'new', replacements: 1 },
            { filePath: 'D:/notes/other.md', content: 'other-new', replacements: 1 },
          ],
          totalFilesChanged: 2,
          totalReplacements: 2,
        }
        if (replaceState.deferred) {
          return new Promise((resolve) => {
            replaceState.release = () => resolve(result)
          })
        }
        return Promise.resolve(result)
      }
      return Promise.resolve(undefined)
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('批量替换当前文件后将新内容调度到 WebDAV', async () => {
    await act(async () => { root.render(<App />) })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-folder]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-file]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-replace]')!.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    vi.advanceTimersByTime(800)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledWith('push_webdav_file', {
      url: 'https://dav.example.com/dav/notes/current.md',
      username: 'user',
      password: 'secret',
      content: 'new',
    })

    expect(invokeMock).toHaveBeenCalledWith('push_webdav_file', {
      url: 'https://dav.example.com/dav/notes/other.md',
      username: 'user',
      password: 'secret',
      content: 'other-new',
    })
  })
  it('异步替换期间用户编辑当前文档时不覆盖新内容', async () => {
    await act(async () => { root.render(<App />) })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-folder]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-file]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    replaceState.deferred = true
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-replace]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-edit]')!.click()
    })
    await act(async () => {
      replaceState.release?.()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-content]')?.getAttribute('data-content')).toBe('edited')
  })

  it('替换开始前当前文档已有未保存内容时不覆盖编辑器', async () => {
    await act(async () => { root.render(<App />) })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-folder]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-file]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-edit]')!.click()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-replace]')!.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(showConfirmMock).toHaveBeenCalled()
    expect(container.querySelector('[data-content]')?.getAttribute('data-content')).toBe('edited')
  })

  it('固定远端文件名时不把批量替换结果覆盖到同一 WebDAV 文件', async () => {
    replaceState.fixedRemoteName = 'fixed.md'
    await act(async () => { root.render(<App />) })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-folder]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open-file]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-replace]')!.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })

    expect(invokeMock.mock.calls.some(([command]) => command === 'push_webdav_file')).toBe(false)
  })

})
