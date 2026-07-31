import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsAppearanceSection } from '../src/components/settings/SettingsAppearanceSection'
import type { AppSettings } from '../src/types'

const t = (key: string, params?: Record<string, string | number>) => {
  let value = key
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

const numInputStyle = {}

describe('SettingsAppearanceSection theme picker', () => {
  let container: HTMLDivElement
  let root: Root
  let latestSettings: AppSettings

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestSettings = DEFAULT_SETTINGS
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderSection(initial: AppSettings = DEFAULT_SETTINGS, systemDark = false) {
    function Harness() {
      const [settings, setSettings] = useState(initial)
      latestSettings = settings
      return (
        <SettingsAppearanceSection
          t={t}
          settings={settings}
          update={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          numInputStyle={numInputStyle}
          systemDark={systemDark}
        />
      )
    }

    act(() => root.render(<Harness />))
  }

  it('uses mode buttons instead of the legacy theme select', () => {
    renderSection({ ...DEFAULT_SETTINGS, theme: 'github' })

    expect(container.querySelector('.theme-select')).toBeNull()
    const modeButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.theme-mode-tab'))
    expect(modeButtons).toHaveLength(3)
    expect(modeButtons[0].getAttribute('aria-pressed')).toBe('true')

    act(() => modeButtons[1].click())
    expect(latestSettings.theme).toBe('dark')
  })

  it('keeps system selected while showing palettes for the resolved brightness', () => {
    renderSection({ ...DEFAULT_SETTINGS, theme: 'system' }, true)

    const modeButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.theme-mode-tab'))
    expect(modeButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(container.querySelector('.theme-card-grid')?.getAttribute('data-theme-tone')).toBe('dark')
    expect(container.querySelector('[data-theme-card="codex"]')).not.toBeNull()
    expect(container.querySelector('[data-theme-card="github"]')).toBeNull()
  })

  it('shows six palettes for each active brightness mode', () => {
    renderSection({ ...DEFAULT_SETTINGS, theme: 'dark' })

    expect(container.querySelectorAll('[data-theme-card]')).toHaveLength(6)
    expect(container.querySelector('[data-theme-card="codex"]')).not.toBeNull()
    expect(container.querySelector('[data-theme-card="github"]')).toBeNull()

    const lightButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.theme-mode-tab'))[0]
    act(() => lightButton.click())

    expect(latestSettings.theme).toBe('light')
    expect(container.querySelectorAll('[data-theme-card]')).toHaveLength(6)
    expect(container.querySelector('[data-theme-card="github"]')).not.toBeNull()
    expect(container.querySelector('[data-theme-card="codex"]')).toBeNull()
  })

  it('uses current system brightness for the system mode palette list', () => {
    renderSection({ ...DEFAULT_SETTINGS, theme: 'system' }, true)

    expect(container.querySelector('[data-theme-card="codex"]')).not.toBeNull()
    expect(container.querySelector('[data-theme-card="github"]')).toBeNull()
  })

  it('selects a palette card as the persisted theme', () => {
    renderSection({ ...DEFAULT_SETTINGS, theme: 'light' })

    const githubCard = container.querySelector<HTMLButtonElement>('[data-theme-card="github"]')
    expect(githubCard).not.toBeNull()

    act(() => githubCard!.click())
    expect(latestSettings.theme).toBe('github')
  })
})
