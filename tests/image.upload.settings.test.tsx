import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { SettingsImageUploadSection } from '../src/components/settings/SettingsImageUploadSection'
import type { AppSettings } from '../src/types'

const t = (key: string, params?: Record<string, string | number>) => {
  let value = key
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

function chooseOption(value: string) {
  const trigger = document.querySelector<HTMLButtonElement>('.image-upload-mode-select .fke-select-trigger')
  expect(trigger).not.toBeNull()
  act(() => trigger!.click())

  const option = document.body.querySelector<HTMLElement>(`.fke-select-option[data-value="${value}"]`)
  expect(option).not.toBeNull()
  act(() => {
    option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    option!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    option!.click()
  })
}

describe('SettingsImageUploadSection mode select', () => {
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

  it('updates the upload mode when a dropdown option is chosen', () => {
    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      latestSettings = settings
      return (
        <SettingsImageUploadSection
          t={t}
          settings={settings}
          update={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
      )
    }

    act(() => root.render(<Harness />))
    expect(latestSettings.imageUploadMode).toBe('local')

    chooseOption('smms')
    expect(latestSettings.imageUploadMode).toBe('smms')
    expect(container.textContent).toContain('imageUpload.settings.smmsToken')
  })
})

describe('SettingsPanel image upload mode', () => {
  let container: HTMLDivElement
  let root: Root
  let latestSettings: AppSettings
  let closed: boolean

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestSettings = DEFAULT_SETTINGS
    closed = false
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('changes the upload mode without closing the settings overlay', async () => {
    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      latestSettings = settings
      return (
        <SettingsPanel
          open={true}
          onClose={() => { closed = true }}
          settings={settings}
          onSettingsChange={setSettings}
          initialSection="images"
        />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    chooseOption('base64')
    expect(latestSettings.imageUploadMode).toBe('base64')
    expect(closed).toBe(false)
    expect(container.querySelector('.settings-page')).not.toBeNull()
    expect(container.textContent).toContain('图片直接内联到 Markdown')
  })
})
