import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { TopBar } from '../src/components/TopBar'
import type { AppSettings } from '../src/types'

vi.mock('../src/hooks/useTauriWindow', () => ({
  useTauriWindow: () => ({
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    startDragging: vi.fn(),
  }),
}))

vi.mock('../src/utils/updater', () => ({
  GITHUB_URLS: {
    repo: 'https://example.com/repo',
    newIssue: 'https://example.com/issues/new',
    releases: 'https://example.com/releases',
  },
  openExternalUrl: vi.fn(),
}))

describe('topbar menus', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderTopBar(props: {
    sidebarCollapsed?: boolean
    onToggleSidebar?: () => void
    onCheckUpdate?: () => void
    onImportLocal?: () => void
    onImportUrl?: () => void
    importing?: boolean
  } = {}) {
    act(() => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <TopBar
          currentFile="notes.md"
          isModified={false}
          theme={'system' as AppSettings['theme']}
          editorMode="live"
          onToggleTheme={() => {}}
          onThemeChange={() => {}}
          onOpenSettings={() => {}}
          onExport={() => {}}
          onManageImages={() => {}}
          onSave={() => {}}
          onEditorModeChange={() => {}}
          onNewTextFile={() => {}}
          onOpenFile={() => {}}
          onOpenFolder={() => {}}
          onNewWindow={() => {}}
          sidebarCollapsed={props.sidebarCollapsed}
          onToggleSidebar={props.onToggleSidebar}
          onCheckUpdate={props.onCheckUpdate}
          onImportLocal={props.onImportLocal}
          onImportUrl={props.onImportUrl}
          importing={props.importing}
        />
      </I18nProvider>,
    ))
  }

  it('toggles the main menu with a close icon state', () => {
    renderTopBar()

    const menu = container.querySelector('.titlebar-right .app-menu')!
    const button = menu.querySelector<HTMLButtonElement>('.app-menu-btn')!
    const dropdown = menu.querySelector<HTMLElement>('.app-menu-dropdown')!

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Menu')
    expect(dropdown.classList.contains('open')).toBe(false)

    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Close menu')
    expect(button.classList.contains('open')).toBe(true)
    expect(dropdown.classList.contains('open')).toBe(true)
    expect(button.querySelectorAll('line')).toHaveLength(2)

    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Menu')
    expect(dropdown.classList.contains('open')).toBe(false)
  })

  it('toggles the new menu with a close icon state', () => {
    renderTopBar()

    const menu = container.querySelector('.new-menu')!
    const button = menu.querySelector<HTMLButtonElement>('.new-menu-btn')!
    const dropdown = menu.querySelector<HTMLElement>('.app-menu-dropdown')!

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('New')
    expect(dropdown.classList.contains('open')).toBe(false)

    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Close menu')
    expect(button.classList.contains('open')).toBe(true)
    expect(dropdown.classList.contains('open')).toBe(true)
    expect(button.querySelectorAll('line')).toHaveLength(2)
  })

  it('checks for updates from the top-right menu', () => {
    const onCheckUpdate = vi.fn()
    renderTopBar({ onCheckUpdate })
    act(() => container.querySelector<HTMLButtonElement>('.titlebar-right .app-menu-btn')!.click())
    const item = Array.from(container.querySelectorAll<HTMLButtonElement>('.app-menu-item'))
      .find((button) => button.textContent?.includes('Check for Updates'))
    expect(item).toBeTruthy()
    act(() => item!.click())
    expect(onCheckUpdate).toHaveBeenCalledOnce()
    expect(container.querySelector('.app-menu-dropdown')?.classList.contains('open')).toBe(false)
  })

  it('新建菜单的本地及网址导入入口分别调用回调并关闭菜单', () => {
    const onImportLocal = vi.fn()
    const onImportUrl = vi.fn()
    renderTopBar({ onImportLocal, onImportUrl })
    const menu = container.querySelector('.new-menu')!
    const toggle = menu.querySelector<HTMLButtonElement>('.new-menu-btn')!
    for (const [label, callback] of [['Import local document…', onImportLocal], ['Import from URL…', onImportUrl]] as const) {
      act(() => toggle.click())
      const item = Array.from(menu.querySelectorAll<HTMLButtonElement>('.app-menu-item')).find((button) => button.textContent?.includes(label))!
      expect(item).toBeTruthy()
      act(() => item.click())
      expect(callback).toHaveBeenCalledOnce()
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('转换忙碌时禁用两个入口并显示状态，不影响新建文件操作', () => {
    const onImportLocal = vi.fn()
    const onImportUrl = vi.fn()
    renderTopBar({ onImportLocal, onImportUrl, importing: true })
    act(() => container.querySelector<HTMLButtonElement>('.new-menu-btn')!.click())
    const menu = container.querySelector('.new-menu')!
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('.app-menu-item'))
    for (const label of ['Import local document…', 'Import from URL…']) {
      const item = buttons.find((button) => button.textContent?.includes(label))!
      expect(item.disabled).toBe(true)
      act(() => item.click())
    }
    expect(onImportLocal).not.toHaveBeenCalled()
    expect(onImportUrl).not.toHaveBeenCalled()
    expect(menu.querySelector('[role="status"]')?.textContent).toBe('Importing…')
    expect(buttons.find((button) => button.textContent?.includes('New Text File'))?.disabled).toBe(false)
  })

  it('uses different sidebar panel icons when collapsed and expanded', () => {
    renderTopBar({ sidebarCollapsed: false, onToggleSidebar: () => {} })
    const expanded = container.querySelector('.sidebar-toggle')!
    expect(expanded.getAttribute('aria-expanded')).toBe('true')
    expect(expanded.querySelector('polyline')).toBeNull()
    const expandedLine = expanded.querySelector('line')?.getAttribute('x1')

    renderTopBar({ sidebarCollapsed: true, onToggleSidebar: () => {} })
    const collapsed = container.querySelector('.sidebar-toggle')!
    expect(collapsed.getAttribute('aria-expanded')).toBe('false')
    expect(collapsed.querySelector('polyline')).toBeNull()
    const collapsedLine = collapsed.querySelector('line')?.getAttribute('x1')

    expect(expandedLine).toBe('9')
    expect(collapsedLine).toBe('15')
  })
})
