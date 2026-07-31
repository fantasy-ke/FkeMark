import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { DICTS } from '../src/i18n/locales'
import {
  activateSubscriptionPlan,
  formatSubscriptionDate,
  getSubscriptionAccess,
  normalizeSubscriptionSettings,
  SUBSCRIPTION_TRIAL_DAYS,
} from '../src/utils/subscription'

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 0, 1, 0, 0, 0)

describe('subscription state', () => {
  it('starts a seven-day trial for settings without trial data', () => {
    const normalized = normalizeSubscriptionSettings({ ...DEFAULT_SETTINGS, trialStartedAt: 0 }, now)

    expect(normalized.trialStartedAt).toBe(now)
    const access = getSubscriptionAccess(normalized, now)
    expect(access.status).toBe('trial')
    expect(access.allowed).toBe(true)
    expect(access.trialDaysRemaining).toBe(SUBSCRIPTION_TRIAL_DAYS)
  })

  it('expires the trial after seven days without an active plan', () => {
    const access = getSubscriptionAccess(
      { ...DEFAULT_SETTINGS, trialStartedAt: now },
      now + SUBSCRIPTION_TRIAL_DAYS * DAY_MS,
    )

    expect(access.status).toBe('expired')
    expect(access.allowed).toBe(false)
  })

  it('sets finite plans and keeps lifetime plans active without expiry', () => {
    const quarterly = activateSubscriptionPlan('quarterly', now)
    expect(quarterly.subscriptionExpiresAt).toBe(now + 90 * DAY_MS)

    const activeQuarter = getSubscriptionAccess(
      { ...DEFAULT_SETTINGS, trialStartedAt: now - 10 * DAY_MS, ...quarterly },
      now + 30 * DAY_MS,
    )
    expect(activeQuarter.status).toBe('active')
    expect(activeQuarter.plan).toBe('quarterly')

    const lifetime = activateSubscriptionPlan('lifetime', now)
    const activeLifetime = getSubscriptionAccess(
      { ...DEFAULT_SETTINGS, trialStartedAt: now - 10 * DAY_MS, ...lifetime },
      now + 5000 * DAY_MS,
    )
    expect(activeLifetime.status).toBe('active')
    expect(activeLifetime.plan).toBe('lifetime')
    expect(activeLifetime.subscriptionExpiresAt).toBe(0)
  })

  it('formats subscription dates with hour, minute, and second precision', () => {
    const timestamp = new Date(2026, 0, 2, 3, 4, 5).getTime()
    const zhDate = formatSubscriptionDate(timestamp, 'zh-CN')
    const enDate = formatSubscriptionDate(timestamp, 'en')

    expect(zhDate).toMatch(/03[:：]04[:：]05/)
    expect(enDate).toMatch(/03:04:05|3:04:05/)
  })

  it('contains subscription labels in every locale', () => {
    const keys = [
      'settings.group.subscription',
      'settings.nav.subscription',
      'subscription.status.title',
      'subscription.status.badge.trial',
      'subscription.status.badge.active',
      'subscription.status.badge.expired',
      'subscription.plan.monthly.name',
      'subscription.plan.quarterly.name',
      'subscription.plan.yearly.name',
      'subscription.plan.lifetime.name',
      'subscription.action.activate',
      'subscription.deviceNote',
    ]

    for (const dict of Object.values(DICTS)) {
      for (const key of keys) {
        expect(dict[key], key).toBeTruthy()
      }
    }
  })
})
