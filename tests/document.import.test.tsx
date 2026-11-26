import { act, useLayoutEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { DocumentImportPanel } from '../src/components/DocumentImportPanel'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { UpdateDialog } from '../src/components/settings/UpdateDialog'
import { TopBar } from '../src/components/TopBar'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { I18nProvider, translate, type Lang } from '../src/i18n'
import { useDocumentImport, type DocumentImportControls } from '../src/app/useDocumentImport'
import { useAppUpdates } from '../src/app/useAppUpdates'
import { useAppTabs } from '../src/app/useAppTabs'
import type { EditorMode } from '../src/types'
import type { DocumentSyncStatus } from '../src/utils/documentStats'

const { invokeMock, openMock, isTauriMock, notifyErrorMock, notifyInfoMock, notifySuccessMock, dismissToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  isTauriMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifyInfoMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  dismissToastMock: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))
vi.mock('../src/utils/tauri', () => ({
  isTauri: isTauriMock,
  safeTauriCall: async () => undefined,
  safeTauriListener: () => undefined,
}))
vi.mock('../src/utils/toast', () => ({
  notifyError: notifyErrorMock,
  notifyInfo: notifyInfoMock,
  notifySuccess: notifySuccessMock,
  dismissToast: dismissToastMock,
}))

type CreateTab = ReturnType<typeof useAppTabs>['createTab']
vi.mock('../src/utils/updater', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/utils/updater')>(),
  getLocalVersion: async () => '0.2.8',
  checkForUpdate: async () => null,
  finalizeUpdate: async () => null,
  listenDownloadProgress: async () => () => {},
}))

function ImportHarness({ createTab, language = 'en', onReady }: {
  createTab: CreateTab
  language?: Lang
  onReady: (controls: DocumentImportControls) => void
}) {
  const controls = useDocumentImport({ language, createTab })
  onReady(controls)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const noop = () => {}
  const updates = useAppUpdates({
    activeTabId: null, activeTabIdRef: useRef(null), documentRevisionRef: useRef(new Map()), tabContentCache: useRef(new Map()),
    getCurrentContent: () => '', isModified: false, editorMode: 'source', currentFile: null, lastSavedAt: null,
    settings: DEFAULT_SETTINGS, settingsReady: false, isSecondaryWindow: true,
    setIsModified: noop, setSaveStatus: noop, setLastSavedAt: noop,
  })
  const openComponents = () => { controls.closeImportPanel(); setSettingsOpen(true) }
  return <I18nProvider language={language} setLanguage={noop}>
    <TopBar currentFile={null} isModified={false} theme="light" editorMode="live"
      onToggleTheme={noop} onOpenSettings={openComponents} onExport={noop} onManageImages={noop}
      onSave={noop} onEditorModeChange={noop} importing={controls.inputBusy}
      onImportLocal={controls.handleImportLocal} onImportUrl={controls.handleImportUrl}
      minimizedImportCount={controls.minimizedCount} onShowImportTasks={controls.showImportPanel}
      onShowConverterDownload={controls.downloadMinimized ? controls.showImportPanel : undefined} />
    <ConfirmDialog lang={language} />
    <DocumentImportPanel state={controls.importPanel} tasks={controls.tasks} language={language} onClose={controls.closeImportPanel} onOpenComponents={openComponents}
      captureBusy={controls.inputBusy} onCaptureWebpage={controls.handleCaptureWebpage} />
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={DEFAULT_SETTINGS}
      onSettingsChange={noop} initialSection="components" converterBusy={controls.importing}
      onInstallConverter={() => { setSettingsOpen(false); void controls.handleInstallConverter() }}
      onCheckConverter={() => updates.updateCenter.open('latest', 'converter')} />
    {updates.showUpdateDialog && <UpdateDialog info={updates.updateInfo} currentVersion={updates.appVersion} language={language}
      updater={updates.updater} converter={updates.updateCenter.converter} initialTab={updates.updateCenter.initialTab}
      onClose={() => updates.setShowUpdateDialog(false)} />}
    <textarea aria-label="editor" />
  </I18nProvider>
}

function TabsHarness({ onReady, mode = 'live' }: {
  onReady: (controls: DocumentImportControls & ReturnType<typeof useAppTabs> & {
    fileContent: string
    currentFile: string | null
    isModified: boolean
    saveStatus: DocumentSyncStatus
    edit: (content: string) => void
  }) => void
  mode?: EditorMode
}) {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(mode)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<DocumentSyncStatus>('saved')
  const liveEditorContent = useRef('')
  const tabs = useAppTabs({
    currentFile, setCurrentFile, setFileContent, isModified, setIsModified,
    editorMode, setEditorMode, lastSavedAt, setLastSavedAt, setSaveStatus,
    currentFolderPath: null, scanFolder: async () => {}, language: 'en',
    getCurrentContent: () => liveEditorContent.current, snapshotLimit: 10,
  })
  useLayoutEffect(() => { liveEditorContent.current = fileContent }, [fileContent, tabs.activeTabId])
  const controls = useDocumentImport({ language: 'en', createTab: tabs.createTab })
  onReady({
    ...tabs, ...controls, fileContent, currentFile, isModified, saveStatus,
    edit(content) {
      liveEditorContent.current = content
      setIsModified(true)
      tabs.updateActiveTabModified(true)
    },
  })
  return <ConfirmDialog lang="en" />
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const converted = {
  markdown: '# Converted\n\n![remote](https://example.com/image.png)\n![data](data:image/png;base64,aGVsbG8=)\n![blob](blob:https://example.com/123)\n',
  title: null,
  fileName: 'report.pdf',
}

describe('文档导入', () => {
  let container: HTMLDivElement
  let root: Root
  let unmounted: boolean
  let controls: DocumentImportControls
  let createTab: ReturnType<typeof vi.fn<CreateTab>>

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    unmounted = false
    vi.clearAllMocks()
    invokeMock.mockReset().mockResolvedValue(converted)
    openMock.mockReset().mockResolvedValue('D:\\imports\\report.pdf')
    isTauriMock.mockReturnValue(true)
    createTab = vi.fn<CreateTab>().mockReturnValue('new-tab')
    render()
  })

  afterEach(async () => {
    if (!unmounted) await act(async () => root.unmount())
    container.remove()
    expect(notifyInfoMock).not.toHaveBeenCalled()
    expect(notifySuccessMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).not.toHaveBeenCalled()
    expect(dismissToastMock).not.toHaveBeenCalled()
  })

  function render(language: Lang = 'en', callback: CreateTab = createTab) {
    act(() => root.render(<ImportHarness createTab={callback} language={language} onReady={(value) => { controls = value }} />))
  }

  function button(label: string) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent === label)!
  }

  async function beginUrl() {
    let promise!: Promise<void>
    await act(async () => { promise = controls.handleImportUrl() })
    return { promise }
  }

  async function confirmUrl(value: string, action = 'Import directly') {
    container.querySelector<HTMLInputElement>('input')!.value = value
    await act(async () => { button(action).click() })
  }

  it('登录窗口返回当前网页快照后才入队转换，不重新下载网址', async () => {
    const snapshot = { url: 'https://example.com/articles/team', html: '<main><h1>Team</h1></main>' }
    const capture = deferred<typeof snapshot>()
    invokeMock.mockResolvedValueOnce(undefined).mockReturnValueOnce(capture.promise)
      .mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ...converted, title: 'Team' })
    act(() => container.querySelector<HTMLButtonElement>('header button[aria-label="New"]')!.click())
    expect(button('Import a signed-in webpage…')).toBeUndefined()
    act(() => button('Import from URL…').click())
    await confirmUrl('https://example.com/sign-in', 'Open sign-in window')
    expect(invokeMock.mock.calls).toEqual([['open_webpage_import', { url: 'https://example.com/sign-in', title: 'Webpage sign-in · FkeMark' }]])
    expect(createTab).not.toHaveBeenCalled()
    act(() => button('Convert current webpage').click())
    expect(invokeMock).toHaveBeenLastCalledWith('capture_webpage_import')
    expect(createTab).not.toHaveBeenCalled()
    await act(async () => { capture.resolve(snapshot) })
    expect(invokeMock).toHaveBeenLastCalledWith('convert_document', { source: { kind: 'webpage', value: snapshot } })
    expect(createTab).toHaveBeenCalledWith('Team.md', null, converted.markdown, undefined, null, true)
  })

  it('同一网址弹窗仅允许通过 HTTPS 打开登录窗口', async () => {
    const { promise } = await beginUrl()
    await confirmUrl('http://example.com/sign-in', 'Open sign-in window')
    await promise

    expect(invokeMock).not.toHaveBeenCalled()
    expect(container.querySelector('.document-import-panel')?.textContent)
      .toContain(translate('en', 'import.error.webpage_https_required'))
  })

  it('收起转换队列时仍显示登录窗口操作，捕获失败后可重试或取消', async () => {
    render()
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
      .mockResolvedValueOnce(undefined).mockRejectedValueOnce('webpage_sign_in').mockResolvedValueOnce(undefined)
    await act(async () => { void controls.handleImportLocal() })
    act(() => button('Minimize').click())
    await beginUrl()
    await confirmUrl('https://example.com/sign-in', 'Open sign-in window')

    await act(async () => { button('Convert current webpage').click() })
    const panel = container.querySelector('.document-import-panel')!
    expect(panel.textContent).toContain(translate('en', 'import.error.webpage_sign_in'))
    expect(button('Convert current webpage').disabled).toBe(false)
    await act(async () => { button('Cancel').click() })
    expect(button('Convert current webpage')).toBeUndefined()
    expect(createTab).not.toHaveBeenCalled()

    await act(async () => { conversion.resolve(converted) })
    expect(createTab).toHaveBeenCalledTimes(1)
  })

  it('使用固定文件参数，并只创建一个无路径且已修改的新标签', async () => {
    await act(async () => { await controls.handleImportLocal() })
    expect(openMock).toHaveBeenCalledWith(expect.objectContaining({
      directory: false,
      multiple: true,
      filters: [{ name: 'Supported documents and images', extensions: ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'html', 'htm', 'epub', 'txt', 'csv', 'json', 'xml', 'png', 'jpg', 'jpeg', 'webp'] }],
    }))
    expect(invokeMock).toHaveBeenCalledWith('convert_document', { source: { kind: 'file', value: 'D:\\imports\\report.pdf' } })
    expect(createTab).toHaveBeenCalledWith('report.md', null, converted.markdown, undefined, null, true)
    expect(container.querySelector('.document-import-panel')?.textContent).toContain('Ctrl+S')
    expect(controls.importing).toBe(false)
    expect(container.querySelector('.document-import-route')?.textContent).toBe('SourcePDF→Target formatMarkdown')
  })

  it('网址输入保留遮罩点击前的输入，确认后按准确参数转换', async () => {
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    const { promise } = await beginUrl()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    const input = container.querySelector<HTMLInputElement>('input')!
    input.value = '  http://example.com/article?q=1#section  '
    act(() => container.querySelector<HTMLDivElement>('.confirm-dialog-overlay')!.click())
    expect(input.isConnected).toBe(true)
    expect(input.value).toContain('http://example.com/article')
    expect(invokeMock).not.toHaveBeenCalled()
    await confirmUrl(input.value)
    expect(container.querySelector('.document-import-route')?.textContent).toBe('SourceURL→Target formatMarkdown')
    expect(container.querySelector('.document-import-panel')?.textContent).not.toContain('example.com')
    await act(async () => { conversion.resolve(converted); await promise })
    expect(invokeMock).toHaveBeenCalledWith('convert_document', { source: { kind: 'url', value: 'http://example.com/article?q=1#section' } })
    expect(createTab).toHaveBeenCalledOnce()
  })

  it.each(['Cancel', 'Escape', 'Close'])('通过 %s 取消网址输入，不启动转换、不建标签', async (action) => {
    const { promise } = await beginUrl()
    await act(async () => {
      if (action === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      else if (action === 'Close') container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
      else button('Cancel').click()
      await promise
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(createTab).not.toHaveBeenCalled()
    expect(notifyErrorMock).not.toHaveBeenCalled()
    expect(controls.importing).toBe(false)
  })

  it('取消本地选择不转换、不建标签', async () => {
    openMock.mockResolvedValue(null)
    await act(async () => { await controls.handleImportLocal() })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(createTab).not.toHaveBeenCalled()
    expect(controls.importing).toBe(false)
  })

  it.each(['javascript:alert(1)', 'file:///tmp/report.pdf', '/relative', 'https://user:secret@example.com', 'https://', 'https://exam ple.com'])('拒绝无效网址 %s', async (value) => {
    const { promise } = await beginUrl()
    await confirmUrl(value)
    await act(async () => { await promise })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(createTab).not.toHaveBeenCalled()
    expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate('en', 'import.error.invalid_url'))
    expect(container.querySelector('.document-import-route')).toBeNull()
  })

  it.each(['en', 'zh-CN'] as const)('全部稳定错误码使用 %s 文案且不创建标签', async (language) => {
    render(language)
    const codes = ['invalid_input', 'unsupported_format', 'file_read_failed', 'input_too_large', 'output_too_large', 'empty_result', 'conversion_failed', 'converter_missing', 'timeout', 'busy', 'network_failed', 'invalid_url']
    for (const code of codes) {
      invokeMock.mockRejectedValueOnce(code)
      await act(async () => { await controls.handleImportLocal() })
      expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate(language, `import.error.${code}`))
      expect(translate(language, `import.error.${code}`)).not.toBe(`import.error.${code}`)
    }
    expect(createTab).not.toHaveBeenCalled()
  })

  it('未知异常不泄漏第三方错误正文', async () => {
    invokeMock.mockRejectedValue('third party traceback with sensitive details')
    await act(async () => { await controls.handleImportLocal() })
    expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate('en', 'import.error.conversion_failed'))
    expect(container.textContent).not.toContain('sensitive details')
    expect(createTab).not.toHaveBeenCalled()
  })

  it.each(['', ' \n\t'])('空转换结果 %j 不创建标签', async (markdown) => {
    invokeMock.mockResolvedValue({ ...converted, markdown })
    await act(async () => { await controls.handleImportLocal() })
    expect(createTab).not.toHaveBeenCalled()
    expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate('en', 'import.error.empty_result'))
  })

  it('浏览器环境不打开文件或网址弹窗，也不发起转换', async () => {
    isTauriMock.mockReturnValue(false)
    await act(async () => { await controls.handleImportLocal(); await controls.handleImportUrl() })
    expect(openMock).not.toHaveBeenCalled()
    expect(container.querySelector('input')).toBeNull()
    expect(invokeMock).not.toHaveBeenCalled()
    expect(createTab).not.toHaveBeenCalled()
    expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate('en', 'import.desktopOnly'))
  })

  it('只在来源选择期间阻止重复弹窗', async () => {
    const selection = deferred<string | null>()
    const conversion = deferred<typeof converted>()
    openMock.mockReturnValueOnce(selection.promise)
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => {
      pending = controls.handleImportLocal()
      await controls.handleImportUrl()
      await controls.handleImportLocal()
    })
    expect(openMock).toHaveBeenCalledOnce()
    expect(controls.importing).toBe(true)
    expect(controls.importPanel).toBeNull()
    await act(async () => { selection.resolve('D:/report.PdF') })
    expect(invokeMock).toHaveBeenCalledOnce()
    expect(container.querySelector('.document-import-route')?.textContent).toBe('SourcePDF→Target formatMarkdown')
    expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate('en', 'import.converting'))
    await act(async () => { conversion.resolve(converted); await pending })
    expect(controls.importing).toBe(false)
    await act(async () => { await controls.handleImportLocal() })
    expect(createTab).toHaveBeenCalledTimes(2)
  })

  it('缺少组件时前往设置，收起下载后能从顶栏恢复并继续导入', async () => {
    invokeMock.mockRejectedValueOnce('converter_missing')
    await act(async () => { await controls.handleImportLocal() })
    expect(container.textContent).toContain('Download the document converter first')
    const install = deferred<boolean>()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_system_fonts') return Promise.resolve([])
      if (command === 'is_converter_component_installed') return Promise.resolve(false)
      if (command === 'is_wechat_ocr_installed') return Promise.resolve(null)
      if (command === 'install_converter_component') return install.promise
      throw new Error(`Unexpected command: ${command}`)
    })
    await act(async () => { button('Open component settings').click() })
    expect(container.querySelector('.settings-nav-item.active')?.textContent).toContain('Components')
    expect(invokeMock).not.toHaveBeenCalledWith('install_converter_component')
    await act(async () => { button('Download document converter').click() })
    expect(invokeMock).toHaveBeenLastCalledWith('install_converter_component')
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(container.querySelector('.document-import-route')).toBeNull()
    act(() => button('Minimize').click())
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    const progress = container.querySelector<HTMLButtonElement>('header button[aria-label="Show converter download progress"]')!
    expect(progress).not.toBeNull()
    act(() => progress.click())
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull()
    act(() => button('Minimize').click())
    await act(async () => { await controls.handleImportLocal() })
    expect(openMock).toHaveBeenCalledOnce()
    await act(async () => { install.resolve(true) })
    expect(container.textContent).toContain('Document converter installed')
    expect(container.querySelector('header button[aria-label="Show converter download progress"]')).toBeNull()
    expect(createTab).not.toHaveBeenCalled()
    openMock.mockResolvedValueOnce('D:\\imports\\scan.webp')
    invokeMock.mockResolvedValueOnce({ markdown: '图片文字', title: null, fileName: 'scan.webp' })
    await act(async () => { await controls.handleImportLocal() })
    expect(container.querySelector('.document-import-route')?.textContent).toContain('WEBP')
    expect(createTab).toHaveBeenCalledWith('scan.md', null, '图片文字', undefined, null, true)
  })

  it('微信 OCR 下载失败后可重试，成功后显示已用于图片导入', async () => {
    const install = deferred<void>()
    let attempts = 0
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_system_fonts') return []
      if (command === 'is_converter_component_installed' || command === 'is_wechat_ocr_installed') return false
      if (command === 'install_wechat_ocr') {
        if (++attempts === 1) throw 'component_integrity_failed'
        return install.promise
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    act(() => container.querySelector<HTMLButtonElement>('.titlebar-right .app-menu > button')!.click())
    await act(async () => { button('About FkeMark').click() })
    const row = () => button('Download WeChat OCR').closest('.settings-row')!
    expect(row().textContent).toContain('Tesseract')
    await act(async () => { button('Download WeChat OCR').click() })
    expect(row().textContent).toContain('The downloaded file could not be verified')
    await act(async () => { button('Download WeChat OCR').click() })
    expect(container.textContent).toContain('Downloading WeChat OCR')
    await act(async () => { button('General').click() })
    await act(async () => { button('Components').click() })
    expect(container.textContent).toContain('Downloading WeChat OCR')
    expect(button('Download WeChat OCR')).toBeUndefined()
    await act(async () => { install.resolve() })
    expect(container.textContent).toContain('WeChat OCR is active for image imports')
    expect(button('Download WeChat OCR')).toBeUndefined()
  })

  it('已安装组件可主动检查更新，当前版本最新时不提示重新安装', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_system_fonts') return Promise.resolve([])
      if (command === 'is_converter_component_installed') return Promise.resolve(true)
      if (command === 'is_wechat_ocr_installed') return Promise.resolve(null)
      if (command === 'check_converter_component_update') return Promise.resolve({
        currentVersion: '0.1.0', latestVersion: '0.1.0', tagName: 'converter-v0.1.0', isNewer: false, releaseNotes: '', releaseDate: '',
      })
      throw new Error(`Unexpected command: ${command}`)
    })
    act(() => container.querySelector<HTMLButtonElement>('.titlebar-right .app-menu > button')!.click())
    await act(async () => { button('About FkeMark').click() })
    await act(async () => { button('Check for converter updates').click() })
    expect(container.querySelector('.update-dialog')?.textContent).toContain('Document converter is up to date')
    expect(invokeMock.mock.calls.some(([command]) => command === 'install_converter_component')).toBe(false)
  })

  it('完整性失败不显示安装成功，并允许再次下载安装', async () => {
    invokeMock.mockRejectedValueOnce('component_integrity_failed').mockResolvedValueOnce(true)
    await act(async () => { await controls.handleInstallConverter() })
    expect(container.textContent).toContain('The downloaded file could not be verified')
    expect(container.textContent).not.toContain('Document converter installed')
    await act(async () => { await controls.handleInstallConverter() })
    expect(container.textContent).toContain('Document converter installed')
  })

  it.each([
    ['D:\\release.v1\\chapter.HtM', 'HTML'],
    ['D:/release.pdf/README', 'Local file'],
  ])('从本地文件名 %s 显示来源 %s', async (path, source) => {
    openMock.mockResolvedValue(path)
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = controls.handleImportLocal() })
    expect(container.querySelector('.document-import-route')?.textContent).toBe(`Source${source}→Target formatMarkdown`)
    await act(async () => { conversion.reject('timeout'); await pending })
    expect(container.querySelector('.document-import-route')?.textContent).toContain(source)
  })

  it.each(['success', 'failure'])('收起后可从顶栏恢复，%s 时重新显示结果', async (outcome) => {
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = controls.handleImportLocal() })
    expect(container.querySelector('.document-import-panel')?.getAttribute('aria-modal')).toBeNull()
    const progress = container.querySelector('[role="progressbar"]')
    expect(progress).not.toBeNull()
    expect(progress?.hasAttribute('aria-valuenow')).toBe(false)
    expect(container.textContent).toContain(translate('en', 'import.collapseHint'))
    act(() => button('Minimize').click())
    expect(container.querySelector('.document-import-panel')).toBeNull()
    expect(controls.importing).toBe(true)
    const indicator = container.querySelector<HTMLButtonElement>('header button[aria-label="Show import tasks (1)"]')!
    expect(indicator).not.toBeNull()
    act(() => indicator.click())
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull()
    act(() => button('Minimize').click())
    await act(async () => {
      if (outcome === 'failure') conversion.reject('timeout')
      else conversion.resolve(converted)
      await pending
    })
    expect(controls.importing).toBe(false)
    expect(container.querySelector('.document-import-panel')).not.toBeNull()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(container.textContent).toContain(translate('en', outcome === 'success' ? 'import.successSave' : 'import.error.timeout'))
    expect(createTab).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0)
  })

  it('多个本地文件和随后提交的网址按顺序转换，一个失败不影响其余任务', async () => {
    const first = deferred<typeof converted>()
    const second = deferred<typeof converted>()
    const third = deferred<Omit<typeof converted, 'title'> & { title: string }>()
    openMock.mockResolvedValueOnce(['D:/first.pdf', 'D:/second.docx'])
    invokeMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
    let files!: Promise<void>
    await act(async () => { files = controls.handleImportLocal() })
    expect(invokeMock.mock.calls).toEqual([['convert_document', { source: { kind: 'file', value: 'D:/first.pdf' } }]])
    act(() => button('Minimize').click())
    act(() => container.querySelector<HTMLButtonElement>('header button[aria-label="New"]')!.click())
    const urlButton = button(translate('en', 'topbar.importUrl'))
    expect(urlButton.disabled).toBe(false)
    act(() => urlButton.click())
    await confirmUrl('https://example.com/report')
    expect(invokeMock).toHaveBeenCalledTimes(1)
    const indicator = container.querySelector<HTMLButtonElement>('header button[aria-label="Show import tasks (3)"]')!
    act(() => indicator.click())
    expect(container.querySelector('.document-import-panel')?.textContent).toContain('second.docx')
    expect(container.querySelector('.document-import-panel')?.textContent).toContain('Queued')
    await act(async () => { first.reject('timeout') })
    expect(invokeMock).toHaveBeenLastCalledWith('convert_document', { source: { kind: 'file', value: 'D:/second.docx' } })
    await act(async () => { second.resolve({ ...converted, fileName: 'second.docx' }); await files })
    act(() => button('Minimize').click())
    expect(container.querySelector('header button[aria-label="Show import tasks (1)"]')).not.toBeNull()
    await act(async () => { third.resolve({ ...converted, title: 'Web report' }) })
    expect(createTab.mock.calls.map(([name]) => name)).toEqual(['second.md', 'Web report.md'])
    expect(container.querySelector('.document-import-panel')?.textContent).toContain(translate('en', 'import.error.timeout'))
    expect(container.querySelector('header button[aria-label^="Show import tasks"]')).toBeNull()
  })

  it.each(['button', 'icon', 'Escape'])('通过 %s 关闭结果不影响新标签，重渲染也不重新弹出', async (action) => {
    await act(async () => { await controls.handleImportLocal() })
    act(() => {
      if (action === 'button') button('Close').click()
      else if (action === 'icon') container.querySelector<HTMLButtonElement>('.document-import-close')!.click()
      else container.querySelector('.document-import-panel button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(controls.importPanel).toBeNull()
    expect(createTab).toHaveBeenCalledOnce()
    render('zh-CN')
    expect(container.querySelector('.document-import-panel')).toBeNull()
  })

  it('面板出现不抢编辑焦点，编辑器 Escape 不收起面板，面板内 Escape 不传播', async () => {
    const editor = container.querySelector<HTMLTextAreaElement>('textarea')!
    editor.focus()
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = controls.handleImportLocal() })
    expect(document.activeElement).toBe(editor)
    const globalKey = vi.fn()
    window.addEventListener('keydown', globalKey)
    try {
      act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(controls.importPanel?.phase).toBe('converting')
      expect(globalKey).toHaveBeenCalledOnce()
      act(() => container.querySelector('.document-import-close')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(controls.importPanel).toBeNull()
      expect(controls.importing).toBe(true)
      expect(globalKey).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', globalKey)
      await act(async () => { conversion.resolve(converted); await pending })
    }
  })

  it('转换中和成功结果随当前语言更新，新输入阶段隐藏旧结果，取消不弹结果', async () => {
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = controls.handleImportLocal() })
    render('zh-CN')
    expect(container.textContent).toContain(translate('zh-CN', 'import.convertingTitle'))
    expect(container.querySelector('.document-import-route')?.textContent).toBe('来源PDF→目标格式Markdown')
    expect(container.textContent).toContain(translate('zh-CN', 'import.collapseHint'))
    await act(async () => { conversion.resolve(converted); await pending })
    expect(container.textContent).toContain(translate('zh-CN', 'import.successSave'))
    const { promise } = await beginUrl()
    expect(container.querySelector('.document-import-panel')).toBeNull()
    expect(controls.importing).toBe(true)
    await act(async () => { button('取消').click(); await promise })
    expect(controls.importing).toBe(false)
    expect(controls.importPanel).toBeNull()
  })

  it.each(['selection', 'conversion', 'failure'])('卸载后忽略 %s 阶段的异步结果', async (stage) => {
    const selection = deferred<string | null>()
    const conversion = deferred<typeof converted>()
    if (stage === 'selection') openMock.mockReturnValueOnce(selection.promise)
    else invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = controls.handleImportLocal() })
    await act(async () => { root.unmount(); unmounted = true })
    await act(async () => {
      if (stage === 'selection') selection.resolve('D:/report.pdf')
      else if (stage === 'failure') conversion.reject('timeout')
      else conversion.resolve(converted)
      await pending
    })
    expect(createTab).not.toHaveBeenCalled()
    expect(notifySuccessMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).not.toHaveBeenCalled()
    if (stage === 'selection') expect(invokeMock).not.toHaveBeenCalled()
  })

  it('转换完成时使用 ref 中最新的 createTab 回调', async () => {
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = controls.handleImportLocal() })
    const latestCreate = vi.fn<CreateTab>().mockReturnValue('latest-tab')
    render('en', latestCreate)
    await act(async () => { conversion.resolve(converted); await pending })
    expect(createTab).not.toHaveBeenCalled()
    expect(latestCreate).toHaveBeenCalledOnce()
  })

  it.each([
    { title: '  ../Unsafe\\title:<name>?*|".md  ', fileName: 'report.pdf', expected: 'Unsafetitlename.md' },
    { title: null, fileName: 'C:\\imports\\annual.report.docx', expected: 'annual.report.md' },
    { title: 'CON', fileName: 'report.pdf', expected: '_CON.md' },
    { title: '.../*?', fileName: 'report.pdf', expected: 'Imported document.md' },
    { title: null, fileName: '', expected: 'report.md' },
  ])('安全命名：$expected', async ({ title, fileName, expected }) => {
    invokeMock.mockResolvedValue({ ...converted, title, fileName })
    await act(async () => { await controls.handleImportLocal() })
    expect(createTab.mock.calls[0][0]).toBe(expected)
  })

  it('长文件名按 UTF-8 字节和字符限制截断，保留完整字符', async () => {
    invokeMock.mockResolvedValue({ ...converted, title: '📝'.repeat(200) })
    await act(async () => { await controls.handleImportLocal() })
    const name = createTab.mock.calls[0][0]
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(203)
    expect(name.length).toBeLessThanOrEqual(103)
    expect(name).not.toContain('\ufffd')
    expect(name).toMatch(/\.md$/)
  })

  it.each(['cancel', 'failure', 'empty'])('%s 不改变当前未保存文档及标签列表', async (outcome) => {
    let state!: Parameters<Parameters<typeof TabsHarness>[0]['onReady']>[0]
    act(() => root.render(<TabsHarness onReady={(value) => { state = value }} />))
    let originalId!: string
    act(() => { originalId = state.createTab('draft.md', null, '# Draft', undefined, null, true) })
    act(() => { state.edit('# Latest unsaved draft') })
    if (outcome === 'cancel') openMock.mockResolvedValue(null)
    else if (outcome === 'failure') invokeMock.mockRejectedValue('conversion_failed')
    else invokeMock.mockResolvedValue({ ...converted, markdown: ' ' })
    await act(async () => { await state.handleImportLocal() })
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(originalId)
    expect(state.currentFile).toBeNull()
    expect(state.isModified).toBe(true)
    let secondId!: string
    act(() => { secondId = state.createTab('another.md', null, '# Another') })
    expect(state.tabContentCache.current.get(originalId)?.content).toBe('# Latest unsaved draft')
    expect(state.activeTabId).toBe(secondId)
  })

  it.each(['live', 'source', 'split', 'read'] as const)('%s 模式导入期间切换标签并继续编辑，原有有路径及无路径内容均保留', async (mode) => {
    let state!: Parameters<Parameters<typeof TabsHarness>[0]['onReady']>[0]
    act(() => root.render(<TabsHarness mode={mode} onReady={(value) => { state = value }} />))
    let savedTab!: string
    let draftTab!: string
    act(() => { savedTab = state.createTab('saved.md', 'D:/notes/saved.md', '# Saved', undefined, 123) })
    act(() => { state.edit('# Unsaved edits to saved file') })
    act(() => { draftTab = state.createTab('draft.md', null, '# Draft', undefined, null, true) })
    act(() => { state.edit('# Draft edited before conversion') })
    const conversion = deferred<typeof converted>()
    invokeMock.mockReturnValueOnce(conversion.promise)
    let pending!: Promise<void>
    await act(async () => { pending = state.handleImportLocal() })
    act(() => { state.switchToTab(savedTab) })
    act(() => { state.edit('# Saved file edited DURING conversion') })
    // 父状态仍为上次载入的快照，当前编辑器 ref 才持有尚未回写的最新内容。
    expect(state.fileContent).toBe('# Unsaved edits to saved file')
    await act(async () => { conversion.resolve(converted); await pending })
    expect(state.tabs).toHaveLength(3)
    expect(state.currentFile).toBeNull()
    expect(state.isModified).toBe(true)
    expect(state.saveStatus).toBe('unsaved')
    expect(state.fileContent).toBe(converted.markdown)
    const importedId = state.activeTabId!
    expect(state.tabContentCache.current.get(importedId)).toMatchObject({ content: converted.markdown, isModified: true, editorMode: mode, lastSavedAt: null })
    expect(state.tabContentCache.current.get(savedTab)).toMatchObject({ content: '# Saved file edited DURING conversion', path: 'D:/notes/saved.md', isModified: true, lastSavedAt: 123 })
    expect(state.tabContentCache.current.get(draftTab)).toMatchObject({ content: '# Draft edited before conversion', isModified: true })
    act(() => { state.switchToTab(draftTab) })
    expect(state.fileContent).toBe('# Draft edited before conversion')
    act(() => { state.switchToTab(savedTab) })
    expect(state.fileContent).toBe('# Saved file edited DURING conversion')
    act(() => { state.switchToTab(importedId) })
    expect(state.fileContent).toBe(converted.markdown)
  })
})
