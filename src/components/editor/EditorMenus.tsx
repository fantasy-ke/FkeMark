import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { useI18n } from '../../i18n'
import { Select } from '../Select'

/**
 * 链接弹窗组件
 */
export function LinkDialog(props: {
  open: boolean
  url: string
  text: string
  onUrlChange: (url: string) => void
  onTextChange: (text: string) => void
  onApply: () => void
  onClose: () => void
}) {
  const { t } = useI18n()

  if (!props.open) return null

  return (
    <div className="link-dialog-overlay">
      <div className="link-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-title">{t('linkDialog.title')}</div>
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
          <button className="link-dialog-btn ok" onClick={props.onApply}>{t('linkDialog.ok')}</button>
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

  return (
    <div
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
  editor: TiptapEditor | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const items: { label: string; cmd: () => void; danger?: boolean }[] = [
    { label: t('table.insertRowAbove'), cmd: () => props.editor?.chain().focus().addRowBefore().run() },
    { label: t('table.insertRowBelow'), cmd: () => props.editor?.chain().focus().addRowAfter().run() },
    { label: t('table.insertColLeft'), cmd: () => props.editor?.chain().focus().addColumnBefore().run() },
    { label: t('table.insertColRight'), cmd: () => props.editor?.chain().focus().addColumnAfter().run() },
    { label: t('table.deleteRow'), cmd: () => props.editor?.chain().focus().deleteRow().run(), danger: true },
    { label: t('table.deleteCol'), cmd: () => props.editor?.chain().focus().deleteColumn().run(), danger: true },
    { label: t('table.deleteTable'), cmd: () => props.editor?.chain().focus().deleteTable().run(), danger: true },
  ]

  return (
    <div
      className="app-menu-dropdown open table-ctx-menu"
      style={{ position: 'fixed', top: props.y, left: props.x, right: 'auto', zIndex: 300 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="app-menu-item"
          style={item.danger ? { color: 'var(--destructive)' } : undefined}
          onClick={() => { item.cmd(); props.onClose() }}
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
  pos: number
  width: number | null
  height: number | null
  widthUnit: string
  heightUnit: string
  src: string
  editor: TiptapEditor | null
  onResize: () => void
  onResetSize: () => void
  onHalfWidth: () => void
  onFullWidth: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { t } = useI18n()

  return (
    <div
      className="app-menu-dropdown open image-ctx-menu"
      style={{ position: 'fixed', top: props.y, left: props.x, right: 'auto', zIndex: 300 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {/* 调整尺寸 */}
      <button className="app-menu-item" onClick={() => { props.onResize(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 3v18"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.resize')}</span>
      </button>

      {/* 重置尺寸 */}
      <button className="app-menu-item" onClick={() => { props.onResetSize(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.resetSize')}</span>
      </button>

      {/* 50% 宽度 */}
      <button className="app-menu-item" onClick={() => { props.onHalfWidth(); props.onClose() }}>
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
        </span>
        <span className="menu-label">{t('image.halfWidth')}</span>
      </button>

      {/* 100% 宽度 */}
      <button className="app-menu-item" onClick={() => { props.onFullWidth(); props.onClose() }}>
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
 * 图片尺寸调整弹窗
 */
export function ImageSizeDialog(props: {
  pos: number
  width: string
  height: string
  widthUnit: string
  heightUnit: string
  onWidthChange: (width: string) => void
  onHeightChange: (height: string) => void
  onWidthUnitChange: (unit: string) => void
  onHeightUnitChange: (unit: string) => void
  onPreview: (width: string | null, height: string | null) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  if (!props.pos && props.pos !== 0) return null

  return (
    <div className="link-dialog-overlay">
      <div className="link-dialog image-size-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-title">{t('image.resizeTitle')}</div>

        {/* 宽度 */}
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
                const val = e.target.value
                props.onWidthChange(val)
                props.onPreview(val || null, props.height || null)
              }}
            />
            <Select
              className="image-size-unit"
              value={props.widthUnit}
              onChange={(unit) => {
                props.onWidthUnitChange(unit)
                props.onPreview(props.width || null, props.height || null)
              }}
            >
              <Select.Option value="px">px</Select.Option>
              <Select.Option value="%">%</Select.Option>
            </Select>
          </div>
        </div>

        {/* 高度 */}
        <div className="image-size-row">
          <label className="link-dialog-label">{t('image.height')}</label>
          <div className="image-size-input-group">
            <input
              className="link-dialog-input image-size-input"
              type="number"
              min={1}
              value={props.height}
              placeholder={t('image.auto')}
              onChange={(e) => {
                const val = e.target.value
                props.onHeightChange(val)
                props.onPreview(props.width || null, val || null)
              }}
            />
            <Select
              className="image-size-unit"
              value={props.heightUnit}
              onChange={(unit) => {
                props.onHeightUnitChange(unit)
                props.onPreview(props.width || null, props.height || null)
              }}
            >
              <Select.Option value="px">px</Select.Option>
              <Select.Option value="%">%</Select.Option>
            </Select>
          </div>
        </div>

        <div className="link-dialog-actions">
          <button className="link-dialog-btn cancel" onClick={() => props.onCancel()}>{t('linkDialog.cancel')}</button>
          <button className="link-dialog-btn ok" onClick={() => props.onConfirm()}>{t('linkDialog.ok')}</button>
        </div>
      </div>
    </div>
  )
}
