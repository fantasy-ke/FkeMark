import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, translate } from '../src/i18n'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { useAppTabs } from '../src/app/useAppTabs'
import { TabBar } from '../src/components/TabBar'
import { SettingsViewSection } from '../src/components/settings/SettingsViewSection'
import type { DocumentSyncStatus } from '../src/utils/documentStats'
import type { EditorMode } from '../src/types'
import { enqueueDocumentSave } from '../src/app/documentSaveQueue'

const confirmMock = vi.hoisted(() => vi.fn())
const closeTabDialogMock = vi.hoisted(() => vi.fn())
const invokeMock = vi.hoisted(() => vi.fn())
const isTauriMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('../src/components/ConfirmDialog', () => ({
  showAlert: vi.fn(),
  showCloseTabDialog: closeTabDialogMock,
  showConfirm: confirmMock,
  showPrompt: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

vi.mock('../src/utils/tauri', () => ({ isTauri: isTauriMock }))

describe('document tabs', () => {
  let container: HTMLDivElement
  let root: Root
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    confirmMock.mockReset()
    closeTabDialogMock.mockReset()
    isTauriMock.mockReturnValue(true)
    invokeMock.mockReset()
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: () => void }).scrollIntoView
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })



  it('shows Close All Tabs in the tab context menu', () => {
    const onCloseAll = vi.fn()
    act(() => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <TabBar
          tabs={[
            { id: 'tab-1', name: 'one.md', path: '/one.md', isModified: false },
            { id: 'tab-2', name: 'two.md', path: '/two.md', isModified: false },
          ]}
          activeTabId="tab-1"
          tabOverflowMode="scroll"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onCloseOthers={() => {}}
          onCloseAll={onCloseAll}
          onNewTab={() => {}}
        />
      </I18nProvider>,
    ))

    const firstTab = container.querySelector<HTMLElement>('[data-tab-id="tab-1"]')!
    act(() => firstTab.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 80,
    })))

    const closeAllItem = Array.from(document.body.querySelectorAll<HTMLElement>('.tab-ctx-item'))
      .find((item) => item.textContent?.includes('Close All Tabs'))
    expect(closeAllItem).toBeDefined()

    act(() => closeAllItem!.click())
    expect(onCloseAll).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.tab-context-menu')).toBeNull()
  })

  it('scrolls overflowing tabs horizontally with the mouse wheel in single-line mode', () => {
    act(() => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <TabBar
          tabs={[
            { id: 'tab-1', name: 'one.md', path: '/one.md', isModified: false },
            { id: 'tab-2', name: 'two.md', path: '/two.md', isModified: false },
          ]}
          activeTabId="tab-1"
          tabOverflowMode="scroll"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onCloseOthers={() => {}}
          onCloseAll={() => {}}
          onNewTab={() => {}}
        />
      </I18nProvider>,
    ))

    const scrollContainer = container.querySelector<HTMLDivElement>('.tab-bar-scroll')!
    Object.defineProperties(scrollContainer, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 200 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 })

    act(() => scrollContainer.dispatchEvent(wheelEvent))

    expect(scrollContainer.scrollLeft).toBe(40)
    expect(wheelEvent.defaultPrevented).toBe(true)
  })

  it('switches the tab bar to multi-line wrapping from view settings', () => {
    const update = vi.fn()

    act(() => root.render(
      <>
        <SettingsViewSection
          t={(key, values) => translate('en', key, values)}
          settings={DEFAULT_SETTINGS}
          update={update}
          fontGroups={{ default: [], cjk: [], latin: [], mono: [] }}
          groupLabels={{ default: 'Default', cjk: 'CJK', latin: 'Latin', mono: 'Monospace' }}
          numInputStyle={{}}
        />
        <I18nProvider language="en" setLanguage={() => {}}>
          <TabBar
            tabs={[
              { id: 'tab-1', name: 'one.md', path: '/one.md', isModified: false },
              { id: 'tab-2', name: 'two.md', path: '/two.md', isModified: false },
            ]}
            activeTabId="tab-1"
            tabOverflowMode="wrap"
            onTabClick={() => {}}
            onTabClose={() => {}}
            onCloseOthers={() => {}}
            onCloseAll={() => {}}
            onNewTab={() => {}}
          />
        </I18nProvider>
      </>,
    ))

    expect(DEFAULT_SETTINGS.tabOverflowMode).toBe('scroll')
    expect(container.querySelector('.tab-bar')?.classList.contains('tab-bar--wrap')).toBe(true)
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()

    const wrapButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.settings-radio-btn'))
      .find((button) => button.textContent === 'Multi-line wrap')
    expect(wrapButton).toBeDefined()

    act(() => wrapButton!.click())
    expect(update).toHaveBeenCalledWith({ tabOverflowMode: 'wrap' })
  })


  it('批量替换同步干净标签缓存，但保留异步期间产生的未保存修改', () => {
    let api: ReturnType<typeof useAppTabs> | null = null

    function Harness() {
      const [currentFile, setCurrentFile] = useState<string | null>(null)
      const [fileContent, setFileContent] = useState('')
      const [isModified, setIsModified] = useState(false)
      const [editorMode, setEditorMode] = useState<EditorMode>('live')
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<DocumentSyncStatus>('saved')
      api = useAppTabs({
        currentFile,
        setCurrentFile,
        setFileContent,
        isModified,
        setIsModified,
        editorMode,
        setEditorMode,
        lastSavedAt,
        setLastSavedAt,
        setSaveStatus,
        currentFolderPath: null,
        scanFolder: async () => {},
        language: 'en',
        getCurrentContent: () => fileContent,
        snapshotLimit: 20,
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => { api!.createTab('one.md', '/one.md', 'one', 'live', null, true) })
    act(() => { api!.createTab('two.md', '/two.md', 'two') })
    const oneTab = api!.tabs.find((tab) => tab.path === '/one.md')!
    const twoTab = api!.tabs.find((tab) => tab.path === '/two.md')!

    act(() => api!.applyExternalDocumentChanges([
      { path: '/one.md', content: 'external one' },
      { path: '/two.md', content: 'external two' },
    ]))

    expect(api!.tabContentCache.current.get(oneTab.id)).toEqual(expect.objectContaining({
      content: 'one',
      isModified: true,
    }))
    expect(api!.tabContentCache.current.get(twoTab.id)).toEqual(expect.objectContaining({
      content: 'external two',
      isModified: false,
    }))
  })
  it('keeps all tabs when unsaved confirmation is cancelled and clears them after confirmation', async () => {
    let api: ReturnType<typeof useAppTabs> | null = null

    function Harness() {
      const [currentFile, setCurrentFile] = useState<string | null>(null)
      const [fileContent, setFileContent] = useState('')
      const [isModified, setIsModified] = useState(false)
      const [editorMode, setEditorMode] = useState<EditorMode>('live')
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<DocumentSyncStatus>('saved')
      api = useAppTabs({
        currentFile,
        setCurrentFile,
        setFileContent,
        isModified,
        setIsModified,
        editorMode,
        setEditorMode,
        lastSavedAt,
        setLastSavedAt,
        setSaveStatus,
        currentFolderPath: null,
        scanFolder: async () => {},
        language: 'en',
        getCurrentContent: () => fileContent,
        snapshotLimit: 20,
      })
      return <div data-count={api.tabs.length} data-active={api.activeTabId || ''} data-content={fileContent} />
    }

    act(() => root.render(<Harness />))
    act(() => { api!.createTab('one.md', '/one.md', 'one', 'live', null, true) })
    act(() => { api!.createTab('two.md', '/two.md', 'two') })
    expect(container.querySelector('[data-count="2"]')).not.toBeNull()

    confirmMock.mockResolvedValueOnce(false)
    await act(async () => { await api!.closeAllTabs() })
    expect(confirmMock).toHaveBeenCalledWith(
      '1 tab(s) have unsaved changes. Closing all tabs will discard those changes. Continue?',
      'Close Tab',
    )
    expect(container.querySelector('[data-count="2"]')).not.toBeNull()

    confirmMock.mockResolvedValueOnce(true)
    await act(async () => { await api!.closeAllTabs() })
    expect(container.querySelector('[data-count="0"]')).not.toBeNull()
    expect(container.querySelector('[data-active=""]')).not.toBeNull()
    expect(container.querySelector('[data-content=""]')).not.toBeNull()
  })
  it('关闭标签保存等待共享保存队列完成后才写入', async () => {
    let api: ReturnType<typeof useAppTabs> | null = null
    let releaseQueuedSave: (() => void) | null = null

    function Harness() {
      const [currentFile, setCurrentFile] = useState<string | null>(null)
      const [fileContent, setFileContent] = useState('')
      const [isModified, setIsModified] = useState(false)
      const [editorMode, setEditorMode] = useState<EditorMode>('live')
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<DocumentSyncStatus>('saved')
      api = useAppTabs({
        currentFile,
        setCurrentFile,
        setFileContent,
        isModified,
        setIsModified,
        editorMode,
        setEditorMode,
        lastSavedAt,
        setLastSavedAt,
        setSaveStatus,
        currentFolderPath: null,
        scanFolder: async () => {},
        language: 'en',
        getCurrentContent: () => fileContent,
        snapshotLimit: 20,
      })
      return <div data-count={api.tabs.length} />
    }

    invokeMock.mockResolvedValue({})
    closeTabDialogMock.mockResolvedValue('save')
    await act(async () => { root.render(<Harness />) })
    act(() => { api!.createTab('one.md', '/one.md', 'one', 'live', null, true) })
    const tab = api!.tabs.find((item) => item.path === '/one.md')!

    const queuedSave = enqueueDocumentSave(() => new Promise<void>((resolve) => {
      releaseQueuedSave = resolve
    }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const closePromise = api!.closeTab(tab.id)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(container.querySelector('[data-count="1"]')).not.toBeNull()

    await act(async () => {
      releaseQueuedSave?.()
      await Promise.all([queuedSave, closePromise])
    })
    expect(invokeMock).toHaveBeenCalledWith('write_file_command', expect.objectContaining({
      path: '/one.md',
      content: 'one',
    }))
    expect(container.querySelector('[data-count="0"]')).not.toBeNull()
  })
  it('关闭标签保存等待期间内容变化时不会写入陈旧快照', async () => {
    let api: ReturnType<typeof useAppTabs> | null = null
    let releaseQueuedSave: (() => void) | null = null
    const documentRevisionRef = { current: new Map<string, number>() }

    function Harness() {
      const [currentFile, setCurrentFile] = useState<string | null>(null)
      const [fileContent, setFileContent] = useState('')
      const [isModified, setIsModified] = useState(false)
      const [editorMode, setEditorMode] = useState<EditorMode>('live')
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<DocumentSyncStatus>('saved')
      api = useAppTabs({
        currentFile,
        setCurrentFile,
        setFileContent,
        isModified,
        setIsModified,
        editorMode,
        setEditorMode,
        lastSavedAt,
        setLastSavedAt,
        setSaveStatus,
        currentFolderPath: null,
        scanFolder: async () => {},
        language: 'en',
        getCurrentContent: () => fileContent,
        snapshotLimit: 20,
        documentRevisionRef,
      })
      return <div data-count={api.tabs.length} />
    }

    invokeMock.mockResolvedValue({})
    closeTabDialogMock.mockResolvedValue('save')
    await act(async () => { root.render(<Harness />) })
    act(() => { api!.createTab('one.md', '/one.md', 'one', 'live', null, true) })
    const tab = api!.tabs.find((item) => item.path === '/one.md')!
    documentRevisionRef.current.set(tab.id, 0)

    const queuedSave = enqueueDocumentSave(() => new Promise<void>((resolve) => {
      releaseQueuedSave = resolve
    }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const closePromise = api!.closeTab(tab.id)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    documentRevisionRef.current.set(tab.id, 1)
    const cached = api!.tabContentCache.current.get(tab.id)!
    api!.tabContentCache.current.set(tab.id, { ...cached, content: 'new', isModified: true })
    await act(async () => {
      releaseQueuedSave?.()
      await Promise.all([queuedSave, closePromise])
    })

    expect(invokeMock).not.toHaveBeenCalled()
    expect(container.querySelector('[data-count="1"]')).not.toBeNull()
    expect(api!.tabContentCache.current.get(tab.id)).toEqual(expect.objectContaining({ content: 'new', isModified: true }))
  })
  it('浏览器环境关闭已有路径标签时通过下载保存且不调用 Tauri', async () => {
    let api: ReturnType<typeof useAppTabs> | null = null
    const createObjectURL = vi.fn(() => 'blob:close-tab')
    const revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    function Harness() {
      const [currentFile, setCurrentFile] = useState<string | null>(null)
      const [fileContent, setFileContent] = useState('')
      const [isModified, setIsModified] = useState(false)
      const [editorMode, setEditorMode] = useState<EditorMode>('live')
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<DocumentSyncStatus>('saved')
      api = useAppTabs({
        currentFile,
        setCurrentFile,
        setFileContent,
        isModified,
        setIsModified,
        editorMode,
        setEditorMode,
        lastSavedAt,
        setLastSavedAt,
        setSaveStatus,
        currentFolderPath: null,
        scanFolder: async () => {},
        language: 'en',
        getCurrentContent: () => fileContent,
        snapshotLimit: 20,
      })
      return null
    }

    isTauriMock.mockReturnValue(false)
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    closeTabDialogMock.mockResolvedValue('save')
    await act(async () => { root.render(<Harness />) })
    act(() => { api!.createTab('one.md', 'D:/notes/one.md', 'one', 'live', null, true) })
    const tab = api!.tabs.find((item) => item.path === 'D:/notes/one.md')!

    await act(async () => { await api!.closeTab(tab.id) })

    expect(invokeMock).not.toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(anchorClick).toHaveBeenCalledTimes(1)
  })

  it('closes a renamed tab even if delete uses a different path separator', () => {
    let api: ReturnType<typeof useAppTabs> | null = null

    function Harness() {
      const [currentFile, setCurrentFile] = useState<string | null>(null)
      const [fileContent, setFileContent] = useState('')
      const [isModified, setIsModified] = useState(false)
      const [editorMode, setEditorMode] = useState<EditorMode>('live')
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<DocumentSyncStatus>('saved')
      api = useAppTabs({
        currentFile,
        setCurrentFile,
        setFileContent,
        isModified,
        setIsModified,
        editorMode,
        setEditorMode,
        lastSavedAt,
        setLastSavedAt,
        setSaveStatus,
        currentFolderPath: null,
        scanFolder: async () => {},
        language: 'en',
        getCurrentContent: () => fileContent,
        snapshotLimit: 20,
      })
      return <div data-count={api.tabs.length} />
    }

    act(() => root.render(<Harness />))
    act(() => { api!.createTab('one.md', 'D:/notes/one.md', 'one') })
    act(() => { api!.replaceTabPathPrefix('D:/notes/one.md', 'D:\\notes\\renamed.md') })
    expect(api!.tabs[0]?.path).toBe('D:\\notes\\renamed.md')

    act(() => { api!.removeTabsByPathPrefix('D:/notes/renamed.md') })
    expect(container.querySelector('[data-count="0"]')).not.toBeNull()
  })
})
