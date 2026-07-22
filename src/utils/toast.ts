/**
 * 统一 Toast 通知中心（模块级事件总线）
 *
 * 采用与 ConfirmDialog 一致的 window 自定义事件模式，避免 React Provider 嵌套问题，
 * 任何模块（含编辑器、Rust 回调）均可直接调用 notify() 推送通知。
 */
export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  title?: string
  message: string
  type?: ToastType
  /** 自动消失毫秒数；0 表示常驻，需手动关闭 */
  duration?: number
  /** 指定 id 可复用同一条通知（避免重复堆叠） */
  id?: string
  action?: ToastAction
}

export interface ToastItem extends Required<Pick<ToastOptions, 'message'>> {
  id: string
  type: ToastType
  duration: number
  title?: string
  action?: ToastAction
}

const TOAST_EVENT = 'fkemark:toast'
const TOAST_DISMISS_EVENT = 'fkemark:toast-dismiss'

function genId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function notify(
  message: string,
  type: ToastType = 'info',
  options: Partial<Omit<ToastOptions, 'message' | 'type'>> = {}
): void {
  const item: ToastItem = {
    id: options.id || genId(),
    message,
    type,
    duration: options.duration ?? 3500,
    title: options.title,
    action: options.action,
  }
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: item }))
}

export function notifySuccess(message: string, options: Partial<ToastOptions> = {}): void {
  notify(message, 'success', options)
}
export function notifyError(message: string, options: Partial<ToastOptions> = {}): void {
  notify(message, 'error', { duration: 5000, ...options })
}
export function notifyInfo(message: string, options: Partial<ToastOptions> = {}): void {
  notify(message, 'info', options)
}
export function notifyWarning(message: string, options: Partial<ToastOptions> = {}): void {
  notify(message, 'warning', options)
}

export function dismissToast(id: string): void {
  window.dispatchEvent(new CustomEvent(TOAST_DISMISS_EVENT, { detail: id }))
}

export { TOAST_EVENT, TOAST_DISMISS_EVENT }
