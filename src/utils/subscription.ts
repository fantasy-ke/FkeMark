import type { AppSettings, SubscriptionAccessStatus, SubscriptionPlanId, SubscriptionPlanSetting } from '../types'

export const SUBSCRIPTION_TRIAL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export interface SubscriptionPlanDefinition {
  id: SubscriptionPlanId
  durationDays: number | null
  recommended?: boolean
}

export interface SubscriptionAccess {
  status: SubscriptionAccessStatus
  allowed: boolean
  plan: SubscriptionPlanId | null
  trialStartedAt: number
  trialEndsAt: number
  trialDaysRemaining: number
  subscriptionStartedAt: number
  subscriptionExpiresAt: number
}

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlanDefinition[] = [
  { id: 'monthly', durationDays: 30 },
  { id: 'quarterly', durationDays: 90 },
  { id: 'yearly', durationDays: 365, recommended: true },
  { id: 'lifetime', durationDays: null },
]

const PLAN_IDS = new Set<SubscriptionPlanSetting>(['none', ...SUBSCRIPTION_PLANS.map((plan) => plan.id)])

export function normalizeSubscriptionSettings(settings: AppSettings, now = Date.now()): AppSettings {
  const plan = normalizePlan(settings.subscriptionPlan)
  const normalized: AppSettings = {
    ...settings,
    subscriptionPlan: plan,
    subscriptionStartedAt: normalizeTimestamp(settings.subscriptionStartedAt),
    subscriptionExpiresAt: normalizeTimestamp(settings.subscriptionExpiresAt),
    trialStartedAt: normalizeTimestamp(settings.trialStartedAt) || now,
  }

  if (plan === 'none') {
    normalized.subscriptionStartedAt = 0
    normalized.subscriptionExpiresAt = 0
  }
  if (plan === 'lifetime' && normalized.subscriptionStartedAt > 0) {
    normalized.subscriptionExpiresAt = 0
  }
  return normalized
}

export function activateSubscriptionPlan(planId: SubscriptionPlanId, now = Date.now()): Pick<AppSettings, 'subscriptionPlan' | 'subscriptionStartedAt' | 'subscriptionExpiresAt'> {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId)
  if (!plan) throw new Error(`Unknown subscription plan: ${planId}`)

  return {
    subscriptionPlan: plan.id,
    subscriptionStartedAt: now,
    subscriptionExpiresAt: plan.durationDays == null ? 0 : now + plan.durationDays * DAY_MS,
  }
}

export function getSubscriptionAccess(settings: AppSettings, now = Date.now()): SubscriptionAccess {
  const plan = normalizePlan(settings.subscriptionPlan)
  const subscriptionStartedAt = normalizeTimestamp(settings.subscriptionStartedAt)
  const subscriptionExpiresAt = normalizeTimestamp(settings.subscriptionExpiresAt)
  const trialStartedAt = normalizeTimestamp(settings.trialStartedAt) || now
  const trialEndsAt = trialStartedAt + SUBSCRIPTION_TRIAL_DAYS * DAY_MS
  const trialDaysRemaining = Math.min(
    SUBSCRIPTION_TRIAL_DAYS,
    Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS)),
  )

  if (plan === 'lifetime' && subscriptionStartedAt > 0) {
    return {
      status: 'active',
      allowed: true,
      plan: 'lifetime',
      trialStartedAt,
      trialEndsAt,
      trialDaysRemaining,
      subscriptionStartedAt,
      subscriptionExpiresAt: 0,
    }
  }

  if (plan !== 'none' && subscriptionStartedAt > 0 && subscriptionExpiresAt > now) {
    return {
      status: 'active',
      allowed: true,
      plan,
      trialStartedAt,
      trialEndsAt,
      trialDaysRemaining,
      subscriptionStartedAt,
      subscriptionExpiresAt,
    }
  }

  if (trialDaysRemaining > 0) {
    return {
      status: 'trial',
      allowed: true,
      plan: null,
      trialStartedAt,
      trialEndsAt,
      trialDaysRemaining,
      subscriptionStartedAt,
      subscriptionExpiresAt,
    }
  }

  return {
    status: 'expired',
    allowed: false,
    plan: null,
    trialStartedAt,
    trialEndsAt,
    trialDaysRemaining: 0,
    subscriptionStartedAt,
    subscriptionExpiresAt,
  }
}

export function formatSubscriptionDate(timestamp: number, language: AppSettings['language']): string {
  if (!timestamp) return ''
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

function normalizePlan(value: unknown): SubscriptionPlanSetting {
  return typeof value === 'string' && PLAN_IDS.has(value as SubscriptionPlanSetting)
    ? (value as SubscriptionPlanSetting)
    : 'none'
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
