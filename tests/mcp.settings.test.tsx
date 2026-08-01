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

  it('opens the general category by default', async () => {
    await act(async () => {
      root.render(
        <SettingsPanel
          open={true}
          onClose={() => {}}
          settings={DEFAULT_SETTINGS}
          onSettingsChange={() => {}}
        />,
      )
      await Promise.resolve()
    })

    const activeItem = container.querySelector('.settings-nav-item.active')
    expect(activeItem?.textContent).toContain('通用')
    expect(container.textContent).toContain('自动保存')
    expect(container.textContent).toContain('语言')
  })

  it('groups settings into seven menu items and keeps the MCP deep link available', async () => {
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

    const navItems = Array.from(container.querySelectorAll<HTMLButtonElement>('.settings-nav-item'))
    const navLabels = navItems.map((item) => item.querySelector('.nav-label')?.textContent)
    expect(navLabels).toEqual(['通用', '外观', '编辑器', '图片上传', 'AI 与 MCP', '高级', '关于'])
    expect(navItems.find((item) => item.classList.contains('active'))?.textContent).toContain('AI 与 MCP')
    expect(container.textContent).toContain('AI 助手')
    expect(container.textContent).toContain('MCP 执行权限')
    expect(container.textContent).toContain('启用外部 Agent 访问')
    expect(container.textContent).toContain('fkemark-mcp-server')
    expect(container.textContent).toContain('\"command\": \"npx\"')
  })
})
