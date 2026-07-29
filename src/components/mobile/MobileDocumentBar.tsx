import { useI18n } from '../../i18n'
import { EditorModeEnum, type EditorMode } from '../../types'
import type { DocumentSyncStatus } from '../../utils/documentStats'

interface MobileDocumentBarProps {
  displayName?: string | null
  isModified: boolean
  saveStatus: DocumentSyncStatus
  syncLabel: string
  lastSavedLabel?: string | null
  lineCount: number
  editorMode: EditorMode
  onEditorModeChange: (mode: EditorMode) => void
}

const mobileModes = [
  { mode: EditorModeEnum.Live, labelKey: 'mobile.mode.live', titleKey: 'status.mode.live' },
  { mode: EditorModeEnum.Split, labelKey: 'mobile.mode.split', titleKey: 'status.mode.split' },
  { mode: EditorModeEnum.Read, labelKey: 'mobile.mode.read', titleKey: 'status.mode.read' },
  { mode: EditorModeEnum.Source, labelKey: 'mobile.mode.source', titleKey: 'status.mode.source' },
] as const

export function MobileDocumentBar({
  displayName,
  isModified,
  saveStatus,
  syncLabel,
  lastSavedLabel,
  lineCount,
  editorMode,
  onEditorModeChange,
}: MobileDocumentBarProps) {
  const { t } = useI18n()
  const fileName = displayName || t('document.untitledFileName')

  return (
    <section className="mobile-document-bar" aria-label={fileName}>
      <div className="mobile-document-bar__summary">
        <div className="mobile-document-bar__title" title={fileName}>
          <span className="mobile-document-bar__name">{fileName}</span>
          {isModified && <span className="mobile-document-bar__modified" title={syncLabel} role="img" aria-label={syncLabel} />}
        </div>
        <div className="mobile-document-bar__meta" title={t('status.sync.label')}>
          <span className={`status-dot ${saveStatus}`} aria-hidden="true" />
          <span>{syncLabel}</span>
          {lastSavedLabel && <span>{lastSavedLabel}</span>}
          <span>{t('status.line', { rows: lineCount, col: 1 })}</span>
        </div>
      </div>
      <div className="mobile-document-bar__modes" role="group" aria-label={t('status.viewMode')}>
        {mobileModes.map((item) => (
          <button
            key={item.mode}
            type="button"
            className={`mobile-document-bar__mode ${editorMode === item.mode ? 'active' : ''}`.trim()}
            onClick={() => onEditorModeChange(item.mode)}
            title={t(item.titleKey)}
            aria-pressed={editorMode === item.mode}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </section>
  )
}
