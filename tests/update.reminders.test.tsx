import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { useAppUpdates } from '../src/app/useAppUpdates'
import type { UpdateInfo } from '../src/utils/updater'

const { checkMock, updaterMock, sendMock } = vi.hoisted(() => ({
  checkMock: vi.fn(), updaterMock: vi.fn(), sendMock: vi.fn(),
}))
vi.mock('../src/utils/tauri', () => ({ isTauri: () => true }))
vi.mock('../src/utils/updater', () => ({
  checkForUpdate: checkMock,
  getLocalVersion: async () => '0.2.8',
  getBuildChannel: () => 'latest',
  finalizeUpdate: async () => null,
}))
vi.mock('../src/hooks/useUpdater', () => ({ useUpdater: updaterMock }))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => true,
  requestPermission: async () => 'granted',
  sendNotification: sendMock,
}))

const info: UpdateInfo = {
  version: '0.2.9', tagName: 'v0.2.9', releaseDate: '2026-11-24T00:00:00Z',
  releaseNotes: '修复更新提醒', htmlUrl: 'https://example.com', isNewer: true, isPrerelease: false, downloads: {},
}

describe('自动更新提醒', () => {
  let root: Root
  let container: HTMLDivElement
  let updates: ReturnType<typeof useAppUpdates>
  let ready: boolean
  let enabled: boolean
  let secondary: boolean
  let phase: string
  const activeTabIdRef = { current: null }
  const revisionRef = { current: new Map<string, number>() }
  const cache = { current: new Map() }

  function Harness() {
    updates = useAppUpdates({
      activeTabId: null, activeTabIdRef, documentRevisionRef: revisionRef, tabContentCache: cache,
      getCurrentContent: () => '', isModified: false, editorMode: 'source', currentFile: null, lastSavedAt: null,
      settings: { ...DEFAULT_SETTINGS, autoCheckUpdate: enabled }, settingsReady: ready, isSecondaryWindow: secondary,
      setIsModified: vi.fn(), setSaveStatus: vi.fn(), setLastSavedAt: vi.fn(),
    })
    return null
  }
  const render = () => act(() => root.render(<Harness />))
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T00:00:00Z'))
    ready = true
    enabled = true
    secondary = false
    phase = 'idle'
    checkMock.mockReset().mockResolvedValue(info)
    sendMock.mockReset()
    updaterMock.mockReset().mockImplementation(() => ({ phase, reset: vi.fn() }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('设置加载完成后才启动检测，此后每 30 分钟检查', async () => {
    ready = false
    render()
    await advance(10000)
    expect(checkMock).not.toHaveBeenCalled()
    ready = true
    render()
    await advance(1999)
    expect(checkMock).not.toHaveBeenCalled()
    await advance(1)
    expect(checkMock).toHaveBeenCalledWith('latest', '0.2.8')
    expect(updates.showUpdateDialog).toBe(true)
    await advance(30 * 60 * 1000)
    expect(checkMock).toHaveBeenCalledTimes(2)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('启动失败后 1 分钟重试并恢复提醒', async () => {
    checkMock.mockResolvedValueOnce(null)
    render()
    await advance(2000)
    expect(updates.showUpdateDialog).toBe(false)
    await advance(60000)
    expect(updates.showUpdateDialog).toBe(true)
    expect(checkMock).toHaveBeenCalledTimes(2)
  })

  it('恢复网络立即补查，重复事件不会并发请求或留下重复定时器', async () => {
    let finish!: (value: UpdateInfo) => void
    checkMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render()
    await advance(2000)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(checkMock).toHaveBeenCalledTimes(1)
    await act(async () => { finish(info) })
    await advance(60000)
    expect(checkMock).toHaveBeenCalledTimes(1)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(checkMock).toHaveBeenCalledTimes(2)
  })

  it('回到前台时检查过期结果，刚成功检查时不重复请求', async () => {
    render()
    await advance(2000)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(checkMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 31 * 60 * 1000)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(checkMock).toHaveBeenCalledTimes(2)
  })

  it('关闭后不重复提醒同版本，新版本及手动检查可以重新打开', async () => {
    render()
    await advance(2000)
    act(() => updates.setShowUpdateDialog(false))
    await advance(30 * 60 * 1000)
    expect(updates.showUpdateDialog).toBe(false)
    await act(async () => { await updates.doCheckUpdate('latest') })
    expect(updates.showUpdateDialog).toBe(true)
    act(() => updates.setShowUpdateDialog(false))
    checkMock.mockResolvedValue({ ...info, version: '0.3.0' })
    await advance(30 * 60 * 1000)
    expect(updates.showUpdateDialog).toBe(true)
    expect(updates.updateInfo?.version).toBe('0.3.0')
  })

  it('网络失败保留已发现版本与弹窗', async () => {
    render()
    await advance(2000)
    checkMock.mockResolvedValue(null)
    await advance(30 * 60 * 1000)
    expect(updates.updateInfo).toEqual(info)
    expect(updates.showUpdateDialog).toBe(true)
  })

  it('禁用自动检查或副窗口均不启动自动检测', async () => {
    enabled = false
    render()
    await advance(60000)
    expect(checkMock).not.toHaveBeenCalled()
    enabled = true
    secondary = true
    render()
    await advance(60000)
    expect(checkMock).not.toHaveBeenCalled()
  })

  it('请求期间关闭自动检查后，不展示迟到结果也不重试', async () => {
    let finish!: (value: UpdateInfo) => void
    checkMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render()
    await advance(2000)
    enabled = false
    render()
    await act(async () => { finish(info) })
    await advance(30 * 60 * 1000)
    expect(updates.showUpdateDialog).toBe(false)
    expect(checkMock).toHaveBeenCalledTimes(1)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('检查期间开始下载时，迟到结果不能替换已选版本', async () => {
    render()
    await advance(2000)
    let finish!: (value: UpdateInfo) => void
    checkMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    let pending!: ReturnType<typeof updates.doCheckUpdate>
    await act(async () => { pending = updates.doCheckUpdate('dev') })
    phase = 'downloading'
    render()
    await act(async () => { finish({ ...info, version: 'dev-1234567' }); await pending })
    expect(updates.updateInfo?.version).toBe('0.2.9')
    await advance(30 * 60 * 1000)
    expect(checkMock).toHaveBeenCalledTimes(2)
  })
})
