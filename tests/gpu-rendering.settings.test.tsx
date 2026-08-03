import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { translate } from '../src/i18n'
import type { AppSettings } from '../src/types'

describe('GPU rendering acceleration', () => {
  it('provides a persisted default, translations, root class, and compositor styles', () => {
    const appLayoutSource = readFileSync(resolve(process.cwd(), 'src/app/AppLayout.tsx'), 'utf8')
    const layoutCss = readFileSync(resolve(process.cwd(), 'src/styles/layout.css'), 'utf8')

    expect(DEFAULT_SETTINGS.gpuRenderingEnabled).toBe(false)
    expect(translate('zh-CN', 'experimental.gpuRendering')).toBe('GPU 渲染加速')
    expect(translate('en', 'experimental.gpuRendering')).toBe('GPU rendering acceleration')
    expect(appLayoutSource).toContain("settings.gpuRenderingEnabled ? ' gpu-rendering-enabled' : ''")
    expect(layoutCss).toContain('.app-container.gpu-rendering-enabled')
    expect(layoutCss).not.toContain('transform: translateZ(0);')
    expect(layoutCss).not.toContain('will-change: width')
    expect(layoutCss).toContain('will-change: scroll-position;')
  })
})

describe('SettingsPanel GPU rendering toggle', () => {
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

  it('updates the setting without requiring a restart', async () => {
    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      latestSettings = settings
      return (
        <SettingsPanel
          open={true}
          onClose={() => {}}
          settings={settings}
          onSettingsChange={setSettings}
          initialSection="advanced"
        />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    const toggle = container.querySelector<HTMLInputElement>('[data-setting="gpu-rendering"]')
    expect(toggle).not.toBeNull()
    expect(toggle!.checked).toBe(false)

    act(() => toggle!.click())
    expect(latestSettings.gpuRenderingEnabled).toBe(true)
  })
})
