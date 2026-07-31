import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsSubscriptionSection } from '../src/components/settings/SettingsSubscriptionSection'
import type { AppSettings } from '../src/types'

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 0, 1, 0, 0, 0)

const t = (key: string, params?: Record<string, string | number>) => {
  let value = key
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

describe('SettingsSubscriptionSection', () => {
  let container: HTMLDivElement
  let root: Root
  let latestSettings: AppSettings

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(now)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestSettings = { ...DEFAULT_SETTINGS, trialStartedAt: now }
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function renderSection(initial: AppSettings = { ...DEFAULT_SETTINGS, trialStartedAt: now }) {
    function Harness() {
      const [settings, setSettings] = useState(initial)
      latestSettings = settings
      return (
        <SettingsSubscriptionSection
          t={t}
          settings={settings}
          update={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
      )
    }

    act(() => root.render(<Harness />))
  }

  it('activates the selected yearly plan', () => {
    renderSection()

    const yearlyButton = container.querySelector('[data-subscription-plan="yearly"] .subscription-plan-action') as HTMLButtonElement
    act(() => yearlyButton.click())

    expect(latestSettings.subscriptionPlan).toBe('yearly')
    expect(latestSettings.subscriptionStartedAt).toBe(now)
    expect(latestSettings.subscriptionExpiresAt).toBe(now + 365 * DAY_MS)
  })

  it('shows the current lifetime plan as active', () => {
    renderSection({
      ...DEFAULT_SETTINGS,
      trialStartedAt: now - 10 * DAY_MS,
      subscriptionPlan: 'lifetime',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: 0,
    })

    const lifetimeButton = container.querySelector('[data-subscription-plan="lifetime"] .subscription-plan-action') as HTMLButtonElement
    expect(lifetimeButton.disabled).toBe(true)
    expect(lifetimeButton.textContent).toBe('subscription.action.current')
  })

  it('renders plans as a compact list grid with status metric first labelled', () => {
    renderSection()

    const planGrid = container.querySelector('.subscription-plan-grid')
    const planCards = container.querySelectorAll('.subscription-plan-card')
    const metric = container.querySelector('.subscription-status-metric')

    expect(planGrid?.getAttribute('role')).toBe('list')
    expect(planCards).toHaveLength(4)
    expect(planCards[0].getAttribute('role')).toBe('listitem')
    expect(metric?.firstElementChild?.tagName).toBe('SPAN')
    expect(metric?.lastElementChild?.tagName).toBe('STRONG')
  })
})
