import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { SettingsMcpSection } from '../src/components/settings/SettingsMcpSection'
import type { AppSettings } from '../src/types'

const t = (key: string, params?: Record<string, string | number>) => {
  let value = key
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

describe('SettingsMcpSection', () => {
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

  function renderSection() {
    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      latestSettings = settings
      return (
        <SettingsMcpSection
          t={t}
          settings={settings}
          update={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
      )
    }
    act(() => root.render(<Harness />))
  }

  it('updates service settings and keeps permission controls in the MCP section', () => {
    renderSection()

    const enableToggle = container.querySelector<HTMLInputElement>('.toggle-switch input[type="checkbox"]')
    expect(enableToggle).not.toBeNull()
    act(() => enableToggle!.click())
    expect(latestSettings.mcpServiceEnabled).toBe(true)

    const rootsInput = container.querySelector<HTMLTextAreaElement>('textarea.mcp-settings-roots')
    expect(rootsInput).not.toBeNull()
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      valueSetter!.call(rootsInput, 'D:/Notes\nD:/Drafts')
      rootsInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(latestSettings.mcpAllowedRoots).toBe('D:/Notes\nD:/Drafts')

    const modeButtons = container.querySelectorAll<HTMLButtonElement>('.mcp-permission-mode-group button')
    expect(modeButtons).toHaveLength(3)
    expect(modeButtons[1].className).toContain('active')
    expect(container.querySelectorAll('.mcp-permission-table tbody tr')).toHaveLength(5)
    expect(container.querySelectorAll('.mcp-permission-example-card')).toHaveLength(3)
    expect(container.textContent).toContain('mcp.settings.service.configExample')

    act(() => modeButtons[2].click())
    expect(latestSettings.mcpPermissionMode).toBe('full-access')
  })
})

describe('SettingsPanel MCP navigation', () => {
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
  })

  it('shows MCP as a separate settings menu item', async () => {
    await act(async () => {
      root.render(
        <SettingsPanel
          open={true}
          onClose={() => {}}
          settings={DEFAULT_SETTINGS}
          onSettingsChange={() => {}}
          initialSection="mcp"
        />,
      )
      await Promise.resolve()
    })

    const navLabels = Array.from(container.querySelectorAll('.settings-nav-item .nav-label'))
      .map((label) => label.textContent)
    expect(navLabels).toContain('AI 助手')
    expect(navLabels).toContain('MCP')
    expect(container.textContent).toContain('MCP 执行权限')
    expect(container.textContent).toContain('启用外部 Agent 访问')
  })
})
