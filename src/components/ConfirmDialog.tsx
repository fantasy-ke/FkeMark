import { useState, useEffect, useRef, useCallback } from 'react'
import type { Lang } from '../i18n'

export interface ConfirmDialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary' | 'warning'
  /** 默认输入框的值（prompt 模式） */
  inputDefaultValue?: string
  /** 输入框占位符（prompt 模式） */
  inputPlaceholder?: string
  // ── 三按钮模式（关闭窗口提示）──
  /** 第三按钮文本（如"最小化"） */
  tertiaryText?: string
  /** "以后不再提示" 复选框 */
  showDontAskAgain?: boolean
  /** "以后不再提示" 默认文案 */
  dontAskAgainLabel?: string
}

export type DialogType = 'alert' | 'confirm' | 'prompt' | 'closeAction'

export interface DialogResult {
  confirmed: boolean
  value?: string
  /** 三按钮模式：点击了第三按钮（如最小化） */
  tertiary?: boolean
  /** 用户勾选了"以后不再提示" */
  dontAskAgain?: boolean
}

/**
 * 自定义对话框组件（替代原生 alert/confirm/prompt）
 * 
 * 支持模式：
 * - alert：单按钮确认
 * - confirm：双按钮确认/取消
 * - prompt：带输入框的确认
 * - closeAction：三按钮 + "以后不提示"复选框（用于关闭窗口提示）
 */

// ── 全局单例管理 ──
let resolveRef: ((result: DialogResult) => void) | null = null
let dialogOptions: ConfirmDialogOptions & { type: DialogType } | null = null

/** 显示确认/提示对话框（返回 Promise） */
export function showDialog(opts: ConfirmDialogOptions & { type: DialogType }): Promise<DialogResult> {
  return new Promise((resolve) => {
    resolveRef = resolve
    dialogOptions = opts
    window.dispatchEvent(new CustomEvent('fkemark:dialog-open'))
  })
}

export function showAlert(message: string, title?: string): Promise<void> {
  return showDialog({ type: 'alert', message, title }).then(() => {})
}

export function showConfirm(message: string, title?: string): Promise<boolean> {
  return showDialog({ type: 'confirm', message, title }).then(r => r.confirmed)
}

export function showPrompt(
  message: string,
  defaultValue?: string,
  title?: string,
  placeholder?: string
): Promise<string | null> {
  return showDialog({
    type: 'prompt',
    message,
    title,
    inputDefaultValue: defaultValue,
    inputPlaceholder: placeholder,
  }).then(r => r.confirmed ? (r.value ?? null) : null)
}

/**
 * 显示关闭窗口提示对话框（三按钮：最小化 / 关闭 / 取消 + "以后不提示"）
 * @returns 结果对象，包含 action（'minimize'|'close'|'cancel'）和 dontAskAgain
 */
export function showCloseActionDialog(
  message: string,
  title?: string,
  opts?: { tertiaryText?: string; dontAskAgainLabel?: string }
): Promise<{ action: 'minimize' | 'close' | 'cancel'; dontAskAgain: boolean }> {
  return showDialog({
    type: 'closeAction',
    message,
    title,
    variant: 'primary',
    tertiaryText: opts?.tertiaryText,
    showDontAskAgain: true,
    dontAskAgainLabel: opts?.dontAskAgainLabel,
    confirmText: undefined, // 使用默认
    cancelText: undefined,
  }).then(r => ({
    action: r.tertiary ? 'minimize' : r.confirmed ? 'close' : 'cancel',
    dontAskAgain: !!r.dontAskAgain,
  }))
}

/** 关闭对话框（由组件内部调用） */
function closeDialog(result: DialogResult) {
  if (resolveRef) {
    resolveRef(result)
    resolveRef = null
  }
  dialogOptions = null
  window.dispatchEvent(new CustomEvent('fkemark:dialog-close'))
}

/** 获取当前待显示的对话框配置 */
export function getPendingDialog(): (ConfirmDialogOptions & { type: DialogType }) | null {
  return dialogOptions
}

// ── React 组件 ──

interface ConfirmDialogProps {
  lang: Lang
}

export function ConfirmDialog({ lang }: ConfirmDialogProps) {
  const [visible, setVisible] = useState(false)
  const [options, setOptions] = useState<ConfirmDialogOptions & { type: DialogType } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  // "以后不提示" 复选框状态
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const openListener = useCallback(() => {
    if (dialogOptions) {
      setOptions({ ...dialogOptions })
      setDontAskAgain(false) // 每次打开重置
      setVisible(true)
      setTimeout(() => {
        if (dialogOptions?.type === 'prompt') {
          inputRef.current?.focus()
          inputRef.current?.select()
        } else {
          confirmBtnRef.current?.focus()
        }
      }, 100)
    }
  }, [])

  const closeListener = useCallback(() => {
    setVisible(false)
    setOptions(null)
  }, [])

  useEffect(() => {
    window.addEventListener('fkemark:dialog-open', openListener)
    window.addEventListener('fkemark:dialog-close', closeListener)
    return () => {
      window.removeEventListener('fkemark:dialog-open', openListener)
      window.removeEventListener('fkemark:dialog-close', closeListener)
    }
  }, [openListener, closeListener])

  // ESC 关闭
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleCancel()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible])

  // Enter 确认
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  const handleConfirm = () => {
    if (!options) return
    const value = options.type === 'prompt' ? inputRef.current?.value ?? options.inputDefaultValue ?? '' : undefined
    const result: DialogResult = {
      confirmed: true,
      value,
      dontAskAgain: options.showDontAskAgain ? dontAskAgain : undefined,
    }
    closeDialog(result)
    setVisible(false)
    setOptions(null)
  }

  const handleCancel = () => {
    closeDialog({ confirmed: false, dontAskAgain: options?.showDontAskAgain ? dontAskAgain : undefined })
    setVisible(false)
    setOptions(null)
  }

  /** 第三按钮处理（如最小化） */
  const handleTertiary = () => {
    if (!options) return
    closeDialog({
      confirmed: false,
      tertiary: true,
      dontAskAgain: options.showDontAskAgain ? dontAskAgain : undefined,
    })
    setVisible(false)
    setOptions(null)
  }

  // 点击遮罩关闭（仅 alert 和 confirm，prompt/closeAction 不允许误关）
  const handleOverlayClick = () => {
    if (options?.type !== 'prompt' && options?.type !== 'closeAction') {
      handleCancel()
    }
  }

  if (!visible || !options) return null

  const isAlert = options.type === 'alert'
  const isPrompt = options.type === 'prompt'
  const isCloseAction = options.type === 'closeAction'
  const variant = options.variant || (isAlert ? 'primary' : 'primary')

  return (
    <div className="confirm-dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fkemark-dialog-title"
      >
        {/* 标题 */}
        {options.title && (
          <div className="confirm-dialog-header" id="fkemark-dialog-title">
            <span className={`confirm-dialog-icon ${variant}`}>
              {variant === 'danger' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              ) : variant === 'warning' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
              )}
            </span>
            <span className="confirm-dialog-title-text">{options.title}</span>
          </div>
        )}

        {/* 内容区 */}
        <div className="confirm-dialog-body">
          <p className="confirm-dialog-message">{options.message}</p>
          {isPrompt && (
            <input
              ref={inputRef}
              className="confirm-dialog-input"
              type="text"
              defaultValue={options.inputDefaultValue || ''}
              placeholder={options.inputPlaceholder || ''}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>

        {/* "以后不再提示" 复选框 */}
        {isCloseAction && options.showDontAskAgain && (
          <label className="confirm-dialog-dont-ask">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            <span>{options.dontAskAgainLabel || (lang === 'zh-CN' ? '以后不再提示' : "Don't ask again")}</span>
          </label>
        )}

        {/* 按钮区 */}
        <div className={`confirm-dialog-actions ${isCloseAction ? 'three-btn' : ''}`}>
          {/* 第三按钮（最小化）— 仅 closeAction 模式显示 */}
          {isCloseAction && options.tertiaryText && (
            <button
              className="confirm-dialog-btn tertiary"
              onClick={handleTertiary}
            >
              {options.tertiaryText}
            </button>
          )}

          {!isAlert && (
            <button
              className="confirm-dialog-btn cancel"
              onClick={handleCancel}
            >
              {options.cancelText || (lang === 'zh-CN' ? '取消' : 'Cancel')}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            className={`confirm-dialog-btn ${variant}`}
            onClick={handleConfirm}
          >
            {options.confirmText || (lang === 'zh-CN' ? '确定' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}
