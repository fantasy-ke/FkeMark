import type { AppSettings, SubscriptionPlanId } from '../../types'
import { FlatGroup } from './FlatGroup'
import {
  activateSubscriptionPlan,
  formatSubscriptionDate,
  getSubscriptionAccess,
  SUBSCRIPTION_PLANS,
  type SubscriptionAccess,
} from '../../utils/subscription'

interface SettingsSubscriptionSectionProps {
  t: (key: string, params?: Record<string, string | number>) => string
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

type SubscriptionStatusDisplay = {
  title: string
  description: string
  metricValue: string
  metricLabel: string
}

function getStatusDisplay(
  access: SubscriptionAccess,
  t: SettingsSubscriptionSectionProps['t'],
  activePlanName: string,
  expiryDate: string,
  trialEndDate: string,
): SubscriptionStatusDisplay {
  const isLifetime = access.plan === 'lifetime'

  if (access.status === 'trial') {
    return {
      title: t('subscription.status.trial.title'),
      description: t('subscription.status.trial.desc', { days: access.trialDaysRemaining, date: trialEndDate }),
      metricValue: String(access.trialDaysRemaining),
      metricLabel: t('subscription.metric.days'),
    }
  }

  if (access.status === 'active') {
    if (isLifetime) {
      return {
        title: t('subscription.status.active.title'),
        description: t('subscription.status.lifetime.desc', { plan: activePlanName }),
        metricValue: t('subscription.metric.forever'),
        metricLabel: t('subscription.metric.validUntil'),
      }
    }

    return {
      title: t('subscription.status.active.title'),
      description: t('subscription.status.active.desc', { plan: activePlanName, date: expiryDate }),
      metricValue: expiryDate,
      metricLabel: t('subscription.metric.validUntil'),
    }
  }

  return {
    title: t('subscription.status.expired.title'),
    description: t('subscription.status.expired.desc'),
    metricValue: t('subscription.metric.expired'),
    metricLabel: t('subscription.metric.status'),
  }
}

export function SettingsSubscriptionSection({ t, settings, update }: SettingsSubscriptionSectionProps) {
  const access = getSubscriptionAccess(settings)
  const activePlanName = access.plan ? t(`subscription.plan.${access.plan}.name`) : ''
  const expiryDate = formatSubscriptionDate(access.subscriptionExpiresAt, settings.language)
  const trialEndDate = formatSubscriptionDate(access.trialEndsAt, settings.language)
  const { title, description, metricValue, metricLabel } = getStatusDisplay(
    access,
    t,
    activePlanName,
    expiryDate,
    trialEndDate,
  )

  const handleActivate = (planId: SubscriptionPlanId) => {
    update(activateSubscriptionPlan(planId))
  }

  return (
    <>
      <h2 className="settings-content-title">{t('settings.group.subscription')}</h2>

      <div className={`subscription-status-card ${access.status}`}>
        <div className="subscription-status-main">
          <div className="subscription-status-badge">{t(`subscription.status.badge.${access.status}`)}</div>
          <div className="subscription-status-title">{title}</div>
          <p className="subscription-status-desc">{description}</p>
        </div>
        <div className="subscription-status-metric" aria-label={metricLabel}>
          <strong>{metricValue}</strong>
          <span>{metricLabel}</span>
        </div>
      </div>

      <FlatGroup title={t('subscription.plans.title')}>
        <div className="subscription-plan-grid">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isActive = access.status === 'active' && access.plan === plan.id
            return (
              <div
                className={`subscription-plan-card ${isActive ? 'active' : ''}`}
                key={plan.id}
                data-subscription-plan={plan.id}
              >
                <div className="subscription-plan-head">
                  <div>
                    <div className="subscription-plan-name">{t(`subscription.plan.${plan.id}.name`)}</div>
                    <div className="subscription-plan-duration">{t(`subscription.plan.${plan.id}.duration`)}</div>
                  </div>
                  {plan.recommended && <span className="subscription-plan-badge">{t('subscription.plan.recommended')}</span>}
                </div>
                <p className="subscription-plan-desc">{t(`subscription.plan.${plan.id}.desc`)}</p>
                <button
                  type="button"
                  className="subscription-plan-action"
                  disabled={isActive}
                  onClick={() => handleActivate(plan.id)}
                >
                  {isActive ? t('subscription.action.current') : t('subscription.action.activate')}
                </button>
              </div>
            )
          })}
        </div>
        <div className="subscription-device-note">{t('subscription.deviceNote')}</div>
      </FlatGroup>
    </>
  )
}
