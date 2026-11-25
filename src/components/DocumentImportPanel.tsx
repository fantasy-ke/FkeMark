import { useId } from 'react'
import { ArrowRightLeft, Download } from 'lucide-react'
import type { DocumentImportPanelState, DocumentImportTask } from '../app/useDocumentImport'
import { translate, type Lang } from '../i18n'

interface DocumentImportPanelProps {
  state: DocumentImportPanelState | null
  tasks: readonly DocumentImportTask[]
  language: Lang
  onClose: () => void
  onOpenComponents?: () => void
}

export function DocumentImportPanel({ state, tasks, language, onClose, onOpenComponents }: DocumentImportPanelProps) {
  const titleId = useId()
  const messageId = useId()
  const routeId = useId()
  if (!state) return null

  const showTasks = tasks.length > 1 || (tasks.length > 0 && !state.sourceFormat)
  const activeTask = tasks.find(({ state }) => state.phase === 'converting' || state.phase === 'queued')
  const converting = activeTask !== undefined
  const downloading = state.phase === 'downloading'
  const pending = converting || downloading
  const failed = state.phase === 'error' || state.phase === 'componentError' ||
    (!pending && tasks.some((task) => task.state.phase === 'error'))
  const needsComponent = tasks.some(({ state }) => state.phase === 'error' && state.messageKey === 'import.error.converter_missing')
  const title = translate(language, showTasks ? 'import.tasksTitle' : {
    queued: 'import.queued', converting: 'import.convertingTitle', success: 'import.success', error: 'import.fail',
    downloading: 'import.downloadingTitle', componentReady: 'import.componentReadyTitle',
    componentCurrent: 'import.componentCurrentTitle', componentError: 'import.componentErrorTitle',
  }[state.phase])
  const messageKey = 'messageKey' in state ? state.messageKey : {
    queued: 'import.queued', converting: 'import.converting', success: 'import.successSave',
    downloading: 'import.downloading', componentReady: 'import.componentReady',
    componentCurrent: 'import.componentCurrent',
  }[state.phase]
  const message = translate(language, showTasks && state.sourceFormat && !pending
    ? (tasks.some((task) => task.state.phase === 'success') ? 'import.tasksSave' : 'import.tasksFinished')
    : messageKey)
  const closeLabel = translate(language, pending ? 'import.collapse' : 'topbar.close')
  const sourceFormat = activeTask?.state.sourceFormat ?? state.sourceFormat
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
          <span className={`confirm-dialog-icon ${failed ? 'danger' : 'primary'}`} aria-hidden="true">
            {converting ? <ArrowRightLeft size={16} /> : downloading ? <Download size={16} /> : failed ? '!' : '✓'}
          </span>
          <h2 id={titleId} className="confirm-dialog-title-text document-import-title">{title}</h2>
          <button type="button" className="confirm-dialog-btn cancel document-import-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <span aria-hidden="true">{pending ? '−' : '×'}</span>
          </button>
        </div>
        <div className="confirm-dialog-body document-import-body">
          {showTasks && (
            <ul className="document-import-tasks" aria-label={title}>
              {tasks.map(({ id, name, state: taskState }) => (
                <li key={id}>
                  <strong>{taskState.sourceFormat?.kind === 'url' ? translate(language, 'import.urlTask', { id, name }) : name}</strong>
                  <span>{translate(language, taskState.phase === 'error' ? taskState.messageKey : {
                    queued: 'import.queued', converting: 'import.convertingTitle', success: 'import.success',
                  }[taskState.phase])}</span>
                </li>
              ))}
            </ul>
          )}
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
          {pending && <div className="document-import-progress" role="progressbar" aria-labelledby={titleId} />}
          <p id={messageId} className="confirm-dialog-message" role="status">{message}</p>
          {converting && <p className="document-import-hint">{translate(language, 'import.collapseHint')}</p>}
        </div>
        <div className="confirm-dialog-actions">
          {!pending && (needsComponent || state.phase === 'error' && state.messageKey === 'import.error.converter_missing') && onOpenComponents && (
            <button type="button" className="confirm-dialog-btn primary" onClick={onOpenComponents}>{translate(language, 'import.openComponents')}</button>
          )}
          <button type="button" className="confirm-dialog-btn cancel" onClick={onClose}>{closeLabel}</button>
        </div>
      </section>
    </div>
  )
}
