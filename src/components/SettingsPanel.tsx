import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppSettings, EditorMode } from '../types'
import { getAvailableFonts, type FontGroupKey, type FontOption } from '../utils/fonts'
import { useI18n } from '../i18n'
import { LANG_LABELS, type Lang } from '../i18n/locales'
import { GITHUB_URLS, openExternalUrl, formatReleaseDate, type UpdateInfo } from '../utils/updater'

// ── 导航项定义 ──
type SettingsSection =
  | 'appearance'
  | 'editor'
  | 'view'
  | 'behavior'
  | 'language'
  | 'shortcuts'
  | 'experimental'
  | 'about'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  initialSection?: string
  appVersion?: string
  updateInfo?: UpdateInfo | null
  checkingUpdate?: boolean
  onCheckUpdate?: () => void
}

const SECTIONS: { id: SettingsSection; icon: string; labelKey: string }[] = [
  {
    id: 'appearance',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    labelKey: 'settings.nav.appearance',
  },
  {
    id: 'editor',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    labelKey: 'settings.nav.editor',
  },
  {
    id: 'view',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    labelKey: 'settings.nav.view',
  },
  {
    id: 'behavior',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    labelKey: 'settings.nav.behavior',
  },
  {
    id: 'language',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    labelKey: 'settings.nav.language',
  },
  {
    id: 'shortcuts',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M15 11h2M17 13h-2"/></svg>',
    labelKey: 'settings.nav.shortcuts',
  },
  {
    id: 'experimental',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4.5 17.5a2.5 2.5 0 0 1-.96-4.804A2.5 2.5 0 0 1 2.5 10a2.5 2.5 0 0 1 3.46-2.309A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v15a2.5 2.5 0 1 0-4.96-.44A2.5 2.5 0 0 1 9.5 17.5c0-1.38 1.12-2.5 2.5-2.5.25 0 .49.04.72.1A2.5 2.5 0 0 1 14.5 2z"/></svg>',
    labelKey: 'settings.nav.experimental',
  },
  {
    id: 'about',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    labelKey: 'settings.nav.about',
  },
]

// ── 设置搜索索引项 ──
interface SearchableSetting {
  section: SettingsSection
  sectionLabel: string
  group: string
  title: string
  desc: string
  keywords: string[]
}

export function SettingsPanel({ open, onClose, settings, onSettingsChange, initialSection, appVersion, updateInfo, checkingUpdate, onCheckUpdate }: SettingsPanelProps) {
  const { t, language, setLanguage } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')
  // 折叠状态：记录每个 section 下每个 group 是否折叠
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery) { setSearchQuery(''); return }
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, searchQuery])

  // 打开设置时：如果有指定 section 则导航到该 section，否则默认外观页
  useEffect(() => {
    if (open) {
      if (initialSection) {
        setActiveSection(initialSection as SettingsSection)
      } else {
        setActiveSection('appearance')
      }
    }
  }, [open, initialSection])

  const update = (patch: Partial<AppSettings>) => {
    onSettingsChange({ ...settings, ...patch })
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── 构建设置搜索索引 ──
  const settingsIndex = useMemo<SearchableSetting[]>(() => {
    const idx: SearchableSetting[] = []
    const sec = (s: SettingsSection) => t(`settings.nav.${s}`)

    // 外观
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.theme'), title: t('settings.theme'), desc: t('settings.theme.hint'), keywords: ['theme', 'light', 'dark', 'system', '主题', '明亮', '黑暗'] })
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.toolbarFloating'), title: t('settings.toolbarFloating'), desc: t('settings.toolbarFloating.hint'), keywords: ['toolbar', 'floating', '工具栏', '悬浮'] })
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.cornerRadius'), title: t('settings.cornerRadius'), desc: t('settings.cornerRadius.hint'), keywords: ['radius', 'corner', '圆角'] })
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.cornerRadius'), title: t('settings.buttonRadius'), desc: t('settings.buttonRadius.hint'), keywords: ['button', 'radius', '按钮', '圆角'] })

    // 编辑器
    idx.push({ section: 'editor', sectionLabel: sec('editor'), group: t('settings.fontFamily'), title: t('settings.fontFamily'), desc: t('settings.fontFamily.hint'), keywords: ['font', 'family', '字体'] })
    idx.push({ section: 'editor', sectionLabel: sec('editor'), group: t('settings.fontSize'), title: t('settings.fontSize'), desc: t('settings.fontSize.hint'), keywords: ['font', 'size', '字号', '大小'] })
    idx.push({ section: 'editor', sectionLabel: sec('editor'), group: t('settings.lineHeight'), title: t('settings.lineHeight'), desc: t('settings.lineHeight.hint'), keywords: ['line', 'height', 'spacing', '行高', '间距'] })
    idx.push({ section: 'editor', sectionLabel: sec('editor'), group: t('settings.editorWidth'), title: t('settings.editorWidth'), desc: t('settings.editorWidth.hint'), keywords: ['width', '宽度'] })
    idx.push({ section: 'editor', sectionLabel: sec('editor'), group: t('settings.showMarkers'), title: t('settings.showMarkers'), desc: t('settings.showMarkers.hint'), keywords: ['markdown', 'markers', '标记'] })
    idx.push({ section: 'editor', sectionLabel: sec('editor'), group: t('settings.autoBracket'), title: t('settings.autoBracket'), desc: t('settings.autoBracket.hint'), keywords: ['bracket', 'auto', '括号', '补全'] })

    // 视图
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('settings.defaultMode'), title: t('settings.defaultMode'), desc: t('settings.defaultMode.hint'), keywords: ['mode', 'default', '视图', '模式'] })
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('settings.showLineNumbers'), title: t('settings.showLineNumbers'), desc: t('settings.showLineNumbers.hint'), keywords: ['line', 'numbers', '行号'] })
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('settings.minimap'), title: t('settings.minimap'), desc: t('settings.minimap.hint'), keywords: ['minimap', '小地图'] })
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('settings.minimapSide'), title: t('settings.minimapSide'), desc: t('settings.minimapSide.hint'), keywords: ['minimap', 'side', '位置', '左', '右'] })
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('focusMode.label'), title: t('focusMode.label'), desc: t('focusMode.hint'), keywords: ['focus', '专注', '模式'] })

    // 行为
    idx.push({ section: 'behavior', sectionLabel: sec('behavior'), group: t('settings.autoSave'), title: t('settings.autoSave'), desc: t('settings.autoSave.hint'), keywords: ['auto', 'save', '自动保存'] })
    idx.push({ section: 'behavior', sectionLabel: sec('behavior'), group: t('settings.autoSave'), title: t('settings.autoSaveInterval'), desc: t('settings.autoSaveInterval.hint', { n: settings.autoSaveInterval }), keywords: ['auto', 'save', 'interval', '间隔', '时间'] })

    // 语言
    idx.push({ section: 'language', sectionLabel: sec('language'), group: t('settings.group.language'), title: t('settings.group.language'), desc: t('settings.language.hint'), keywords: ['language', '语言', '中文', 'english'] })

    // 快捷键
    idx.push({ section: 'shortcuts', sectionLabel: sec('shortcuts'), group: t('settings.group.shortcuts'), title: t('settings.group.shortcuts'), desc: t('shortcut.newFile') + ', ' + t('shortcut.save') + ', ...', keywords: ['shortcut', 'keybinding', '快捷键', 'hotkey'] })

    // 实验性
    idx.push({ section: 'experimental', sectionLabel: sec('experimental'), group: t('experimental.mermaid'), title: t('experimental.mermaid'), desc: t('experimental.mermaid.hint'), keywords: ['mermaid', 'diagram', '图表'] })
    idx.push({ section: 'experimental', sectionLabel: sec('experimental'), group: t('experimental.vim'), title: t('experimental.vim'), desc: t('experimental.vim.hint'), keywords: ['vim', 'editor', 'mode'] })

    // 关于
    idx.push({ section: 'about', sectionLabel: sec('about'), group: t('update.title'), title: t('update.title'), desc: t('update.channel'), keywords: ['update', 'version', '检查', '更新', '版本'] })
    idx.push({ section: 'about', sectionLabel: sec('about'), group: t('about.version.title'), title: t('about.version.title'), desc: t('about.version.version'), keywords: ['version', 'build', 'license', '版本', '构建', '许可'] })
    idx.push({ section: 'about', sectionLabel: sec('about'), group: t('about.links.title'), title: t('about.links.title'), desc: t('github.repo'), keywords: ['github', 'link', 'repo', '链接', '仓库'] })

    return idx
  }, [t, language, settings.autoSaveInterval])

  // ── 搜索过滤 ──
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return settingsIndex.filter((item) => {
      const haystack = [item.title, item.desc, item.sectionLabel, item.group, ...item.keywords].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [searchQuery, settingsIndex])

  // ── 点击搜索结果：导航到对应 section + 展开对应 group ──
  function handleSearchResultClick(result: SearchableSetting) {
    setSearchQuery('')
    setActiveSection(result.section)
    // 展开对应的 group
    const key = `${result.section}-${result.group}`
    setCollapsedGroups((prev) => ({ ...prev, [key]: false }))
  }

  // 字体加载
  const [fonts, setFonts] = useState<FontOption[]>([])
  useEffect(() => {
    if (!open) return
    let alive = true
    getAvailableFonts()
      .then((list) => { if (alive) setFonts(list) })
      .catch(() => {})
    return () => { alive = false }
  }, [open])

  const fontGroups = useMemo(() => {
    const map: Record<FontGroupKey, FontOption[]> = { default: [], cjk: [], latin: [], mono: [] }
    for (const f of fonts) map[f.group].push(f)
    return map
  }, [fonts])

  const GROUP_LABELS: Record<FontGroupKey, string> = {
    default: t('font.group.default'),
    cjk: t('font.group.cjk'),
    latin: t('font.group.latin'),
    mono: t('font.group.mono'),
  }

  const currentFontKnown = fonts.some((f) => f.value === settings.fontFamily)

  const shortcuts: Array<[string, string]> = [
    ['Ctrl+N', 'shortcut.newFile'],
    ['Ctrl+S', 'shortcut.save'],
    ['Ctrl+O', 'shortcut.openFolder'],
    ['Ctrl+Shift+F', 'shortcut.toggleView'],
    ['ESC', 'shortcut.exitRead'],
    ['Ctrl+1~6', 'shortcut.heading'],
    ['Ctrl+0', 'shortcut.body'],
    ['Ctrl+B / I', 'shortcut.boldItalic'],
    ['Alt+S', 'shortcut.strike'],
    ['Ctrl+Shift+Q', 'shortcut.quote'],
    ['Ctrl+K', 'shortcut.link'],
    ['Tab', 'shortcut.tableCell'],
    ['/', 'shortcut.slash'],
  ]

  const langOptions: Lang[] = ['zh-CN', 'en']

  // ── 可折叠分组组件 ──
  function CollapsibleGroup({
    title,
    defaultOpen = true,
    children,
    badge,
  }: {
    title: string
    defaultOpen?: boolean
    children: React.ReactNode
    badge?: string
  }) {
    const key = `${activeSection}-${title}`
    const collapsed = collapsedGroups[key] ?? !defaultOpen
    return (
      <div className="settings-group">
        <button className="settings-group-header" onClick={() => toggleGroup(key)}>
          <span className="settings-group-title">{title}</span>
          {badge && <span className="experimental-badge">{badge}</span>}
          <svg
            className={`settings-group-chevron ${collapsed ? '' : 'open'}`}
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {!collapsed && <div className="settings-group-body">{children}</div>}
      </div>
    )
  }

  // ── 实验性功能提示横幅 ──
  function ExperimentalBanner() {
    return (
      <div className="experimental-banner">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="currentColor" strokeWidth="2"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>{t('experimental.hint')}</span>
      </div>
    )
  }

  // ════════════════════════════════════
  // 渲染
  // ════════════════════════════════════
  if (!open) return null

  return (
    <div className="settings-page-overlay" onClick={onClose}>
      <div className="settings-page" onClick={(e) => e.stopPropagation()}>
        {/* ─── 左侧导航栏 ─── */}
        <nav className="settings-nav">
          <div className="settings-nav-brand">
            <svg viewBox="0 0 32 32" width="24" height="24" style={{ color: 'var(--accent)' }}>
              <rect x="4" y="6" width="24" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/>
              <line x1="8" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="26" cy="8" r="4" fill="currentColor" stroke="var(--surface)" strokeWidth="1.5"/>
            </svg>
            <span>Fke<span>Mark</span></span>
          </div>

          <div className="settings-nav-items">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                className={`settings-nav-item ${activeSection === sec.id ? 'active' : ''} ${sec.id === 'experimental' ? 'experimental' : ''}`}
                onClick={() => setActiveSection(sec.id)}
                title={t(sec.labelKey)}
              >
                <span className="nav-icon" dangerouslySetInnerHTML={{ __html: sec.icon }} />
                <span className="nav-label">{t(sec.labelKey)}</span>
                {sec.id === 'experimental' && <span className="nav-badge">{t('experimental.badge')}</span>}
              </button>
            ))}
          </div>

          <div className="settings-nav-footer">
            <button className="settings-back-btn" onClick={onClose}>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <polyline points="15 18 9 12 15 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('settings.back')}
            </button>
          </div>
        </nav>

        {/* ─── 右侧内容区 ─── */}
        <main className="settings-content">
          {/* 搜索栏 */}
          <div className="settings-search-bar">
            <div className="settings-search-input-wrap">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="settings-search-input"
                placeholder={t('settings.search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="settings-search-clear" onClick={() => setSearchQuery('')}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* 搜索结果模式 */}
          {searchQuery.trim() ? (
            <div className="settings-search-results">
              <div className="settings-content-title">{t('settings.search.results')} ({searchResults.length})</div>
              {searchResults.length === 0 ? (
                <div className="settings-search-empty">{t('settings.search.empty')}</div>
              ) : (
                searchResults.map((result, i) => (
                  <div
                    key={`${result.section}-${result.group}-${i}`}
                    className="settings-search-result-item"
                    onClick={() => handleSearchResultClick(result)}
                  >
                    <span className="settings-search-result-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <div className="settings-search-result-info">
                      <div className="settings-search-result-title">{result.title}</div>
                      <div className="settings-search-result-desc">{result.desc}</div>
                    </div>
                    <span className="settings-search-result-section">{result.sectionLabel}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
          <>
          {/* 外观 */}
          {activeSection === 'appearance' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.appearance')}</h2>
              <CollapsibleGroup title={t('settings.theme')}>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.theme')}</div>
                    <div className="settings-hint">{t('settings.theme.hint')}</div>
                  </div>
                  <div className="theme-toggle-group">
                    {(['light', 'dark', 'system'] as const).map((mode) => (
                      <button
                        key={mode}
                        className={`theme-toggle-btn ${settings.theme === mode ? 'active' : ''}`}
                        onClick={() => update({ theme: mode })}
                      >
                        {mode === 'light' && <><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><span>{t('settings.theme.light')}</span></>}
                        {mode === 'dark' && <><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>{t('settings.theme.dark')}</span></>}
                        {mode === 'system' && <><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span>{t('settings.theme.system')}</span></>}
                      </button>
                    ))}
                  </div>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.toolbarFloating')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.toolbarFloating')}</div>
                    <div className="settings-hint">{t('settings.toolbarFloating.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.toolbarFloating} onChange={(e) => update({ toolbarFloating: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.cornerRadius')}>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="settings-label-group">
                      <div className="settings-label">{t('settings.cornerRadius')}</div>
                      <div className="settings-hint">{t('settings.cornerRadius.hint')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" min={0} max={16} value={settings.cornerRadius}
                        onChange={(e) => { const v = parseInt(e.target.value) || 6; update({ cornerRadius: Math.min(16, Math.max(0, v)) }) }}
                        style={numInputStyle} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.px')}</span>
                    </div>
                  </div>
                  <input type="range" min={0} max={16} value={settings.cornerRadius}
                    onChange={(e) => update({ cornerRadius: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </div>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="settings-label-group">
                      <div className="settings-label">{t('settings.buttonRadius')}</div>
                      <div className="settings-hint">{t('settings.buttonRadius.hint')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" min={0} max={12} value={settings.buttonRadius}
                        onChange={(e) => { const v = parseInt(e.target.value) || 4; update({ buttonRadius: Math.min(12, Math.max(0, v)) }) }}
                        style={numInputStyle} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.px')}</span>
                    </div>
                  </div>
                  <input type="range" min={0} max={12} value={settings.buttonRadius}
                    onChange={(e) => update({ buttonRadius: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </div>
              </CollapsibleGroup>
            </>
          )}

          {/* 编辑器 */}
          {activeSection === 'editor' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.editor')}</h2>
              <CollapsibleGroup title={t('settings.fontFamily')}>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.fontFamily')}</div>
                    <div className="settings-hint">{t('settings.fontFamily.hint')}</div>
                  </div>
                  <select className="settings-select" value={settings.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
                    {!currentFontKnown && <option value={settings.fontFamily}>{settings.fontFamily}</option>}
                    {(['default', 'cjk', 'latin', 'mono'] as FontGroupKey[]).map((g) => {
                      const items = fontGroups[g]
                      if (!items || items.length === 0) return null
                      return (
                        <optgroup key={g} label={GROUP_LABELS[g]}>
                          {items.map((f) => (
                            <option key={f.value} value={f.value} style={{ fontFamily: `"${f.value}"` }}>{f.value}</option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                  {fonts.length === 0 ? <div className="settings-hint">{t('font.loading')}</div> : <div className="settings-hint">{t('font.count', { n: fonts.length })}</div>}
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.fontSize')}>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="settings-label-group">
                      <div className="settings-label">{t('settings.fontSize')}</div>
                      <div className="settings-hint">{t('settings.fontSize.hint')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" min={8} max={48} value={settings.fontSize}
                        onChange={(e) => { const v = parseInt(e.target.value) || 16; update({ fontSize: Math.min(48, Math.max(8, v)) }) }}
                        style={numInputStyle} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.pt')}</span>
                    </div>
                  </div>
                  <input type="range" min={8} max={48} value={settings.fontSize}
                    onChange={(e) => update({ fontSize: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.lineHeight')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.lineHeight')}</div>
                    <div className="settings-hint">{t('settings.lineHeight.hint')}</div>
                  </div>
                  <div className="settings-radio-group">
                    {(['compact', 'normal', 'relaxed'] as const).map((mode) => (
                      <button key={mode} className={`settings-radio-btn ${settings.lineHeight === mode ? 'active' : ''}`}
                        onClick={() => update({ lineHeight: mode })}>{t(`settings.lineHeight.${mode}`)}</button>
                    ))}
                  </div>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.editorWidth')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.editorWidth')}</div>
                    <div className="settings-hint">{t('settings.editorWidth.hint')}</div>
                  </div>
                  <div className="settings-radio-group">
                    {(['narrow', 'medium', 'wide'] as const).map((w) => (
                      <button key={w} className={`settings-radio-btn ${settings.editorWidth === w ? 'active' : ''}`}
                        onClick={() => update({ editorWidth: w })}>{t(`settings.width.${w}`)}</button>
                    ))}
                  </div>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.showMarkers')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.showMarkers')}</div>
                    <div className="settings-hint">{t('settings.showMarkers.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.showMarkers} onChange={(e) => update({ showMarkers: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.autoBracket')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.autoBracket')}</div>
                    <div className="settings-hint">{t('settings.autoBracket.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.autoBracket} onChange={(e) => update({ autoBracket: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </CollapsibleGroup>
            </>
          )}

          {/* 视图 */}
          {activeSection === 'view' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.view')}</h2>
              <CollapsibleGroup title={t('settings.defaultMode')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.defaultMode')}</div>
                    <div className="settings-hint">{t('settings.defaultMode.hint')}</div>
                  </div>
                  <div className="settings-radio-group">
                    {(['live', 'source', 'read'] as EditorMode[]).map((m) => (
                      <button key={m} className={`settings-radio-btn ${settings.editorMode === m ? 'active' : ''}`}
                        onClick={() => update({ editorMode: m })}>{t(`settings.mode.${m}`)}</button>
                    ))}
                  </div>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.showLineNumbers')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.showLineNumbers')}</div>
                    <div className="settings-hint">{t('settings.showLineNumbers.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.showLineNumbers} onChange={(e) => update({ showLineNumbers: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('settings.minimap')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.minimap')}</div>
                    <div className="settings-hint">{t('settings.minimap.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.showMinimap} onChange={(e) => update({ showMinimap: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {settings.showMinimap && (
                  <div className="settings-row">
                    <div className="settings-label-group">
                      <div className="settings-label">{t('settings.minimapSide')}</div>
                      <div className="settings-hint">{t('settings.minimapSide.hint')}</div>
                    </div>
                    <div className="settings-radio-group">
                      {(['left', 'right'] as const).map((side) => (
                        <button key={side} className={`settings-radio-btn ${settings.minimapSide === side ? 'active' : ''}`}
                          onClick={() => update({ minimapSide: side })}>{t(`settings.side.${side}`)}</button>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleGroup>

              <CollapsibleGroup title={t('focusMode.label')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('focusMode.label')}</div>
                    <div className="settings-hint">{t('focusMode.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.focusMode} onChange={(e) => update({ focusMode: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </CollapsibleGroup>
            </>
          )}

          {/* 行为 */}
          {activeSection === 'behavior' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.behavior')}</h2>
              <CollapsibleGroup title={t('settings.autoSave')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.autoSave')}</div>
                    <div className="settings-hint">{t('settings.autoSave.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.autoSave} onChange={(e) => update({ autoSave: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {settings.autoSave && (
                  <div className="settings-row">
                    <div className="settings-label-group">
                      <div className="settings-label">{t('settings.autoSaveInterval')}</div>
                      <div className="settings-hint">{t('settings.autoSaveInterval.hint', { n: settings.autoSaveInterval })}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" min={10} max={3600} value={settings.autoSaveInterval}
                        onChange={(e) => { const v = parseInt(e.target.value) || 300; update({ autoSaveInterval: Math.min(3600, Math.max(10, v)) }) }}
                        style={numInputStyle} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.s')}</span>
                    </div>
                  </div>
                )}
              </CollapsibleGroup>
            </>
          )}

          {/* 语言 */}
          {activeSection === 'language' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.language')}</h2>
              <CollapsibleGroup title={t('settings.group.language')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.group.language')}</div>
                    <div className="settings-hint">{t('settings.language.hint')}</div>
                  </div>
                  <div className="settings-radio-group">
                    {langOptions.map((l) => (
                      <button key={l} className={`settings-radio-btn ${language === l ? 'active' : ''}`}
                        onClick={() => setLanguage(l)}>{LANG_LABELS[l]}</button>
                    ))}
                  </div>
                </div>
              </CollapsibleGroup>
            </>
          )}

          {/* 快捷键 */}
          {activeSection === 'shortcuts' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.shortcuts')}</h2>
              <CollapsibleGroup title={t('settings.group.shortcuts')} defaultOpen={true}>
                {shortcuts.map(([key, descKey]) => (
                  <div className="settings-row" key={key}>
                    <span className="settings-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{key}</span>
                    <span className="settings-hint" style={{ marginTop: 0 }}>{t(descKey)}</span>
                  </div>
                ))}
              </CollapsibleGroup>
            </>
          )}

          {/* 实验性功能 */}
          {activeSection === 'experimental' && (
            <>
              <h2 className="settings-content-title">
                <span>{t('experimental.title')}</span>
                <span className="experimental-badge inline">{t('experimental.badge')}</span>
              </h2>
              <ExperimentalBanner />

              <CollapsibleGroup title={t('experimental.mermaid')} badge={t('experimental.badge')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('experimental.mermaid')}</div>
                    <div className="settings-hint">{t('experimental.mermaid.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={false} readOnly />
                    <span className="toggle-slider" style={{ opacity: 0.5 }} />
                  </label>
                </div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('experimental.vim')} badge={t('experimental.badge')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('experimental.vim')}</div>
                    <div className="settings-hint">{t('experimental.vim.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={false} readOnly />
                    <span className="toggle-slider" style={{ opacity: 0.5 }} />
                  </label>
                </div>
              </CollapsibleGroup>
            </>
          )}

          {/* 关于 */}
          {activeSection === 'about' && (
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
                <div className="about-version">v{appVersion || '0.1.0'} · Tolaria Edition</div>
              </div>

              {/* 检查更新 */}
              <CollapsibleGroup title={t('update.title')} defaultOpen={true}>
                {/* 更新通道 + 自动检查 */}
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                  <div className="settings-row">
                    <div className="settings-label-group">
                      <div className="settings-label">{t('update.channel')}</div>
                      <div className="settings-hint">{settings.updateChannel === 'latest' ? t('update.channel.latest.hint') : t('update.channel.dev.hint')}</div>
                    </div>
                    <div className="settings-radio-group">
                      <button className={`settings-radio-btn ${settings.updateChannel === 'latest' ? 'active' : ''}`}
                        onClick={() => update({ updateChannel: 'latest' })}>{t('update.channel.latest')}</button>
                      <button className={`settings-radio-btn ${settings.updateChannel === 'dev' ? 'active' : ''}`}
                        onClick={() => update({ updateChannel: 'dev' })}>{t('update.channel.dev')}</button>
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
                  <span className="about-meta-val">v{appVersion || '0.1.0'}</span>
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
                    onClick={() => onCheckUpdate?.()}
                    disabled={checkingUpdate}
                  >
                    {checkingUpdate ? t('update.checking') : t('update.checkBtn')}
                  </button>
                </div>

                {/* 下载按钮 */}
                {updateInfo && updateInfo.isNewer && (
                  <div className="update-download-section">
                    <button className="update-download-btn" onClick={() => openExternalUrl(updateInfo.htmlUrl)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {t('update.downloadPage')}
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
              </CollapsibleGroup>

              <CollapsibleGroup title={t('about.intro.title')}>
                <div className="about-desc">{t('about.intro.desc')}</div>
              </CollapsibleGroup>

              <CollapsibleGroup title={t('about.version.title')}>
                <div className="about-meta-row">
                  <span className="about-meta-key">{t('about.version.version')}</span>
                  <span className="about-meta-val">v{appVersion || '0.1.0'}</span>
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
              </CollapsibleGroup>

              <CollapsibleGroup title={t('about.links.title')}>
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
              </CollapsibleGroup>

              <CollapsibleGroup title={t('about.credits.title')}>
                <div className="about-desc" style={{ fontSize: 12, color: 'var(--muted)' }}>{t('about.credits.desc')}</div>
              </CollapsibleGroup>
            </>
          )}
          </>
          )}
        </main>
      </div>
    </div>
  )
}

const numInputStyle: CSSProperties = {
  width: '56px', padding: '4px 6px', textAlign: 'center',
  border: '1px solid var(--border)', borderRadius: '4px',
  background: 'var(--surface)', color: 'var(--fg)',
  fontSize: '13px', fontFamily: 'var(--font-mono)',
}
