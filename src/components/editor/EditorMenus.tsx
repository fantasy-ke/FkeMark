import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useI18n } from '../../i18n'
import { useClampedPopupPosition } from '../../utils/popupPosition'

/**
 * 链接弹窗组件
 */
export function LinkDialog(props: {
  open: boolean
  url: string
  text: string
  editing: boolean
  onUrlChange: (url: string) => void
  onTextChange: (text: string) => void
  onApply: () => void
  onClose: () => void
}) {
  const { t } = useI18n()

  if (!props.open) return null

  return (
    <div className="link-dialog-overlay editor-dialog-overlay">
      <div className="link-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-title">{t(props.editing ? 'linkDialog.editTitle' : 'linkDialog.title')}</div>
        <label className="link-dialog-label">{t('linkDialog.text')}</label>
        <input
          className="link-dialog-input"
          type="text"
          value={props.text}
          placeholder={t('linkDialog.textPlaceholder')}
          onChange={(e) => props.onTextChange(e.target.value)}
        />
        <label className="link-dialog-label">{t('linkDialog.url')}</label>
        <input
          className="link-dialog-input"
          type="url"
          autoFocus
          value={props.url}
          placeholder={t('linkDialog.urlPlaceholder')}
          onKeyDown={(e: ReactKeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); props.onApply() }
            if (e.key === 'Escape') props.onClose()
          }}
          onChange={(e) => props.onUrlChange(e.target.value)}
        />
        <div className="link-dialog-actions">
          <button className="link-dialog-btn cancel" onClick={() => props.onClose()}>{t('linkDialog.cancel')}</button>
          <button className="link-dialog-btn ok" onClick={props.onApply}>{t(props.editing ? 'linkDialog.save' : 'linkDialog.ok')}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * 编辑器右键菜单（通用）
 */
export function EditorContextMenu(props: {
  x: number
  y: number
  showMinimap: boolean
  onToggleMinimap: () => void
  onSetLiveMode: () => void
  onSetReadMode: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const popupRef = useClampedPopupPosition<HTMLDivElement>(props.x, props.y)

  return (
    <div
      ref={popupRef}
      className="app-menu-dropdown open"
      style={{ position: 'fixed', top: props.y, left: props.x, right: 'auto', zIndex: 300 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="app-menu-item"
        onClick={() => { props.onToggleMinimap(); props.onClose() }}
      >
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </span>
        <span className="menu-label">{props.showMinimap ? t('ctx.hideMinimap') : t('ctx.showMinimap')}</span>
      </button>
      <button
        className="app-menu-item"
        onClick={() => { props.onSetLiveMode(); props.onClose() }}
      >
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </span>
        <span className="menu-label">{t('ctx.liveMode')}</span>
      </button>
      <button
        className="app-menu-item"
        onClick={() => { props.onSetReadMode(); props.onClose() }}
      >
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </span>
        <span className="menu-label">{t('ctx.readMode')}</span>
      </button>
    </div>
  )
}

/**
 * 表格右键菜单
 */
export function TableContextMenu(props: {
  x: number
  y: number
  onAction: (action:
    | 'insert-row-above'
    | 'insert-row-below'
    | 'insert-column-left'
    | 'insert-column-right'
    | 'delete-row'
    | 'delete-column'
    | 'delete-table') => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const popupRef = useClampedPopupPosition<HTMLDivElement>(props.x, props.y)
  const items = [
    { label: t('table.insertRowAbove'), action: 'insert-row-above' as const },
    { label: t('table.insertRowBelow'), action: 'insert-row-below' as const },
    { label: t('table.insertColLeft'), action: 'insert-column-left' as const },
    { label: t('table.insertColRight'), action: 'insert-column-right' as const },
    { label: t('table.deleteRow'), action: 'delete-row' as const, danger: true },
    { label: t('table.deleteCol'), action: 'delete-column' as const, danger: true },
    { label: t('table.deleteTable'), action: 'delete-table' as const, danger: true },
  ]

  return (
    <div
      ref={popupRef}
      className="app-menu-dropdown open table-ctx-menu"
      style={{ position: 'fixed', top: props.y, left: props.x, right: 'auto', zIndex: 300 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          className="app-menu-item"
          data-table-action={item.action}
          style={item.danger ? { color: 'var(--destructive)' } : undefined}
          onClick={() => { props.onAction(item.action); props.onClose() }}
        >
          <span className="menu-label">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * 图片右键菜单
 */
export function ImageContextMenu(props: {
  x: number
  y: number
  onResize: () => void
  onResetSize: () => void
  onHalfWidth: () => void
  onFullWidth: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const popupRef = useClampedPopupPosition<HTMLDivElement>(props.x, props.y)

  return (
    <div
      ref={popupRef}
      className="app-menu-dropdown open image-ctx-menu"
      style={{ position: 'fixed', top: props.y, left: props.x, right: 'auto', zIndex: 300 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {/* 调整尺寸 */}
      <button className="app-menu-item" data-image-action="resize" onClick={() => { props.onResize(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 3v18"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.resize')}</span>
      </button>

      {/* 重置尺寸 */}
      <button className="app-menu-item" data-image-action="reset-size" onClick={() => { props.onResetSize(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.resetSize')}</span>
      </button>

      {/* 50% 宽度 */}
      <button className="app-menu-item" data-image-action="half-width" onClick={() => { props.onHalfWidth(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.halfWidth')}</span>
      </button>

      {/* 100% 宽度 */}
      <button className="app-menu-item" data-image-action="full-width" onClick={() => { props.onFullWidth(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.fullWidth')}</span>
      </button>

      <div className="app-menu-divider" />

      {/* 删除图片 */}
      <button
        className="app-menu-item"
        data-image-action="delete"
        style={{ color: 'var(--destructive)' }}
        onClick={() => { props.onDelete(); props.onClose() }}
      >
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.delete')}</span>
      </button>
    </div>
  )
}

/**
 * BlockNote 图片尺寸调整弹窗（仅支持 previewWidth）
 */
export function ImageSizeDialog(props: {
  blockId: string
  width: string
  onWidthChange: (width: string) => void
  onPreview: (width: string | null) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  if (!props.blockId) return null

  return (
    <div className="link-dialog-overlay editor-dialog-overlay">
      <div className="link-dialog image-size-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-title">{t('image.resizeTitle')}</div>
        <div className="image-size-row">
          <label className="link-dialog-label">{t('image.width')}</label>
          <div className="image-size-input-group">
            <input
              className="link-dialog-input image-size-input"
              type="number"
              min={1}
              value={props.width}
              placeholder={t('image.auto')}
              onChange={(e) => {
                const value = e.target.value
                props.onWidthChange(value)
                props.onPreview(value || null)
              }}
            />
            <span className="image-size-unit">px</span>
          </div>
        </div>
        <div className="link-dialog-actions">
          <button className="link-dialog-btn cancel" onClick={props.onCancel}>{t('linkDialog.cancel')}</button>
          <button className="link-dialog-btn ok" onClick={props.onConfirm}>{t('linkDialog.ok')}</button>
        </div>
      </div>
    </div>
  )
}
