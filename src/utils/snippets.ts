import type { Lang } from '../i18n/locales'

export interface BuiltInSnippet {
  id: string
  icon: string
  titleKey: string
  descKey: string
  contentKey: string
}

export interface CustomSnippet {
  id: string
  name: string
  content: string
}

export const CUSTOM_SNIPPETS_STORAGE_KEY = 'fkemark.custom-snippets.v1'

export const DOCUMENT_TEMPLATES: BuiltInSnippet[] = [
  {
    id: 'blank',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    titleKey: 'emptyState.template.blank',
    descKey: 'emptyState.template.blank.desc',
    contentKey: 'emptyState.template.blank.content',
  },
  {
    id: 'diary',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    titleKey: 'emptyState.template.diary',
    descKey: 'emptyState.template.diary.desc',
    contentKey: 'emptyState.template.diary.content',
  },
  {
    id: 'meeting',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    titleKey: 'emptyState.template.meeting',
    descKey: 'emptyState.template.meeting.desc',
    contentKey: 'emptyState.template.meeting.content',
  },
  {
    id: 'todo',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    titleKey: 'emptyState.template.todo',
    descKey: 'emptyState.template.todo.desc',
    contentKey: 'emptyState.template.todo.content',
  },
  {
    id: 'tech',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    titleKey: 'emptyState.template.tech',
    descKey: 'emptyState.template.tech.desc',
    contentKey: 'emptyState.template.tech.content',
  },
  {
    id: 'reading',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    titleKey: 'emptyState.template.reading',
    descKey: 'emptyState.template.reading.desc',
    contentKey: 'emptyState.template.reading.content',
  },
]

export const INSERTABLE_SNIPPETS = DOCUMENT_TEMPLATES.filter((template) => template.id !== 'blank')

function availableStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadCustomSnippets(storage: Storage | null = availableStorage()): CustomSnippet[] {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(CUSTOM_SNIPPETS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CustomSnippet => (
      item !== null
      && typeof item === 'object'
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.content === 'string'
      && item.name.trim().length > 0
      && item.content.trim().length > 0
    ))
  } catch {
    return []
  }
}

export function saveCustomSnippets(
  snippets: CustomSnippet[],
  storage: Storage | null = availableStorage()
): boolean {
  if (!storage) return false
  try {
    storage.setItem(CUSTOM_SNIPPETS_STORAGE_KEY, JSON.stringify(snippets))
    return true
  } catch {
    return false
  }
}

export function expandSnippetVariables(content: string, language: Lang, now = new Date()): string {
  const locale = language === 'en' ? 'en-US' : 'zh-CN'
  const date = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)

  return content
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
}