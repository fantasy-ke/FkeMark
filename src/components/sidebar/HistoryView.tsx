import type { FileEntry, FolderHistoryEntry } from '../../types'
import { useI18n } from '../../i18n'
import { pathsEqual } from '../../utils/filePaths'
import { isExcalidrawFilePath } from '../../utils/markdown/excalidraw'
import { openExcalidrawFile } from '../editor/excalidrawSession'

interface HistoryViewProps {
  folderPath?: string | null
  folderHistory?: FolderHistoryEntry[]
  recentFiles: FileEntry[]
  currentFile: string | null
  onOpenFile: (path: string) => void
  onReopenFolder?: (path: string) => void
  onRemoveFolderHistory?: (path: string) => void
  onOpenFolder?: () => void
}

function formatHistoryTime(ts: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  const hour = Math.floor(diff / 3600000)
  const day = Math.floor(diff / 86400000)
  if (min < 1) return t('sidebar.time.now')
  if (min < 60) return t('sidebar.time.minutes', { n: min })
  if (hour < 24) return t('sidebar.time.hours', { n: hour })
  if (day < 7) return t('sidebar.time.days', { n: day })
  const date = new Date(ts)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function HistoryView({
  folderPath, folderHistory, recentFiles, currentFile, onOpenFile, onReopenFolder, onRemoveFolderHistory, onOpenFolder,
}: HistoryViewProps) {
  const { t } = useI18n()
  const folderOpen = Boolean(folderPath)
  const folders = folderHistory ?? []

  return (
    <div className="sidebar-content">
      {!folderOpen && (
        <>
          <div className="sidebar-section">{t('sidebar.recent')}</div>
          {folders.length === 0 ? (
            <div className="toc-empty">{t('sidebar.history.empty')}</div>
          ) : folders.map((entry) => (
            <div
              key={entry.path}
              className="file-item folder-item"
              title={entry.path}
              onClick={() => onReopenFolder?.(entry.path)}
            >
              <span className="file-name">{entry.name}</span>
              <span className="history-time">{formatHistoryTime(entry.openedAt, t)}</span>
              <button
                type="button"
                className="history-remove-btn"
                title={t('sidebar.remove')}
                onClick={(event) => { event.stopPropagation(); onRemoveFolderHistory?.(entry.path) }}
              >
                ×
              </button>
            </div>
          ))}
          <div className="toc-empty">
            <button type="button" className="sidebar-open-folder" onClick={() => onOpenFolder?.()}>
              {t('sidebar.openOther')}
            </button>
          </div>
        </>
      )}
      {folderOpen && <div className="toc-empty">{t('sidebar.history.folderOpen')}</div>}
      {recentFiles.length > 0 && (
        <>
          <div className="sidebar-section">{t('sidebar.recentFiles')}</div>
          {recentFiles.map((file) => (
            <div
              key={file.path}
              className={`file-item ${currentFile && pathsEqual(currentFile, file.path) ? 'active' : ''}`}
              title={file.path}
              onClick={() => {
                if (isExcalidrawFilePath(file.path)) void openExcalidrawFile(file.path)
                else onOpenFile(file.path)
              }}
            >
              <span className="file-name">{file.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
