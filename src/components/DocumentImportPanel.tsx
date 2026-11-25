import { useId } from 'react'
import { ArrowRightLeft } from 'lucide-react'
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
  const routeId = useId()
  if (!state) return null

  const converting = state.phase === 'converting'
  const title = translate(language, converting ? 'import.convertingTitle' : state.phase === 'success' ? 'import.success' : 'import.fail')
  const message = translate(language, state.phase === 'error' ? state.messageKey : converting ? 'import.converting' : 'import.successSave')
  const closeLabel = translate(language, converting ? 'import.collapse' : 'topbar.close')
  const { sourceFormat } = state
  const sourceLabel = sourceFormat?.kind === 'file'
    ? sourceFormat.extension ?? translate(language, 'import.sourceFile')
    : translate(language, 'import.sourceUrl')

  return (
    <div className="document-import-overlay">
      <section
        className="confirm-dialog document-import-panel"
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={sourceFormat ? `${routeId} ${messageId}` : messageId}
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
            {converting ? <ArrowRightLeft size={16} /> : state.phase === 'success' ? '✓' : '!'}
          </span>
          <h2 id={titleId} className="confirm-dialog-title-text document-import-title">{title}</h2>
          <button type="button" className="confirm-dialog-btn cancel document-import-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <span aria-hidden="true">{converting ? '−' : '×'}</span>
          </button>
        </div>
        <div className="confirm-dialog-body document-import-body">
          {sourceFormat && (
            <div id={routeId} className="document-import-route">
              <div className="document-import-format">
                <span>{translate(language, 'import.sourceFormat')}</span>
                <strong>{sourceLabel}</strong>
              </div>
              <span className="document-import-arrow" aria-hidden="true">→</span>
              <div className="document-import-format document-import-target">
                <span>{translate(language, 'import.targetFormat')}</span>
                <strong>Markdown</strong>
              </div>
            </div>
          )}
          {converting && <div className="document-import-progress" role="progressbar" aria-labelledby={titleId} />}
          <p id={messageId} className="confirm-dialog-message" role="status">{message}</p>
          {converting && <p className="document-import-hint">{translate(language, 'import.collapseHint')}</p>}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-btn cancel" onClick={onClose}>{closeLabel}</button>
        </div>
      </section>
    </div>
  )
}
