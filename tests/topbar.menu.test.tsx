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

  function renderTopBar() {
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
})
