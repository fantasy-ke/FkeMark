import { useEffect } from 'react'
import { useI18n } from '../i18n'

interface AboutPageProps {
  open: boolean
  onClose: () => void
}

export function AboutPage({ open, onClose }: AboutPageProps) {
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <>
      <div className={`about-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`about-panel ${open ? 'open' : ''}`}>
        <div className="about-header">
          <h2>{t('about.title')}</h2>
          <button className="settings-close" onClick={onClose} title={t('about.close')}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="about-body">
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
            <div className="about-version">v0.1.0 · Tolaria Edition</div>
          </div>

          {/* 简介 */}
          <div className="about-section">
            <div className="about-section-title">{t('about.intro.title')}</div>
            <div className="about-desc">
              {t('about.intro.desc')}
            </div>
          </div>

          {/* 版本信息 */}
          <div className="about-section">
            <div className="about-section-title">{t('about.version.title')}</div>
            <div className="about-meta-row">
              <span className="about-meta-key">{t('about.version.version')}</span>
              <span className="about-meta-val">0.1.0</span>
            </div>
            <div className="about-meta-row">
              <span className="about-meta-key">{t('about.version.build')}</span>
              <span className="about-meta-val">2025.07.15</span>
            </div>
            <div className="about-meta-row">
              <span className="about-meta-key">{t('about.version.license')}</span>
              <span className="about-meta-val">MIT License</span>
            </div>
            <div className="about-meta-row">
              <span className="about-meta-key">{t('about.version.engine')}</span>
              <span className="about-meta-val">Tauri + React + ProseMirror</span>
            </div>
          </div>

          {/* 链接 */}
          <div className="about-section">
            <div className="about-section-title">{t('about.links.title')}</div>
            <div className="about-links">
              <button className="about-link-btn" onClick={() => { /* TODO: 打开官网 */ }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                {t('about.links.site')}
              </button>
              <button className="about-link-btn" onClick={() => { /* TODO: 打开 GitHub */ }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.7.1 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
                {t('about.links.github')}
              </button>
              <button className="about-link-btn" onClick={() => { /* TODO: 反馈 */ }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                {t('about.links.feedback')}
              </button>
              <button className="about-link-btn" onClick={() => { /* TODO: 许可证 */ }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                {t('about.links.license')}
              </button>
            </div>
          </div>

          {/* 致谢 */}
          <div className="about-section">
            <div className="about-section-title">{t('about.credits.title')}</div>
            <div className="about-desc" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {t('about.credits.desc')}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
