import { useI18n } from '../i18n'
import { DOCUMENT_TEMPLATES, expandSnippetVariables } from '../utils/snippets'

interface EmptyStateProps {
  onInsertTemplate: (content: string) => void
}

const PROMPTS = [
  'emptyState.prompt.1',
  'emptyState.prompt.2',
  'emptyState.prompt.3',
  'emptyState.prompt.4',
]

export function EmptyState({ onInsertTemplate }: EmptyStateProps) {
  const { t, language } = useI18n()

  return (
    <div className="empty-state-container">
      <div className="empty-state-inner">
        {/* 标题 */}
        <div className="empty-state-header">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <h3 className="empty-state-title">{t('emptyState.title')}</h3>
          <p className="empty-state-subtitle">{t('emptyState.subtitle')}</p>
        </div>

        {/* 模板选择 */}
        <div className="empty-state-templates">
          {DOCUMENT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              className="empty-state-template-card"
              onClick={() => onInsertTemplate(expandSnippetVariables(t(template.contentKey), language))}
            >
              <span className="empty-state-template-icon" dangerouslySetInnerHTML={{ __html: template.icon }} />
              <div className="empty-state-template-info">
                <div className="empty-state-template-title">{t(template.titleKey)}</div>
                <div className="empty-state-template-desc">{t(template.descKey)}</div>
              </div>
            </button>
          ))}
        </div>

        {/* 写作灵感提示 */}
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