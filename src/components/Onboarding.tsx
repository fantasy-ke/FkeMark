import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'

interface OnboardingProps {
  onComplete: () => void
  onOpenFolder: () => void
  onNewFile: () => void
}

const ONBOARDED_KEY = 'fkemark:onboarded'

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, 'true')
  } catch { /* ignore */ }
}

export function Onboarding({ onComplete, onOpenFolder, onNewFile }: OnboardingProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [actionDone, setActionDone] = useState<Record<number, boolean>>({})

  // ESC to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleSkip() {
    setOnboarded()
    onComplete()
  }

  function handleNext() {
    if (step < 2) {
      setStep(step + 1)
    } else {
      setOnboarded()
      onComplete()
    }
  }

  function handleAction(action: () => void, currentStep: number) {
    action()
    setActionDone((prev) => ({ ...prev, [currentStep]: true }))
  }

  const steps = [
    {
      icon: (
        <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 20a4 4 0 0 1 4-4h12l4 4h20a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" />
          <path d="M20 34h20M20 42h14" strokeLinecap="round" />
        </svg>
      ),
      title: t('onboarding.step1.title'),
      desc: t('onboarding.step1.desc'),
      actionLabel: t('onboarding.step1.action'),
      action: () => handleAction(onOpenFolder, 0),
    },
    {
      icon: (
        <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h22l8 8v34a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" />
          <path d="M40 8v8h8" />
          <line x1="26" y1="30" x2="38" y2="30" />
          <line x1="26" y1="38" x2="34" y2="38" />
          <line x1="26" y1="22" x2="34" y2="22" />
        </svg>
      ),
      title: t('onboarding.step2.title'),
      desc: t('onboarding.step2.desc'),
      actionLabel: t('onboarding.step2.action'),
      action: () => handleAction(onNewFile, 1),
    },
    {
      icon: (
        <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="10" width="48" height="14" rx="2" />
          <rect x="8" y="28" width="48" height="14" rx="2" />
          <rect x="8" y="46" width="48" height="14" rx="2" />
          <circle cx="14" cy="17" r="2" fill="currentColor" stroke="none" />
          <circle cx="14" cy="35" r="2" fill="currentColor" stroke="none" />
          <circle cx="14" cy="53" r="2" fill="currentColor" stroke="none" />
          <path d="M22 17h24M22 35h28M22 53h20" opacity="0.4" />
        </svg>
      ),
      title: t('onboarding.step3.title'),
      desc: t('onboarding.step3.desc'),
      modes: [
        { mode: 'source', label: t('onboarding.step3.source'), icon: 'S' },
        { mode: 'live', label: t('onboarding.step3.live'), icon: 'L' },
        { mode: 'read', label: t('onboarding.step3.read'), icon: 'R' },
      ],
    },
  ]

  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div className="onboarding-overlay" onClick={handleSkip}>
      <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
        {/* 顶部：步骤指示器 */}
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            >
              {i < step && (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {i === step && <span>{i + 1}</span>}
            </div>
          ))}
        </div>

        {/* 内容区 */}
        <div className="onboarding-body">
          <div className="onboarding-icon">{current.icon}</div>
          <h2 className="onboarding-title">{current.title}</h2>
          <p className="onboarding-desc">{current.desc}</p>

          {/* 步骤3：视图模式说明卡片 */}
          {step === 2 && current.modes && (
            <div className="onboarding-modes">
              {current.modes.map((m) => (
                <div key={m.mode} className="onboarding-mode-card">
                  <div className="onboarding-mode-icon">{m.icon}</div>
                  <div className="onboarding-mode-label">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* 步骤1/2：行动按钮 */}
          {step < 2 && (
            <button
              className={`onboarding-action-btn ${actionDone[step] ? 'done' : ''}`}
              onClick={current.action}
            >
              {actionDone[step] ? (
                <>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t('onboarding.done')}
                </>
              ) : (
                current.actionLabel
              )}
            </button>
          )}
        </div>

        {/* 底部：导航按钮 */}
        <div className="onboarding-footer">
          <button className="onboarding-skip-btn" onClick={handleSkip}>
            {t('onboarding.skip')}
          </button>
          <div className="onboarding-nav">
            {step > 0 && (
              <button className="onboarding-prev-btn" onClick={() => setStep(step - 1)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                {t('onboarding.prev')}
              </button>
            )}
            <button className="onboarding-next-btn" onClick={handleNext}>
              {isLast ? t('onboarding.finish') : t('onboarding.next')}
              {!isLast && (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
