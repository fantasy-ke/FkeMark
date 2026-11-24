import { useId } from 'react'
import type { DocumentImportPanelState } from '../app/useDocumentImport'
import { translate, type Lang } from '../i18n'

interface DocumentImportPanelProps {
  state: DocumentImportPanelState | null
  language: Lang
  onClose: () => void
}

export function DocumentImportPanel({ state, language, onClose }: DocumentImportPanelProps) {
  const titleId = useId()
  const messageId = useId()
  if (!state) return null

  const converting = state.phase === 'converting'
  const title = translate(language, converting ? 'import.convertingTitle' : state.phase === 'success' ? 'import.success' : 'import.fail')
  const message = translate(language, state.phase === 'error' ? state.messageKey : converting ? 'import.converting' : 'import.successSave')
  const closeLabel = translate(language, converting ? 'import.collapse' : 'topbar.close')

  return (
    <section
      className="confirm-dialog document-import-panel"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onKeyDown={(event) => {
        // 仅响应面板内的 Escape，避免干扰编辑器或其他弹窗的快捷键。
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="confirm-dialog-header">
        <span className={`confirm-dialog-icon ${state.phase === 'error' ? 'danger' : 'primary'}`} aria-hidden="true">
          {converting ? <span className="document-import-spinner" /> : state.phase === 'success' ? '✓' : '!'}
        </span>
        <h2 id={titleId} className="confirm-dialog-title-text document-import-title">{title}</h2>
        <button type="button" className="confirm-dialog-btn cancel document-import-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="confirm-dialog-body" role="status" aria-live="polite" aria-atomic="true">
        <p id={messageId} className="confirm-dialog-message">{message}</p>
        {converting && <p className="document-import-hint">{translate(language, 'import.collapseHint')}</p>}
      </div>
      <div className="confirm-dialog-actions">
        <button type="button" className="confirm-dialog-btn cancel" onClick={onClose}>{closeLabel}</button>
      </div>
    </section>
  )
}
