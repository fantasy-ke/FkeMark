/**
 * Toast 通知中心渲染组件
 * 监听 window 自定义事件，栈式展示通知，提供类型图标、自动消失与操作按钮。
 */
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { dismissToast, TOAST_EVENT, TOAST_DISMISS_EVENT, type ToastItem, type ToastType } from '../utils/toast'

function Icon({ type }: { type: ToastType }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (type) {
    case 'success':
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    case 'error':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )
  }
}

export function ToastCenter() {
  const { t } = useI18n()
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const timers = new Map<string, number>()
    const cancel = (id: string) => {
      const timer = timers.get(id)
      if (timer !== undefined) window.clearTimeout(timer)
      timers.delete(id)
    }
    const dismiss = (id: string) => {
      cancel(id)
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }
    const onToast = (e: Event) => {
      const item = (e as CustomEvent<ToastItem>).detail
      const { id, duration } = item
      cancel(id)
      setToasts((prev) => [...prev.filter((x) => x.id !== item.id), item])
      if (duration > 0) timers.set(id, window.setTimeout(() => dismiss(id), duration))
    }
    const onDismiss = (e: Event) => dismiss((e as CustomEvent<string>).detail)
    window.addEventListener(TOAST_EVENT, onToast)
    window.addEventListener(TOAST_DISMISS_EVENT, onDismiss)
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
      window.removeEventListener(TOAST_EVENT, onToast)
      window.removeEventListener(TOAST_DISMISS_EVENT, onDismiss)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-center" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
          <span className="toast-icon">
            <Icon type={toast.type} />
          </span>
          <div className="toast-body">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
          </div>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action?.onClick()
                dismissToast(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label={t('toast.close')}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
