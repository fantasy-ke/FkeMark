import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileActionBar } from '../src/components/mobile/MobileActionBar'
import { MobileDocumentBar } from '../src/components/mobile/MobileDocumentBar'
import { I18nProvider } from '../src/i18n'
import { EditorModeEnum } from '../src/types'

function renderMobile(ui: ReactNode) {
  return (
    <I18nProvider language="en" setLanguage={() => {}}>
      {ui}
    </I18nProvider>
  )
}

describe('mobile layout components', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('renders a bottom action bar with mobile primary actions', async () => {
    const onToggleSidebar = vi.fn()
    const onNewTextFile = vi.fn()
    const onSave = vi.fn()
    const onToggleAi = vi.fn()
    const onOpenSettings = vi.fn()

    await act(async () => root.render(renderMobile(
      <MobileActionBar
        sidebarOpen
        aiOpen={false}
        isModified
        onToggleSidebar={onToggleSidebar}
        onNewTextFile={onNewTextFile}
        onSave={onSave}
        onToggleAi={onToggleAi}
        onOpenSettings={onOpenSettings}
      />,
    )))

    const buttons = Array.from(container.querySelectorAll('.mobile-action-bar__button')) as HTMLButtonElement[]
    expect(container.querySelector('.mobile-action-bar')?.getAttribute('aria-label')).toBe('Mobile actions')
    expect(buttons).toHaveLength(5)
    expect(buttons.map((button) => button.textContent)).toEqual(['Files', 'New', 'Save', 'AI', 'Settings'])
    expect(buttons[0].className).toContain('active')
    expect(buttons[2].className).toContain('dirty')
    expect(container.querySelector('.mobile-action-bar__dirty-dot')).toBeTruthy()

    await act(async () => buttons[0].click())
    await act(async () => buttons[1].click())
    await act(async () => buttons[2].click())
    await act(async () => buttons[3].click())
    await act(async () => buttons[4].click())

    expect(onToggleSidebar).toHaveBeenCalledTimes(1)
    expect(onNewTextFile).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onToggleAi).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('renders document status and a compact editor mode switcher', async () => {
    const onEditorModeChange = vi.fn()

    await act(async () => root.render(renderMobile(
      <MobileDocumentBar
        displayName="notes.md"
        isModified={false}
        saveStatus="saved"
        syncLabel="Saved"
        lastSavedLabel="12:30"
        lineCount={28}
        editorMode={EditorModeEnum.Split}
        onEditorModeChange={onEditorModeChange}
      />,
    )))

    expect(container.querySelector('.mobile-document-bar__name')?.textContent).toBe('notes.md')
    expect(container.querySelector('.mobile-document-bar__meta')?.textContent).toContain('Saved')
    expect(container.querySelector('.mobile-document-bar__meta')?.textContent).toContain('Line 28, Col 1')

    const modeButtons = Array.from(container.querySelectorAll('.mobile-document-bar__mode')) as HTMLButtonElement[]
    expect(modeButtons.map((button) => button.textContent)).toEqual(['Edit', 'Split', 'Read', 'Source'])
    expect(modeButtons[1].className).toContain('active')

    await act(async () => modeButtons[3].click())
    expect(onEditorModeChange).toHaveBeenCalledWith(EditorModeEnum.Source)
  })
})
