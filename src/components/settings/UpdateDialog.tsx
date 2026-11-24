import { useEffect, useId, useRef } from 'react'
import type { Updater } from '../../hooks/useUpdater'
import { translate, type Lang } from '../../i18n'
import { formatReleaseDate, type UpdateInfo } from '../../utils/updater'
import { getPendingDialog } from '../ConfirmDialog'
import { UpdateActions } from './UpdateActions'

interface UpdateDialogProps {
  info: UpdateInfo
  currentVersion: string
  language: Lang
  updater: Updater
  onClose: () => void
}

export function UpdateDialog({ info, currentVersion, language, updater, onClose }: UpdateDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const t = (key: string, values?: Record<string, string | number>) => translate(language, key, values)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusClose = () => closeRef.current?.focus()
    if (!getPendingDialog()) focusClose()
    const handleKeyDown = (event: KeyboardEvent) => {
      // 安装确认框拥有更高优先级，避免 Escape 同时关闭两个弹窗。
      if (getPendingDialog()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('fkemark:dialog-close', focusClose)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('fkemark:dialog-close', focusClose)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return (
    <div className="confirm-dialog-overlay update-dialog-overlay">
      <section ref={dialogRef} className="confirm-dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="confirm-dialog-header">
          <h2 id={titleId} className="confirm-dialog-title-text update-dialog-title">{t('update.newVersionAvailable')}</h2>
          <button ref={closeRef} className="update-toast-close" aria-label={t('topbar.close')} onClick={onClose}><span aria-hidden="true">×</span></button>
        </div>
        <div className="confirm-dialog-body update-dialog-body">
          <div className="update-dialog-version"><span>{t('update.currentVersion')}: v{currentVersion}</span><strong>{t('update.latestVersion')}: v{info.version}</strong></div>
          <p className="update-dialog-hint">{t('update.releaseDate')}: {formatReleaseDate(info.releaseDate, language)}</p>
          {info.isPrerelease && <span className="update-prerelease-badge">{t('update.prerelease')}</span>}
          <div className="update-release-notes">
            <div className="update-release-notes-title">{t('update.releaseNotes')}</div>
            <div className="update-release-notes-body"><pre>{info.releaseNotes || t('update.noReleaseNotes')}</pre></div>
          </div>
        </div>
        <div className="update-dialog-footer">
          <UpdateActions info={info} updater={updater} t={t} />
          {updater.phase === 'downloading' && <p className="update-dialog-hint">{t('update.closeDownloadHint')}</p>}
          <button className="confirm-dialog-btn cancel" onClick={onClose}>{t('topbar.close')}</button>
        </div>
      </section>
    </div>
  )
}
