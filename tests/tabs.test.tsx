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

const confirmMock = vi.hoisted(() => vi.fn())

vi.mock('../src/components/ConfirmDialog', () => ({
  showAlert: vi.fn(),
  showCloseTabDialog: vi.fn(),
  showConfirm: confirmMock,
  showPrompt: vi.fn(),
}))

describe('document tabs', () => {
  let container: HTMLDivElement
  let root: Root
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    confirmMock.mockReset()
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
})
