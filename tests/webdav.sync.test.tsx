import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { useWebdavSync } from '../src/app/useWebdavSync'
import type { AppSettings } from '../src/types'

const { invokeMock, notifyErrorMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  notifyErrorMock: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: () => true }))
vi.mock('../src/utils/toast', () => ({ notifyError: notifyErrorMock }))

interface HarnessProps {
  settings: AppSettings
  onReady: (schedule: (filePath: string, content: string) => void) => void
}

function WebdavHarness({ settings, onReady }: HarnessProps): ReactNode {
  const schedule = useWebdavSync(settings)
  onReady(schedule)
  return null
}

describe('WebDAV 文件同步', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    invokeMock.mockReset().mockResolvedValue(undefined)
    notifyErrorMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function createSettings(): AppSettings {
    return {
      ...DEFAULT_SETTINGS,
      webdavSyncEnabled: true,
      webdavSyncUrl: 'https://dav.example.com/dav',
      webdavSyncUsername: 'user',
      webdavSyncPassword: 'secret',
      webdavSyncRoot: 'notes',
    }
  }

  it('合并防抖期间的保存，只推送最新内容', async () => {
    let schedule: ((filePath: string, content: string) => void) | null = null
    await act(async () => {
      root.render(<WebdavHarness settings={createSettings()} onReady={(handler) => { schedule = handler }} />)
    })

    await act(async () => {
      schedule?.('D:/notes/today.md', '旧内容')
      schedule?.('D:/notes/today.md', '新内容')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('push_webdav_file', {
      url: 'https://dav.example.com/dav/notes/today.md',
      username: 'user',
      password: 'secret',
      content: '新内容',
    })
  })

  it('当前推送未完成时，完成后继续推送期间产生的最新内容', async () => {
    let releaseFirst: (() => void) | null = null
    invokeMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve }))
      .mockResolvedValue(undefined)

    let schedule: ((filePath: string, content: string) => void) | null = null
    await act(async () => {
      root.render(<WebdavHarness settings={createSettings()} onReady={(handler) => { schedule = handler }} />)
    })

    await act(async () => {
      schedule?.('D:/notes/today.md', '第一次')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })
    expect(invokeMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      schedule?.('D:/notes/today.md', '第二次')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })
    expect(invokeMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseFirst?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).toHaveBeenLastCalledWith('push_webdav_file', {
      url: 'https://dav.example.com/dav/notes/today.md',
      username: 'user',
      password: 'secret',
      content: '第二次',
    })
  })

  it('为不同远端文件分别保留最新推送', async () => {
    let schedule: ((filePath: string, content: string) => void) | null = null
    await act(async () => {
      root.render(<WebdavHarness settings={createSettings()} onReady={(handler) => { schedule = handler }} />)
    })

    await act(async () => {
      schedule?.('D:/notes/one.md', '文件一')
      schedule?.('D:/notes/two.md', '文件二')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).toHaveBeenCalledWith('push_webdav_file', expect.objectContaining({
      url: 'https://dav.example.com/dav/notes/one.md',
      content: '文件一',
    }))
    expect(invokeMock).toHaveBeenCalledWith('push_webdav_file', expect.objectContaining({
      url: 'https://dav.example.com/dav/notes/two.md',
      content: '文件二',
    }))
  })

  it('配置变更后仍会发送旧请求期间产生的新内容', async () => {
    let releaseFirst: (() => void) | null = null
    invokeMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve }))
      .mockResolvedValue(undefined)
    const firstSettings = createSettings()
    const secondSettings = { ...firstSettings, webdavSyncUsername: 'new-user' }
    let schedule: ((filePath: string, content: string) => void) | null = null

    await act(async () => {
      root.render(<WebdavHarness settings={firstSettings} onReady={(handler) => { schedule = handler }} />)
    })
    await act(async () => {
      schedule?.('D:/notes/today.md', '第一次')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })
    expect(invokeMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(<WebdavHarness settings={secondSettings} onReady={(handler) => { schedule = handler }} />)
    })
    await act(async () => {
      schedule?.('D:/notes/today.md', '配置变更后')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })
    expect(invokeMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseFirst?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).toHaveBeenLastCalledWith('push_webdav_file', {
      url: 'https://dav.example.com/dav/notes/today.md',
      username: 'new-user',
      password: 'secret',
      content: '配置变更后',
    })
  })
  it('旧调度引用在配置变更后使用最新连接信息', async () => {
    let staleSchedule: ((filePath: string, content: string) => void) | null = null
    const firstSettings = createSettings()
    await act(async () => {
      root.render(<WebdavHarness settings={firstSettings} onReady={(handler) => { staleSchedule ??= handler }} />)
    })

    const secondSettings = {
      ...firstSettings,
      webdavSyncUrl: 'https://new.example.com/dav',
      webdavSyncRoot: 'archive',
      webdavSyncUsername: 'new-user',
    }
    await act(async () => {
      root.render(<WebdavHarness settings={secondSettings} onReady={() => {}} />)
    })
    await act(async () => {
      staleSchedule?.('D:/notes/today.md', '最新配置')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledWith('push_webdav_file', {
      url: 'https://new.example.com/dav/archive/today.md',
      username: 'new-user',
      password: 'secret',
      content: '最新配置',
    })
  })

  it('关闭同步后旧调度引用不能重新入队', async () => {
    let staleSchedule: ((filePath: string, content: string) => void) | null = null
    const enabledSettings = createSettings()
    await act(async () => {
      root.render(<WebdavHarness settings={enabledSettings} onReady={(handler) => { staleSchedule ??= handler }} />)
    })
    await act(async () => {
      root.render(
        <WebdavHarness
          settings={{ ...enabledSettings, webdavSyncEnabled: false }}
          onReady={() => {}}
        />,
      )
    })
    await act(async () => {
      staleSchedule?.('D:/notes/today.md', '不应发送')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('卸载后旧调度引用不能重新入队', async () => {
    const extraContainer = document.createElement('div')
    document.body.appendChild(extraContainer)
    const extraRoot = createRoot(extraContainer)
    let staleSchedule: ((filePath: string, content: string) => void) | null = null
    await act(async () => {
      extraRoot.render(<WebdavHarness settings={createSettings()} onReady={(handler) => { staleSchedule = handler }} />)
    })
    await act(async () => extraRoot.unmount())

    await act(async () => {
      staleSchedule?.('D:/notes/today.md', '不应发送')
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })

    expect(invokeMock).not.toHaveBeenCalled()
    extraContainer.remove()
  })

})
