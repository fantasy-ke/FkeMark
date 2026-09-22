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

describe('块级公式居中设置', () => {
  it('默认居中，并同时覆盖 .fk-math-block 与 KaTeX 自带的居中规则', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
    const editorCss = readFileSync(resolve(process.cwd(), 'src/styles/editor.css'), 'utf8')

    expect(DEFAULT_SETTINGS.mathBlockCentered).toBe(true)
    expect(translate('zh-CN', 'settings.mathBlockCentered')).toBe('块级公式居中')
    expect(translate('en', 'settings.mathBlockCentered')).toBe('Center block formulas')
    expect(appSource).toContain("classList.toggle('math-block-left', !settings.mathBlockCentered)")

    // KaTeX 的 .katex-display 自带 text-align: center，只改 .fk-math-block 不足以左对齐。
    expect(editorCss).toMatch(/body\.math-block-left \.fk-math-block \.katex-display[^{]*\{[^}]*text-align: left;/)
    expect(editorCss).toMatch(/body\.math-block-left \.fk-math-block \.katex-display > \.katex[^{]*\{[^}]*text-align: left;/)
  })
})

describe('设置面板中的块级公式居中开关', () => {
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

  it('切换后立即写回设置', async () => {
    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      latestSettings = settings
      return (
        <SettingsPanel
          open={true}
          onClose={() => {}}
          settings={settings}
          onSettingsChange={setSettings}
          initialSection="view"
        />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    const toggle = container.querySelector<HTMLInputElement>('[data-setting="math-block-centered"]')
    expect(toggle).not.toBeNull()
    expect(toggle!.checked).toBe(true)

    act(() => toggle!.click())
    expect(latestSettings.mathBlockCentered).toBe(false)
  })
})
