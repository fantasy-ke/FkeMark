import { useI18n } from '../i18n'

interface WelcomeScreenProps {
  onNewFile: () => void
  onOpenFolder: () => void
}

export function WelcomeScreen({ onNewFile, onOpenFolder }: WelcomeScreenProps) {
  const { t } = useI18n()
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">
        Fke<span>Mark</span>
      </div>
      <div className="welcome-tagline">
        {t('welcome.tagline')}<br />
        {t('welcome.taglineEn')}
      </div>
      <div className="welcome-actions">
        <button className="welcome-btn" onClick={onNewFile}>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M14 2H6a2 0 0 0-2 2v16a2 0 0 0 2 2h12a2 0 0 0 2-2V8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="1.8" />
            <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          {t('welcome.newFile')}
        </button>
        <button className="welcome-btn" onClick={onOpenFolder}>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M22 19a2 2 0 0 1-2 2H4a2 0 0 1-2-2V5a2 0 0 1 2-2h5l2 3h9a2 0 0 1 2 2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
          {t('welcome.openFolder')}
        </button>
      </div>
      <div className="welcome-hint">
        <kbd>Ctrl+N</kbd> {t('welcome.hintNew')} &nbsp;·&nbsp; <kbd>Ctrl+O</kbd> {t('welcome.hintOpen')}
      </div>
    </div>
  )
}
