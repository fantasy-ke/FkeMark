import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsAiSection } from '../src/components/settings/SettingsAiSection'
import type { AppSettings } from '../src/types'

const t = (key: string, params?: Record<string, string | number>) => {
  let value = key
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

describe('SettingsAiSection', () => {
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
    vi.restoreAllMocks()
  })

  function renderSection() {
    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      latestSettings = settings
      return (
        <SettingsAiSection
          t={t}
          settings={settings}
          update={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          numInputStyle={{ width: 72 }}
        />
      )
    }
    act(() => root.render(<Harness />))
  }

  // 按设置项标签定位开关，避免新增开关后索引错位。
  function toggleFor(labelKey: string): HTMLInputElement {
    const row = Array.from(container.querySelectorAll('.settings-row'))
      .find((item) => item.querySelector('.settings-label')?.textContent === labelKey)
    const input = row?.querySelector<HTMLInputElement>('.toggle-switch input[type="checkbox"]')
    if (!input) throw new Error(`Missing toggle for ${labelKey}`)
    return input
  }

  it('switches upstream format and full URL mode while keeping the model input searchable', () => {
    renderSection()

    const formatSelect = container.querySelector('select.ai-settings-input') as HTMLSelectElement
    expect(Array.from(formatSelect.options).map((option) => option.value)).toEqual([
      'chat-completions',
      'responses',
      'anthropic-messages',
    ])

    act(() => {
      formatSelect.value = 'responses'
      formatSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(latestSettings.aiUpstreamFormat).toBe('responses')

    act(() => toggleFor('ai.settings.fullUrl').click())
    expect(latestSettings.aiUseFullUrl).toBe(true)

    const modelInput = container.querySelector<HTMLInputElement>('input[list="ai-settings-model-options"]')
    expect(modelInput).not.toBeNull()
  })

  it('keeps the Tab inline completion toggle disabled until the assistant is enabled', () => {
    renderSection()

    const ghostToggle = toggleFor('ai.settings.ghostText')
    expect(DEFAULT_SETTINGS.aiGhostTextEnabled).toBe(true)
    expect(ghostToggle.checked).toBe(true)
    expect(ghostToggle.disabled).toBe(true)

    act(() => toggleFor('ai.settings.enable').click())
    expect(latestSettings.aiEnabled).toBe(true)

    act(() => toggleFor('ai.settings.ghostText').click())
    expect(latestSettings.aiGhostTextEnabled).toBe(false)
  })

  it('tests the current connection and fills the model dropdown from the upstream list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    renderSection()

    const fetchModelsButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'ai.settings.models.fetch') as HTMLButtonElement
    await act(async () => {
      fetchModelsButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(Array.from(container.querySelectorAll('#ai-settings-model-options option')).map((option) => option.getAttribute('value')))
      .toEqual(['llama3.1', 'model-a', 'model-b'])
    expect(container.textContent).toContain('ai.settings.models.success')

    const testButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'ai.settings.test') as HTMLButtonElement
    await act(async () => {
      testButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('ai.settings.test.success')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/v1/models', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', expect.objectContaining({ method: 'POST' }))
  })


})
