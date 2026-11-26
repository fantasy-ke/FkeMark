import { useEffect, useId, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import type { UpdateTab } from '../../app/useAppUpdates'
import type { ConverterUpdate } from '../../app/useConverterUpdate'
import type { Updater } from '../../hooks/useUpdater'
import { translate, type Lang } from '../../i18n'
import { formatReleaseDate, getPlatformDownload, GITHUB_URLS, openExternalUrl, type UpdateChannel, type UpdateInfo } from '../../utils/updater'
import { getPendingDialog } from '../ConfirmDialog'
import { UpdateActions } from './UpdateActions'

interface UpdateDialogProps {
  info: UpdateInfo | null
  currentVersion: string
  language: Lang
  updater: Updater
  converter?: ConverterUpdate
  converterBusy?: boolean
  initialTab?: UpdateTab
  appIgnored?: boolean
  converterIgnored?: boolean
  appCheckFailed?: boolean
  checking?: boolean
  channel?: UpdateChannel
  checkedChannel?: UpdateChannel
  onCheck?: (channel: UpdateChannel, tab: UpdateTab) => void
  onToggleIgnored?: (target: 'app' | 'converter') => void
  onClose: () => void
}

const TABS: UpdateTab[] = ['app', 'converter', 'notes']
const releaseMarkdown = new MarkdownIt({ html: false }).disable(['link', 'autolink', 'image'])

export function UpdateDialog({ info: checkedInfo, currentVersion, language, updater, converter, converterBusy, initialTab = 'app',
  appIgnored, converterIgnored, appCheckFailed, checking, channel = 'latest', checkedChannel = channel, onCheck, onToggleIgnored, onClose }: UpdateDialogProps) {
  const titleId = useId()
  const [tab, setTab] = useState<UpdateTab>(initialTab)
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const t = (key: string, values?: Record<string, string | number>) => translate(language, key, values)
  const info = channel === checkedChannel ? checkedInfo : null
  const component = converter?.info
  const appAvailable = Boolean(info?.isNewer && !appIgnored && updater.phase !== 'installing')
  const converterAvailable = Boolean(component?.isNewer && !converterIgnored)
  const count = Number(appAvailable) + Number(converterAvailable)
  const appCanStart = info && appAvailable && getPlatformDownload(info) && ['idle', 'error', 'paused'].includes(updater.phase)
  const converterDownloading = converterBusy || converter?.phase === 'downloading'
  const converterCanStart = converterAvailable && !converterDownloading && updater.phase !== 'installing'
  const channelLocked = !['idle', 'error'].includes(updater.phase)
  const labels = { app: 'FkeMark', converter: t('settings.components.converter'), notes: t('update.center.notes') }

  useEffect(() => { setTab(initialTab) }, [initialTab])

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
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), select:not(:disabled), summary, [tabindex="0"]',
        ) ?? []).filter(control => !control.closest('details:not([open])') || control.tagName === 'SUMMARY')
        const first = controls[0]
        const last = controls.at(-1)
        const focusOutside = !dialogRef.current?.contains(document.activeElement)
        if (event.shiftKey && (document.activeElement === first || focusOutside)) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
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

  function releaseNotes(notes: string, date: string) {
    return <>
      {date && <p className="update-dialog-hint">{t('update.releaseDate')}: {formatReleaseDate(date, language)}</p>}
      <div className="update-release-notes">
        <div className="update-release-notes-body" tabIndex={0} aria-label={t('update.releaseNotes')}
          dangerouslySetInnerHTML={{ __html: releaseMarkdown.render(notes || t('update.noReleaseNotes')) }} />
      </div>
    </>
  }

  const appPage = info?.htmlUrl || (channel === 'dev' ? GITHUB_URLS.releasesDev : GITHUB_URLS.releasesLatest)
  const converterPage = component ? `${GITHUB_URLS.releases}/tag/${component.tagName}` : GITHUB_URLS.releases

  return (
    <div className="confirm-dialog-overlay update-dialog-overlay">
      <section ref={dialogRef} className="confirm-dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="confirm-dialog-header">
          <div className="update-dialog-title">
            <h2 id={titleId} className="confirm-dialog-title-text">{t('update.center.title')}</h2>
            <span className="update-center-badge" aria-live="polite">{t(checking ? 'update.checking' : 'update.center.count', { count })}</span>
          </div>
          <button className="update-download-btn primary update-all-btn" disabled={!appCanStart && !converterCanStart} onClick={() => {
            if (appCanStart) void updater.start(info)
            if (converterCanStart) void converter?.start()
          }}><RefreshCw size={14} aria-hidden="true" />{t('update.center.all')}</button>
          <button ref={closeRef} className="update-toast-close" aria-label={t('topbar.close')} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="update-center-tabs" role="tablist" aria-label={t('update.center.title')}>
          {TABS.map((item, index) => <button key={item} type="button" role="tab" id={`${titleId}-${item}`} aria-controls={`${titleId}-panel`}
            tabIndex={tab === item ? 0 : -1} aria-selected={tab === item} onClick={() => setTab(item)} onKeyDown={event => {
              const next = event.key === 'Home' ? TABS[0] : event.key === 'End' ? TABS.at(-1)
                : event.key === 'ArrowLeft' ? TABS[(index + TABS.length - 1) % TABS.length]
                  : event.key === 'ArrowRight' ? TABS[(index + 1) % TABS.length] : undefined
              if (!next) return
              event.preventDefault()
              setTab(next)
              document.getElementById(`${titleId}-${next}`)?.focus()
            }}>{labels[item]}{((item === 'app' && appAvailable) || (item === 'converter' && converterAvailable)) && <span className="update-center-badge">1</span>}</button>)}
        </div>
        <div className="confirm-dialog-body update-dialog-body" role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-${tab}`}>
          {tab === 'app' && <>
            <div className="update-dialog-version">
              <span>{t('update.currentVersion')}: v{currentVersion}</span>
              {info && <strong>{t('update.latestVersion')}: v{info.version}</strong>}
              {info?.isPrerelease && <span className="update-prerelease-badge">{t('update.prerelease')}</span>}
            </div>
            {appCheckFailed && <p className="update-dialog-hint" role="status">{t('update.checkFailed')}</p>}
            {info ? releaseNotes(info.releaseNotes, info.releaseDate) : <p className="update-dialog-hint">{t(checking ? 'update.checking' : 'update.noRelease')}</p>}
            {info && !info.isNewer && !appCheckFailed && <p className="update-dialog-hint">{t('update.upToDate')}</p>}
          </>}
          {tab === 'converter' && <>
            {component && <div className="update-dialog-version"><span>{t('update.currentVersion')}: v{component.currentVersion}</span><strong>{t('update.latestVersion')}: v{component.latestVersion}</strong></div>}
            {converter?.checkError && <p className="update-dialog-hint" role="status">{t(converter.checkError)}</p>}
            {component ? releaseNotes(component.releaseNotes, component.releaseDate) : !converter?.checkError && <p className="update-dialog-hint">{t(checking ? 'update.checking' : 'update.center.componentAbsent')}</p>}
            {component && !component.isNewer && <p className="update-dialog-hint" role="status">{t(converter?.phase === 'current' ? 'import.componentReady' : 'import.componentCurrentTitle')}</p>}
          </>}
          {tab === 'notes' && <>
            {info && <section><h3>FkeMark · v{info.version}</h3>{releaseNotes(info.releaseNotes, info.releaseDate)}</section>}
            {component && <section><h3>{labels.converter} · v{component.latestVersion}</h3>{releaseNotes(component.releaseNotes, component.releaseDate)}</section>}
            {!info && !component && <p className="update-dialog-hint">{t('update.noReleaseNotes')}</p>}
          </>}
          <details className="update-center-history">
            <summary>{t('update.center.history')}</summary>
            <button type="button" className="update-download-btn ghost" onClick={() => void openExternalUrl(GITHUB_URLS.releases)}>{t('update.viewReleases')}</button>
          </details>
        </div>
        <div className="update-dialog-footer">
          {updater.phase === 'downloading' && <p className="update-dialog-hint" role="status">{t('update.closeDownloadHint')}</p>}
          {converterDownloading && <p className="update-dialog-hint" role="status">{t('update.center.converterDownloading')}</p>}
          {tab === 'converter' && converter?.error && <div className="update-error-msg" role="alert">{t(converter.error)}</div>}
          <div className="update-center-footer-row">
            {onCheck && <label className="update-center-channel">{t('update.channel')}
              <select value={channel} disabled={checking || channelLocked} onChange={event => onCheck(event.target.value as UpdateChannel, tab)}>
                <option value="latest">{t('update.channel.latest')}</option>
                <option value="dev">{t('update.channel.dev')}</option>
              </select>
            </label>}
            <div className="update-center-actions">
              {tab === 'app' && onCheck && channel !== checkedChannel && appCheckFailed && <button className="update-download-btn ghost" onClick={() => onCheck(channel, tab)}>{t('update.retry')}</button>}
              {tab !== 'notes' && onToggleIgnored && (tab === 'app' ? info?.isNewer && !channelLocked : component?.isNewer && !converterDownloading) && (
                <button className="update-download-btn update-center-ignore" onClick={() => onToggleIgnored(tab)}>
                  {t((tab === 'app' ? appIgnored : converterIgnored) ? 'update.center.restore' : 'update.center.ignore')}
                </button>
              )}
              {tab === 'app' && info?.isNewer ? <UpdateActions info={info} updater={updater} t={t} background installDisabled={converterDownloading} ignored={appIgnored} /> : tab !== 'notes' && (
                <button className="update-download-btn ghost" onClick={() => void openExternalUrl(tab === 'app' ? appPage : converterPage)}>{t('update.downloadPage')}</button>
              )}
              {tab === 'converter' && converterCanStart && <button className="update-download-btn primary" onClick={() => void converter?.start()}>{t(converter?.phase === 'error' ? 'update.retry' : 'update.center.background')}</button>}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
