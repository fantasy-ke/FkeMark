import { useI18n } from '../i18n'

interface EmptyStateProps {
  onInsertTemplate: (content: string) => void
}

interface Template {
  id: string
  icon: string
  titleKey: string
  descKey: string
  contentKey: string
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    titleKey: 'emptyState.template.blank',
    descKey: 'emptyState.template.blank.desc',
    contentKey: 'emptyState.template.blank.content',
  },
  {
    id: 'diary',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    titleKey: 'emptyState.template.diary',
    descKey: 'emptyState.template.diary.desc',
    contentKey: 'emptyState.template.diary.content',
  },
  {
    id: 'meeting',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    titleKey: 'emptyState.template.meeting',
    descKey: 'emptyState.template.meeting.desc',
    contentKey: 'emptyState.template.meeting.content',
  },
  {
    id: 'todo',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    titleKey: 'emptyState.template.todo',
    descKey: 'emptyState.template.todo.desc',
    contentKey: 'emptyState.template.todo.content',
  },
  {
    id: 'tech',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    titleKey: 'emptyState.template.tech',
    descKey: 'emptyState.template.tech.desc',
    contentKey: 'emptyState.template.tech.content',
  },
  {
    id: 'reading',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    titleKey: 'emptyState.template.reading',
    descKey: 'emptyState.template.reading.desc',
    contentKey: 'emptyState.template.reading.content',
  },
]

const PROMPTS = [
  'emptyState.prompt.1',
  'emptyState.prompt.2',
  'emptyState.prompt.3',
  'emptyState.prompt.4',
]

export function EmptyState({ onInsertTemplate }: EmptyStateProps) {
  const { t } = useI18n()

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
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              className="empty-state-template-card"
              onClick={() => onInsertTemplate(t(tpl.contentKey))}
            >
              <span className="empty-state-template-icon" dangerouslySetInnerHTML={{ __html: tpl.icon }} />
              <div className="empty-state-template-info">
                <div className="empty-state-template-title">{t(tpl.titleKey)}</div>
                <div className="empty-state-template-desc">{t(tpl.descKey)}</div>
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
