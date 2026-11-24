import type { Updater } from '../../hooks/useUpdater'
import { formatFileSize, getPlatformDownload, openExternalUrl, type UpdateInfo } from '../../utils/updater'
import { showConfirm } from '../ConfirmDialog'

interface UpdateActionsProps {
  info: UpdateInfo
  updater: Updater
  t: (key: string, values?: Record<string, string | number>) => string
}

export function UpdateActions({ info, updater, t }: UpdateActionsProps) {
  const { phase, progress, error } = updater
  const percent = progress ? Math.min(100, Math.max(0, Math.round(progress.percent))) : 0
  const asset = getPlatformDownload(info)

  return (
    <div className="update-download-section">
      {(phase === 'downloading' || phase === 'paused' || phase === 'ready') && progress && (
        <div className="update-progress">
          <div className="update-progress-bar" role="progressbar" aria-label={t('update.downloading')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="update-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="update-progress-meta">
            <span>{formatFileSize(progress.downloaded)}{progress.total > 0 && ` / ${formatFileSize(progress.total)}`} ({percent}%)</span>
            {phase === 'downloading' && progress.speed > 0 && <span>{formatFileSize(progress.speed)}/s</span>}
            {phase === 'paused' && <span>{t('update.paused')}</span>}
            {phase === 'ready' && <span>{t('update.ready')}</span>}
          </div>
        </div>
      )}
      {error && <div className="update-error-msg" role="alert">{t(error)}</div>}
      {!asset && <p className="update-dialog-hint">{t('update.noPlatformPackage')}</p>}
      <div className="update-action-row">
        {asset && phase === 'idle' && <button className="update-download-btn" onClick={() => updater.start(info)}>{t('update.downloadInstall')}</button>}
        {phase === 'downloading' && <button className="update-download-btn ghost" onClick={() => updater.pause()}>{t('update.pause')}</button>}
        {phase === 'paused' && <button className="update-download-btn" onClick={() => updater.start(info)}>{t('update.resume')}</button>}
        {asset && phase === 'error' && <button className="update-download-btn" onClick={() => updater.start(info)}>{t('update.retry')}</button>}
        {phase === 'ready' && (
          <button className="update-download-btn primary" onClick={async () => {
            if (await showConfirm(t('update.installConfirm'), t('update.installNow'))) void updater.install()
          }}>{t('update.installNow')}</button>
        )}
        {phase === 'installing' && <button className="update-download-btn" disabled>{t('update.installing')}</button>}
        <button className="update-download-btn ghost" onClick={() => openExternalUrl(info.htmlUrl)}>{t('update.downloadPage')}</button>
      </div>
    </div>
  )
}
