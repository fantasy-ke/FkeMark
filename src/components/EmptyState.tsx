import { useEffect } from 'react'
import { useI18n } from '../i18n'
import { DOCUMENT_TEMPLATES, expandSnippetVariables } from '../utils/snippets'

interface EmptyStateProps {
  onSelectTemplate: (content: string) => void
  onClose: () => void
}

const PROMPTS = [
  'emptyState.prompt.1',
  'emptyState.prompt.2',
  'emptyState.prompt.3',
  'emptyState.prompt.4',
]

export function EmptyState({ onSelectTemplate, onClose }: EmptyStateProps) {
  const { t, language } = useI18n()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="empty-state-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-start-title"
    >
      <div className="empty-state-inner">
        <button
          type="button"
          className="empty-state-close"
          onClick={onClose}
          title={t('tab.close')}
          aria-label={t('tab.close')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="empty-state-header">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <h2 id="quick-start-title" className="empty-state-title">{t('emptyState.title')}</h2>
          <p className="empty-state-subtitle">{t('emptyState.subtitle')}</p>
        </div>

        <div className="empty-state-templates">
          {DOCUMENT_TEMPLATES.map((template) => (
            <button
              type="button"
              key={template.id}
              className="empty-state-template-card"
              onClick={() => onSelectTemplate(expandSnippetVariables(t(template.contentKey), language))}
            >
              <span className="empty-state-template-icon" dangerouslySetInnerHTML={{ __html: template.icon }} />
              <div className="empty-state-template-info">
                <div className="empty-state-template-title">{t(template.titleKey)}</div>
                <div className="empty-state-template-desc">{t(template.descKey)}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="empty-state-prompts">
          <div className="empty-state-prompts-label">{t('emptyState.promptsLabel')}</div>
          <div className="empty-state-prompts-list">
            {PROMPTS.map((key) => (
              <div key={key} className="empty-state-prompt-item">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.6-6.2 4.6 2.4-7.4L2 9.4h7.6z" opacity="0.3" />
                </svg>
                {t(key)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
