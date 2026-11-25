import { act, useLayoutEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { DocumentImportPanel } from '../src/components/DocumentImportPanel'
import { translate, type Lang } from '../src/i18n'
import { useDocumentImport } from '../src/app/useDocumentImport'
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
vi.mock('../src/utils/tauri', () => ({ isTauri: isTauriMock }))
vi.mock('../src/utils/toast', () => ({
  notifyError: notifyErrorMock,
  notifyInfo: notifyInfoMock,
  notifySuccess: notifySuccessMock,
  dismissToast: dismissToastMock,
}))

type ImportControls = ReturnType<typeof useDocumentImport>
type CreateTab = ReturnType<typeof useAppTabs>['createTab']

function ImportHarness({ createTab, language = 'en', onReady }: {
  createTab: CreateTab
  language?: Lang
  onReady: (controls: ImportControls) => void
}) {
  const controls = useDocumentImport({ language, createTab })
  onReady(controls)
  return <>
    <ConfirmDialog lang={language} />
    <DocumentImportPanel state={controls.importPanel} language={language} onClose={controls.closeImportPanel} />
    <textarea aria-label="editor" />
  </>
}

function TabsHarness({ onReady, mode = 'live' }: {
  onReady: (controls: ImportControls & ReturnType<typeof useAppTabs> & {
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
  let controls: ImportControls
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

  async function confirmUrl(value: string) {
    container.querySelector<HTMLInputElement>('input')!.value = value
    await act(async () => { button('OK').click() })
  }

  it('使用固定文件参数，并只创建一个无路径且已修改的新标签', async () => {
    await act(async () => { await controls.handleImportLocal() })
    expect(openMock).toHaveBeenCalledWith(expect.objectContaining({
      directory: false,
      multiple: false,
      filters: [{ name: 'Supported documents', extensions: ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'html', 'htm', 'epub', 'txt', 'csv', 'json', 'xml'] }],
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
    input.value = '  https://example.com/article?q=1#section  '
    act(() => container.querySelector<HTMLDivElement>('.confirm-dialog-overlay')!.click())
    expect(input.isConnected).toBe(true)
    expect(input.value).toContain('https://example.com/article')
    expect(invokeMock).not.toHaveBeenCalled()
    await confirmUrl(input.value)
    expect(container.querySelector('.document-import-route')?.textContent).toBe('SourceURL→Target formatMarkdown')
    expect(container.querySelector('.document-import-panel')?.textContent).not.toContain('example.com')
    await act(async () => { conversion.resolve(converted); await promise })
    expect(invokeMock).toHaveBeenCalledWith('convert_document', { source: { kind: 'url', value: 'https://example.com/article?q=1#section' } })
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

  it('同步防重入覆盖选择文件与异步转换阶段，完成后允许再次导入', async () => {
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
    await act(async () => { await controls.handleImportLocal() })
    expect(openMock).toHaveBeenCalledOnce()
    await act(async () => { conversion.resolve(converted); await pending })
    expect(controls.importing).toBe(false)
    await act(async () => { await controls.handleImportLocal() })
    expect(createTab).toHaveBeenCalledTimes(2)
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

  it.each(['success', 'failure'])('收起后仍执行转换并禁止重入，%s 时重新显示结果', async (outcome) => {
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
    await act(async () => { await controls.handleImportLocal(); await controls.handleImportUrl() })
    expect(openMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledOnce()
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
