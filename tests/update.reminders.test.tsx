import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { useAppUpdates } from '../src/app/useAppUpdates'
import type { UpdateInfo } from '../src/utils/updater'

const { checkMock, updaterMock, sendMock, invokeMock } = vi.hoisted(() => ({
  checkMock: vi.fn(), updaterMock: vi.fn(), sendMock: vi.fn(), invokeMock: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
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
const converter = {
  currentVersion: '0.1.0', latestVersion: '0.2.0', tagName: 'converter-v0.2.0',
  releaseNotes: '修复组件导入', releaseDate: '2026-11-24T00:00:00Z', isNewer: true,
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
    invokeMock.mockReset().mockResolvedValue(null)
    localStorage.clear()
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

  it('应用更新检查失败时，已安装组件有新版仍自动打开更新中心且不下载安装', async () => {
    checkMock.mockResolvedValue(null)
    invokeMock.mockResolvedValue(converter)
    render()
    await advance(2000)
    expect(updates.showUpdateDialog).toBe(true)
    expect(updates.updateCenter.converter.info).toEqual(converter)
    expect(updates.updateCenter.initialTab).toBe('converter')
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual(['check_converter_component_update'])
  })

  it('忽略组件后不再提醒同一版本，但下一版本仍会提示', async () => {
    checkMock.mockResolvedValue({ ...info, isNewer: false })
    invokeMock.mockResolvedValue(converter)
    render()
    await advance(2000)
    act(() => {
      updates.updateCenter.toggleIgnored('converter')
      updates.setShowUpdateDialog(false)
    })
    await advance(30 * 60 * 1000)
    expect(updates.showUpdateDialog).toBe(false)
    expect(updates.updateCenter.converterIgnored).toBe(true)
    invokeMock.mockResolvedValue({ ...converter, latestVersion: '0.3.0', tagName: 'converter-v0.3.0' })
    await advance(30 * 60 * 1000)
    expect(updates.showUpdateDialog).toBe(true)
    expect(updates.updateCenter.converterIgnored).toBe(false)
  })

  it('自动检查期间手动选择开发通道，请求结束后仍检查开发版', async () => {
    let finish!: (value: UpdateInfo) => void
    checkMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render()
    await advance(2000)
    checkMock.mockResolvedValue({ ...info, version: 'dev-1234567', tagName: 'dev-latest' })
    act(() => updates.updateCenter.open('dev'))
    await act(async () => { finish(info) })
    expect(checkMock.mock.calls.map(([channel]) => channel)).toEqual(['latest', 'dev'])
    expect(updates.updateInfo?.version).toBe('dev-1234567')
  })

  it('组件下载保持目标版本，关闭中心后完成更新并清除待更新状态', async () => {
    let finish!: (installed: boolean) => void
    invokeMock.mockImplementation((command: string) => command === 'install_converter_component'
      ? new Promise(resolve => { finish = resolve }) : Promise.resolve(converter))
    render()
    await advance(2000)
    act(() => { void updates.updateCenter.converter.start() })
    expect(invokeMock).toHaveBeenLastCalledWith('install_converter_component', { tagName: 'converter-v0.2.0' })
    act(() => updates.setShowUpdateDialog(false))
    await act(async () => { finish(true) })
    expect(updates.showUpdateDialog).toBe(false)
    expect(updates.updateCenter.converter.info).toMatchObject({ currentVersion: '0.2.0', isNewer: false })
  })

  it('手动检查中关闭中心后，迟到的结果不会重新打开弹窗', async () => {
    let finish!: (value: UpdateInfo) => void
    checkMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    enabled = false
    render()
    await act(async () => { updates.updateCenter.open('latest') })
    act(() => updates.setShowUpdateDialog(false))
    await act(async () => { finish(info) })
    expect(updates.showUpdateDialog).toBe(false)
    expect(updates.updateInfo).toEqual(info)
  })

  it('较慢的组件检查不拦住应用提醒，重试组件不重复检查应用', async () => {
    let fail!: (reason: unknown) => void
    invokeMock.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    render()
    await advance(2000)
    expect(updates.updateInfo).toEqual(info)
    expect(updates.showUpdateDialog).toBe(true)
    await act(async () => { fail('component_network_failed') })
    await advance(60000)
    expect(checkMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })
})
