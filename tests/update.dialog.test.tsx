import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, getPendingDialog } from '../src/components/ConfirmDialog'
import { UpdateDialog } from '../src/components/settings/UpdateDialog'
import { useUpdater, type Updater } from '../src/hooks/useUpdater'
import type { DownloadProgress, UpdateInfo } from '../src/utils/updater'

const { downloadMock, installMock, listenProgressMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(), installMock: vi.fn(), listenProgressMock: vi.fn(),
}))
vi.mock('../src/utils/updater', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/utils/updater')>(),
  downloadUpdate: downloadMock,
  installUpdate: installMock,
  listenDownloadProgress: listenProgressMock,
}))

const asset = { name: 'FkeMark-setup.exe', url: 'https://example.com/setup.exe', sha256: 'a'.repeat(64), size: 1024 }
const info: UpdateInfo = {
  version: '0.2.9', tagName: 'v0.2.9', releaseDate: '2026-11-24T00:00:00Z',
  releaseNotes: '## 更新内容\n- 修复定时检测\n\n<script>window.alert(1)</script>\n\n![外站图片](https://example.com/image.png) [外站链接](https://example.com)', htmlUrl: 'https://example.com',
  isNewer: true, isPrerelease: false, downloads: { windows: asset, linux: asset, macos: asset },
}

describe('居中更新弹窗', () => {
  let container: HTMLDivElement
  let root: Root
  let updater: Updater
  let close: ReturnType<typeof vi.fn>

  const button = (text: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent === text || node.getAttribute('aria-label') === text)!
  const click = async (text: string) => act(async () => { button(text).click() })
  function render(nextInfo = info, language: 'zh-CN' | 'en' = 'zh-CN') {
    act(() => root.render(<><UpdateDialog info={nextInfo} currentVersion="0.2.8" language={language} updater={updater} onClose={close} /><ConfirmDialog lang={language} /></>))
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    downloadMock.mockReset().mockResolvedValue('D:/updates/setup.exe')
    installMock.mockReset().mockResolvedValue(undefined)
    listenProgressMock.mockReset().mockResolvedValue(() => {})
    close = vi.fn()
    updater = {
      phase: 'idle', progress: null, error: null, installerPath: null, resumable: false,
      start: vi.fn(), pause: vi.fn(), install: vi.fn(), reset: vi.fn(), rollback: vi.fn(), checkResumable: vi.fn(),
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (getPendingDialog()) act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('展示版本、更新内容与下载按钮，发布说明中的 HTML 保持字面文本', async () => {
    render()
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('当前版本: v0.2.8')
    expect(dialog.textContent).toContain('最新版本: v0.2.9')
    expect(dialog.textContent).toContain('修复定时检测')
    expect(dialog.querySelector('.update-release-notes h2')?.textContent).toBe('更新内容')
    expect(dialog.querySelector('script')).toBeNull()
    expect(dialog.querySelector('.update-release-notes img, .update-release-notes a')).toBeNull()
    await click('后台下载')
    expect(updater.start).toHaveBeenCalledWith(info)
    expect(close).not.toHaveBeenCalled()
  })

  it('下载中显示进度、暂停和关闭，关闭不取消任务', async () => {
    updater.phase = 'downloading'
    updater.progress = { version: info.version, downloaded: 512, total: 1024, percent: 50, speed: 128 }
    render()
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50')
    expect(container.textContent).toContain('关闭弹窗后继续下载')
    await click('暂停')
    expect(updater.pause).toHaveBeenCalledOnce()
    await click('关闭')
    expect(close).toHaveBeenCalledOnce()
    expect(updater.reset).not.toHaveBeenCalled()
    expect(updater.pause).toHaveBeenCalledOnce()
  })

  it('暂停后可继续，失败后展示错误并可重试', async () => {
    updater.phase = 'paused'
    render()
    await click('继续下载')
    expect(updater.start).toHaveBeenCalledWith(info)
    updater.phase = 'error'
    updater.error = 'update.missingChecksum'
    render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('SHA-256')
    await click('重试')
    expect(updater.start).toHaveBeenCalledTimes(2)
  })

  it('安装必须确认，确认框的 Escape 不关闭更新弹窗', async () => {
    updater.phase = 'ready'
    render()
    await click('立即安装并重启')
    expect(getPendingDialog()).not.toBeNull()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(getPendingDialog()).toBeNull()
    expect(updater.install).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    await click('立即安装并重启')
    await click('确定')
    expect(updater.install).toHaveBeenCalledOnce()
  })

  it('支持关闭按钮与 Escape，遮罩不关闭，Tab 焦点停留在弹窗', () => {
    render()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭')
    button('更新全部').focus()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })))
    expect(document.activeElement?.textContent).toBe('后台下载')
    act(() => container.querySelector<HTMLElement>('.update-dialog-overlay')!.click())
    expect(close).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(close).toHaveBeenCalledOnce()
  })

  it('英语文案与缺少当前平台安装包的状态可正常展示', () => {
    render({ ...info, downloads: {}, releaseNotes: '' }, 'en')
    expect(container.textContent).toContain('No release notes were provided')
    expect(container.textContent).toContain('No download package is available')
    expect(button('Download in Background')).toBeUndefined()
    expect(button('Close')).toBeDefined()
  })

  it('更新全部只启动应用下载和选中版本的组件更新，不触发应用安装', async () => {
    const installConverter = vi.fn()
    act(() => root.render(<UpdateDialog info={info} currentVersion="0.2.8" language="zh-CN" updater={updater} onClose={close}
      converter={{ phase: 'idle', error: null, start: installConverter, info: {
        currentVersion: '0.1.0', latestVersion: '0.2.0', tagName: 'converter-v0.2.0',
        releaseNotes: '修复 PDF 导入', releaseDate: '', isNewer: true,
      } }} />))
    expect(container.textContent).toContain('2 项可用更新')
    const converterTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find(node => node.textContent?.includes('文档转换组件'))
    act(() => converterTab?.click())
    expect(container.textContent).toContain('修复 PDF 导入')
    await click('更新全部')
    expect(updater.start).toHaveBeenCalledWith(info)
    expect(installConverter).toHaveBeenCalledOnce()
    expect(updater.install).not.toHaveBeenCalled()
  })

  it('StrictMode 重新订阅后忽略旧进度，迟到和当前订阅分别解绑一次', async () => {
    const disposeLate = vi.fn()
    const disposeCurrent = vi.fn()
    let finishLate!: (dispose: () => void) => void
    let emitLate!: (progress: DownloadProgress) => void
    let emitCurrent!: (progress: DownloadProgress) => void
    listenProgressMock.mockImplementationOnce((handler: typeof emitLate) => {
      emitLate = handler
      return new Promise<() => void>(resolve => { finishLate = resolve })
    }).mockImplementationOnce(async (handler: typeof emitCurrent) => {
      emitCurrent = handler
      return disposeCurrent
    })
    function Harness() {
      updater = useUpdater()
      return null
    }

    await act(async () => root.render(<StrictMode><Harness /></StrictMode>))
    const progress = { version: info.version, downloaded: 512, total: 1024, percent: 50, speed: 128 }
    act(() => emitCurrent(progress))
    expect(updater.progress).toEqual(progress)

    await act(async () => {
      emitLate({ ...progress, percent: 25 })
      finishLate(disposeLate)
    })
    expect(updater.progress).toEqual(progress)
    expect(disposeLate).toHaveBeenCalledOnce()
    expect(disposeCurrent).not.toHaveBeenCalled()

    act(() => root.render(null))
    expect(disposeCurrent).toHaveBeenCalledOnce()
    expect(disposeLate).toHaveBeenCalledOnce()
  })

  it('未保存文档阻止安装时显示原因，保存后可再次安装正确版本', async () => {
    let saved = false
    function Harness() {
      updater = useUpdater({ onBeforeInstall: async () => saved })
      return <UpdateDialog info={info} currentVersion="0.2.8" language="zh-CN" updater={updater} onClose={close} />
    }
    act(() => root.render(<Harness />))
    await act(async () => { await updater.start(info) })
    expect(updater.phase).toBe('ready')
    await act(async () => { await updater.install() })
    expect(installMock).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('安装已中止')
    saved = true
    await act(async () => { await updater.install() })
    expect(installMock).toHaveBeenCalledWith('D:/updates/setup.exe', '0.2.9')
    expect(updater.error).toBeNull()
  })

  it('应用安装等待保存期间不能启动组件更新，保存被拒后可正常下载', async () => {
    let finish!: (saved: boolean) => void
    const installConverter = vi.fn()
    function Harness() {
      updater = useUpdater({ onBeforeInstall: () => new Promise(resolve => { finish = resolve }) })
      return <><UpdateDialog info={info} currentVersion="0.2.8" language="zh-CN" updater={updater} onClose={close}
        converter={{ phase: 'idle', error: null, start: installConverter, info: {
          currentVersion: '0.1.0', latestVersion: '0.2.0', tagName: 'converter-v0.2.0',
          releaseNotes: '', releaseDate: '', isNewer: true,
        } }} /><ConfirmDialog lang="zh-CN" /></>
    }
    act(() => root.render(<Harness />))
    await act(async () => { await updater.start(info) })
    await click('立即安装并重启')
    await click('确定')
    await click('更新全部')
    expect(installConverter).not.toHaveBeenCalled()
    await act(async () => { finish(false) })
    await click('更新全部')
    expect(installConverter).toHaveBeenCalledOnce()
    expect(installMock).not.toHaveBeenCalled()
  })
})
