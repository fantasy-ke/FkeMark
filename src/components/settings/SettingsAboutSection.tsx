import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../types'
import type { Lang } from '../../i18n/locales'
import type { Updater } from '../../hooks/useUpdater'
import { GITHUB_URLS, openExternalUrl, formatReleaseDate, formatFileSize, getBuildChannel, getPlatformDownload, type UpdateInfo, type UpdateChannel } from '../../utils/updater'
import { FlatGroup } from './FlatGroup'
import { showConfirm } from '../ConfirmDialog'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface AboutSectionProps {
  t: Translator
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  language: Lang
  appVersion?: string
  updateInfo?: UpdateInfo | null
  checkingUpdate?: boolean
  detectedChannel: UpdateChannel
  setDetectedChannel: Dispatch<SetStateAction<UpdateChannel>>
  onCheckUpdate?: (channel: UpdateChannel) => void
  updater?: Updater
  rollbackAvailable?: boolean
  onOpenDevtools?: () => void
}

export function SettingsAboutSection({ t, settings, update, language, appVersion, updateInfo, checkingUpdate, detectedChannel, setDetectedChannel, onCheckUpdate, updater, rollbackAvailable, onOpenDevtools }: AboutSectionProps) {
  return (
      <>
        <h2 className="settings-content-title">{t('about.title')}</h2>

        {/* Logo 区 */}
        <div className="about-logo-block">
          <div className="about-logo-icon">
            <svg viewBox="0 0 32 32" width="40" height="40" style={{ color: 'var(--accent)' }}>
              <rect x="4" y="6" width="24" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/>
              <line x1="8" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="26" cy="8" r="4" fill="currentColor" stroke="var(--surface)" strokeWidth="1.5"/>
            </svg>
          </div>
          <div className="about-logo-text">Fke<span>Mark</span></div>
          <div className="about-version">v{appVersion || '0.2.0'} · Tolaria Edition</div>
        </div>

        {/* 检查更新 */}
        <FlatGroup title={t('update.title')} defaultOpen={true}>
          {/* 更新通道 + 自动检查 */}
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">{t('update.channel')}</div>
                <div className="settings-hint">{detectedChannel === 'latest' ? t('update.channel.latest.hint') : t('update.channel.dev.hint')}</div>
              </div>
              <div className="settings-radio-group">
                <button className={`settings-radio-btn ${detectedChannel === 'latest' ? 'active' : ''}`}
                  onClick={() => setDetectedChannel('latest')}>{t('update.channel.latest')}
                  {getBuildChannel() === 'latest' && <span className="channel-build-badge">{t('update.channel.buildBadge')}</span>}
                </button>
                <button className={`settings-radio-btn ${detectedChannel === 'dev' ? 'active' : ''}`}
                  onClick={() => setDetectedChannel('dev')}>{t('update.channel.dev')}
                  {getBuildChannel() === 'dev' && <span className="channel-build-badge">{t('update.channel.buildBadge')}</span>}
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">{t('update.autoCheck')}</div>
                <div className="settings-hint">{t('update.autoCheck.hint')}</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.autoCheckUpdate} onChange={(e) => update({ autoCheckUpdate: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* 版本信息 */}
          <div className="about-meta-row">
            <span className="about-meta-key">{t('update.currentVersion')}</span>
            <span className="about-meta-val">v{appVersion || '0.2.0'}</span>
          </div>
          {updateInfo && (
            <>
              <div className="about-meta-row">
                <span className="about-meta-key">{t('update.latestVersion')}</span>
                <span className="about-meta-val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  v{updateInfo.version}
                  {updateInfo.isPrerelease && <span className="update-prerelease-badge">{t('update.prerelease')}</span>}
                </span>
              </div>
              <div className="about-meta-row">
                <span className="about-meta-key">{t('update.releaseDate')}</span>
                <span className="about-meta-val">{formatReleaseDate(updateInfo.releaseDate, language)}</span>
              </div>
            </>
          )}

          {/* 更新状态 + 按钮 */}
          <div className="update-status-row">
            {checkingUpdate ? (
              <span className="update-status checking">
                <svg className="spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/></svg>
                {t('update.checking')}
              </span>
            ) : updateInfo ? (
              updateInfo.isNewer ? (
                <span className="update-status available">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {t('update.available')}: v{updateInfo.version}
                </span>
              ) : (
                <span className="update-status uptodate">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  {t('update.upToDate')}
                </span>
              )
            ) : (
              <span className="update-status idle">{t('update.noRelease')}</span>
            )}
            <button
              className={`update-check-btn ${checkingUpdate ? 'loading' : ''}`}
              onClick={() => onCheckUpdate?.(detectedChannel)}
              disabled={checkingUpdate}
            >
              {checkingUpdate ? t('update.checking') : t('update.checkBtn')}
            </button>
          </div>

          {/* 下载 / 安装 / 回滚 */}
          {updateInfo && updateInfo.isNewer && updater && (() => {
            const asset = getPlatformDownload(updateInfo)
            const { phase, progress, error } = updater
            const percent = progress ? Math.round(progress.percent) : 0
            const canInApp = !!asset  // 当前平台是否支持应用内下载
            return (
              <div className="update-download-section">
                {/* 进度条（下载中 / 已暂停 / 就绪） */}
                {(phase === 'downloading' || phase === 'paused' || phase === 'ready') && progress && (
                  <div className="update-progress">
                    <div className="update-progress-bar">
                      <div className="update-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="update-progress-meta">
                      <span>
                        {formatFileSize(progress.downloaded)}
                        {progress.total > 0 && ` / ${formatFileSize(progress.total)}`}
                        {' '}({percent}%)
                      </span>
                      {phase === 'downloading' && progress.speed > 0 && (
                        <span>{formatFileSize(progress.speed)}/s</span>
                      )}
                      {phase === 'paused' && <span>{t('update.paused')}</span>}
                      {phase === 'ready' && <span>{t('update.ready')}</span>}
                    </div>
                  </div>
                )}

                {/* 错误提示 */}
                {phase === 'error' && error && (
                  <div className="update-error-msg">{t('update.downloadFailed')}: {t(error)}</div>
                )}

                {/* 操作按钮组 */}
                <div className="update-action-row">
                  {canInApp && phase === 'idle' && (
                    <button className="update-download-btn" onClick={() => updater.start(updateInfo)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {t('update.downloadInstall')}
                    </button>
                  )}
                  {phase === 'downloading' && (
                    <button className="update-download-btn ghost" onClick={() => updater.pause()}>
                      {t('update.pause')}
                    </button>
                  )}
                  {phase === 'paused' && (
                    <button className="update-download-btn" onClick={() => updater.start(updateInfo)}>
                      {t('update.resume')}
                    </button>
                  )}
                  {phase === 'error' && (
                    <button className="update-download-btn" onClick={() => updater.start(updateInfo)}>
                      {t('update.retry')}
                    </button>
                  )}
                  {phase === 'ready' && (
                    <button className="update-download-btn primary" onClick={async () => {
                      const ok = await showConfirm(t('update.installConfirm'), t('update.installNow'))
                      if (ok) updater.install()
                    }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v14M6 12l6 6 6-6"/><path d="M4 20h16"/></svg>
                      {t('update.installNow')}
                    </button>
                  )}
                  {phase === 'installing' && (
                    <button className="update-download-btn" disabled>
                      {t('update.installing')}
                    </button>
                  )}
                  {/* 打开网页下载（始终提供作为兜底） */}
                  <button className="update-download-btn ghost" onClick={() => openExternalUrl(updateInfo.htmlUrl)}>
                    {t('update.downloadPage')}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* 回滚到上一版本 */}
          {rollbackAvailable && updater && (
            <div className="update-rollback-section">
              <button className="update-rollback-btn" onClick={async () => {
                const ok = await showConfirm(t('update.rollbackConfirm'), t('update.rollback'))
                if (ok) updater.rollback()
              }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>
                {t('update.rollback')}
              </button>
            </div>
          )}

          {/* 更新内容 */}
          {updateInfo && updateInfo.releaseNotes && (
            <div className="update-release-notes">
              <div className="update-release-notes-title">{t('update.releaseNotes')}</div>
              <div className="update-release-notes-body">
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', margin: 0 }}>{updateInfo.releaseNotes}</pre>
              </div>
            </div>
          )}
        </FlatGroup>

        <FlatGroup title={t('about.intro.title')}>
          <div className="about-desc">{t('about.intro.desc')}</div>
        </FlatGroup>

        <FlatGroup title={t('about.version.title')}>
          <div className="about-meta-row">
            <span className="about-meta-key">{t('about.version.version')}</span>
            <span className="about-meta-val">v{appVersion || '0.2.0'}</span>
          </div>
          <div className="about-meta-row">
            <span className="about-meta-key">{t('about.version.build')}</span>
            <span className="about-meta-val">2026.07.17</span>
          </div>
          <div className="about-meta-row">
            <span className="about-meta-key">{t('about.version.license')}</span>
            <span className="about-meta-val">AGPL-3.0</span>
          </div>
          <div className="about-meta-row">
            <span className="about-meta-key">{t('about.version.engine')}</span>
            <span className="about-meta-val">Tauri + React + ProseMirror</span>
          </div>
        </FlatGroup>

        {/* 调试：打开开发者工具（等同 F12） */}
        <FlatGroup title={t('about.devtools.title')}>
          <div className="settings-row">
            <div className="settings-label-group">
              <div className="settings-label">{t('about.devtools.label')}</div>
              <div className="settings-hint">{t('about.devtools.hint')}</div>
            </div>
            <button
              className="update-check-btn"
              style={{ padding: '4px 12px', fontSize: '12px' }}
              onClick={() => onOpenDevtools?.()}
            >
              {t('about.devtools.open')}
            </button>
          </div>
        </FlatGroup>

        <FlatGroup title={t('about.links.title')}>
          <div className="about-links">
            <button className="about-link-btn" onClick={() => openExternalUrl(GITHUB_URLS.repo)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.7.1 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
              {t('github.repo')}
            </button>
            <button className="about-link-btn" onClick={() => openExternalUrl(GITHUB_URLS.sourceCode)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              {t('github.sourceCode')}
            </button>
            <button className="about-link-btn" onClick={() => openExternalUrl(GITHUB_URLS.newIssue)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {t('github.newIssue')}
            </button>
            <button className="about-link-btn" onClick={() => openExternalUrl(GITHUB_URLS.releases)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {t('github.releases')}
            </button>
            <button className="about-link-btn" onClick={() => openExternalUrl(GITHUB_URLS.license)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              {t('about.links.license')}
            </button>
          </div>
        </FlatGroup>

        <FlatGroup title={t('about.credits.title')}>
          <div className="about-desc" style={{ fontSize: 12, color: 'var(--muted)' }}>{t('about.credits.desc')}</div>
        </FlatGroup>
      </>
  )
}
