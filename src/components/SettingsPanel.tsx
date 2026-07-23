import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppSettings, EditorMode } from '../types'
import { getAvailableFonts, type FontGroupKey, type FontOption } from '../utils/fonts'
import { useI18n } from '../i18n'
import { LANG_LABELS, type Lang } from '../i18n/locales'
import { getBuildChannel, type UpdateInfo, type UpdateChannel } from '../utils/updater'
import type { Updater } from '../hooks/useUpdater'
import { COMMANDS, formatCombo, resolveKeymap, comboFromEvent, DEFAULT_KEYMAP } from '../utils/keymap'
import { getMarkdownEngine, setMarkdownEngine, type MarkdownEngine } from '../utils/markdown/engine'
import { Select } from './Select'
import { FlatGroup } from './settings/FlatGroup'
import { SettingsAppearanceSection } from './settings/SettingsAppearanceSection'
import { SettingsEditorSection } from './settings/SettingsEditorSection'
import { SettingsAboutSection } from './settings/SettingsAboutSection'
import { SettingsAiSection } from './settings/SettingsAiSection'
// ── 导航项定义 ──
type SettingsSection =
  | 'appearance'
  | 'editor'
  | 'view'
  | 'behavior'
  | 'language'
  | 'shortcuts'
  | 'ai'
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
  onCheckUpdate?: (channel: UpdateChannel) => void
  /** 应用内更新下载/安装状态机 */
  updater?: Updater
  /** 是否有可回滚的旧版本 */
  rollbackAvailable?: boolean
  /** 打开开发者工具（F12） */
  onOpenDevtools?: () => void
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
    id: 'ai',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.8L18 9.4l-4.4 1.6L12 16l-1.6-5L6 9.4l4.4-1.6L12 3z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"/><path d="M5 15l.7 1.8L7.5 17.5l-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z"/></svg>',
    labelKey: 'settings.nav.ai',
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

export function SettingsPanel({ open, onClose, settings, onSettingsChange, initialSection, appVersion, updateInfo, checkingUpdate, onCheckUpdate, updater, rollbackAvailable, onOpenDevtools }: SettingsPanelProps) {
  const { t, language, setLanguage } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('')
  // 快捷键捕获状态：正在等待用户按键的命令 id
  const [capturingId, setCapturingId] = useState<string | null>(null)

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

  // ── 更新通道：不持久化到设置配置 ──
  // 每次打开"关于"页时自动检测本机当前的构建类型（dev/stable/release），
  // 并选中与之对应的更新通道选项，而非读取已保存的用户选择。
  const [detectedChannel, setDetectedChannel] = useState<UpdateChannel>(getBuildChannel())
  useEffect(() => {
    if (activeSection === 'about') {
      setDetectedChannel(getBuildChannel())
      // 打开关于页时查询是否有可续传的历史下载
      if (updateInfo && updateInfo.isNewer && updater) {
        updater.checkResumable(updateInfo)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, updateInfo])

  // ── 构建设置搜索索引 ──
  const settingsIndex = useMemo<SearchableSetting[]>(() => {
    const idx: SearchableSetting[] = []
    const sec = (s: SettingsSection) => t(`settings.nav.${s}`)

    // 外观
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.theme'), title: t('settings.theme'), desc: t('settings.theme.hint'), keywords: ['theme', 'light', 'dark', 'system', '主题', '明亮', '黑暗'] })
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.toolbar'), title: t('settings.toolbarFloating'), desc: t('settings.toolbarFloating.hint'), keywords: ['toolbar', 'floating', '工具栏', '悬浮'] })
    idx.push({ section: 'appearance', sectionLabel: sec('appearance'), group: t('settings.toolbar'), title: t('settings.toolbarPosition'), desc: t('settings.toolbarPosition.hint'), keywords: ['toolbar', 'position', 'top', 'left', 'bottom', 'right', '工具栏', '位置', '上', '左', '下', '右'] })
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
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('settings.markdownFontFamily'), title: t('settings.markdownFontFamily'), desc: t('settings.markdownFontFamily.hint'), keywords: ['markdown', 'font', 'family', '字体', '阅读'] })
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('settings.markdownFontSize'), title: t('settings.markdownFontSize'), desc: t('settings.markdownFontSize.hint'), keywords: ['markdown', 'font', 'size', '字号', '阅读'] })
    idx.push({ section: 'view', sectionLabel: sec('view'), group: t('focusMode.label'), title: t('focusMode.label'), desc: t('focusMode.hint'), keywords: ['focus', '专注', '模式'] })

    // 行为
    idx.push({ section: 'behavior', sectionLabel: sec('behavior'), group: t('settings.autoSave'), title: t('settings.autoSave'), desc: t('settings.autoSave.hint'), keywords: ['auto', 'save', '自动保存'] })
    idx.push({ section: 'behavior', sectionLabel: sec('behavior'), group: t('settings.autoSave'), title: t('settings.autoSaveInterval'), desc: t('settings.autoSaveInterval.hint', { n: settings.autoSaveInterval }), keywords: ['auto', 'save', 'interval', '间隔', '时间'] })
    idx.push({ section: 'behavior', sectionLabel: sec('behavior'), group: t('window.closeAction.title'), title: t('window.closeAction.label'), desc: t('window.closeAction.hint'), keywords: ['close', '关闭', 'minimize', '最小化', '窗口'] })

    // 语言
    idx.push({ section: 'language', sectionLabel: sec('language'), group: t('settings.group.language'), title: t('settings.group.language'), desc: t('settings.language.hint'), keywords: ['language', '语言', '中文', 'english'] })

    // 快捷键
    idx.push({ section: 'shortcuts', sectionLabel: sec('shortcuts'), group: t('settings.group.shortcuts'), title: t('settings.group.shortcuts'), desc: t('shortcut.newFile') + ', ' + t('shortcut.save') + ', ...', keywords: ['shortcut', 'keybinding', '快捷键', 'hotkey'] })

    idx.push({ section: 'ai', sectionLabel: sec('ai'), group: t('settings.group.ai'), title: t('ai.settings.enable'), desc: t('ai.settings.enable.hint'), keywords: ['ai', 'assistant', 'continue', 'summarize', 'polish', 'translate', 'local', 'api'] })
    idx.push({ section: 'ai', sectionLabel: sec('ai'), group: t('settings.group.ai'), title: t('ai.settings.endpoint'), desc: t('ai.settings.endpoint.hint'), keywords: ['openai', 'api', 'ollama', 'lm studio', 'endpoint', 'model'] })

    // 实验性
    idx.push({ section: 'experimental', sectionLabel: sec('experimental'), group: t('experimental.mermaid'), title: t('experimental.mermaid'), desc: t('experimental.mermaid.hint'), keywords: ['mermaid', 'diagram', '图表'] })
    idx.push({ section: 'experimental', sectionLabel: sec('experimental'), group: t('experimental.vim'), title: t('experimental.vim'), desc: t('experimental.vim.hint'), keywords: ['vim', 'editor', 'mode'] })

    // 关于
    idx.push({ section: 'about', sectionLabel: sec('about'), group: t('update.title'), title: t('update.title'), desc: t('update.channel'), keywords: ['update', 'version', '检查', '更新', '版本'] })
    idx.push({ section: 'about', sectionLabel: sec('about'), group: t('about.version.title'), title: t('about.version.title'), desc: t('about.version.version'), keywords: ['version', 'build', 'license', '版本', '构建', '许可'] })
    idx.push({ section: 'about', sectionLabel: sec('about'), group: t('about.devtools.title'), title: t('about.devtools.label'), desc: t('about.devtools.hint'), keywords: ['devtools', 'debug', 'f12', '开发者', '调试'] })
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

  const langOptions: Lang[] = ['zh-CN', 'en']

  // 当前生效的快捷键映射（合并默认值）
  const keymap = resolveKeymap(settings.keymap)

  // ── 快捷键捕获：监听下一次按键并写入 keymap ──
  useEffect(() => {
    if (!capturingId) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturingId(null)
        return
      }
      const combo = comboFromEvent(e)
      const next = { ...keymap, [capturingId]: combo }
      update({ keymap: next })
      setCapturingId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturingId, keymap, update])


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

  // ── Markdown 引擎选择 ──
  function MarkdownEngineSetting() {
    const [engine, setEngine] = useState<MarkdownEngine>(getMarkdownEngine)

    const handleChange = (next: MarkdownEngine) => {
      setEngine(next)
      setMarkdownEngine(next)
    }

    return (
      <FlatGroup title={t('experimental.mdEngine')} badge={t('experimental.badge')}>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div className="settings-label-group">
            <div className="settings-label">{t('experimental.mdEngine')}</div>
            <div className="settings-hint">{t('experimental.mdEngine.hint')}</div>
          </div>
          <Select
            className="settings-select"
            value={engine}
            onChange={(v) => handleChange(v as MarkdownEngine)}
          >
            <Select.Option value="third">{t('experimental.mdEngine.third')}</Select.Option>
            <Select.Option value="builtin">{t('experimental.mdEngine.builtin')}</Select.Option>
          </Select>
        </div>
      </FlatGroup>
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
          {/* ?? */}
          {activeSection === 'appearance' && (
            <SettingsAppearanceSection t={t} settings={settings} update={update} numInputStyle={numInputStyle} />
          )}

          {/* 编辑器 */}
          {/* ??? */}
          {activeSection === 'editor' && (
            <SettingsEditorSection
              t={t}
              settings={settings}
              update={update}
              currentFontKnown={currentFontKnown}
              fontGroups={fontGroups}
              fonts={fonts}
              groupLabels={GROUP_LABELS}
              numInputStyle={numInputStyle}
            />
          )}

          {/* 视图 */}
          {activeSection === 'view' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.view')}</h2>
              <FlatGroup title={t('settings.defaultMode')}>
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
              </FlatGroup>

              <FlatGroup title={t('settings.showLineNumbers')}>
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
              </FlatGroup>

              <FlatGroup title={t('settings.minimap')}>
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
              </FlatGroup>

              <FlatGroup title={t('focusMode.label')}>
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
              </FlatGroup>

              {/* Markdown 视图字体（仅影响阅读模式渲染，与编辑器字体相互独立） */}
              <FlatGroup title={t('settings.markdownFontFamily')}>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div className="settings-label-group">
                    <div className="settings-label">{t('settings.markdownFontFamily')}</div>
                    <div className="settings-hint">{t('settings.markdownFontFamily.hint')}</div>
                  </div>
                  <Select
                    className="settings-select"
                    value={settings.markdownFontFamily}
                    onChange={(v) => update({ markdownFontFamily: v })}
                  >
                    <Select.Option value="inherit">{t('settings.markdownFontFamily.inherit')}</Select.Option>
                    {(['default', 'cjk', 'latin', 'mono'] as FontGroupKey[]).map((g) => {
                      const items = fontGroups[g]
                      if (!items || items.length === 0) return null
                      return (
                        <Select.Group key={g} label={GROUP_LABELS[g]}>
                          {items.map((f) => (
                            <Select.Option key={f.value} value={f.value}>
                              <span style={{ fontFamily: `"${f.value}"` }}>{f.value}</span>
                            </Select.Option>
                          ))}
                        </Select.Group>
                      )
                    })}
                  </Select>
                </div>
              </FlatGroup>

              <FlatGroup title={t('settings.markdownFontSize')}>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="settings-label-group">
                      <div className="settings-label">{t('settings.markdownFontSize')}</div>
                      <div className="settings-hint">{t('settings.markdownFontSize.hint')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" min={0} max={48} value={settings.markdownFontSize}
                        onChange={(e) => { const v = parseInt(e.target.value) || 0; update({ markdownFontSize: Math.min(48, Math.max(0, v)) }) }}
                        style={numInputStyle} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.pt')}</span>
                    </div>
                  </div>
                  <input type="range" min={0} max={48} value={settings.markdownFontSize}
                    onChange={(e) => update({ markdownFontSize: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  <div className="settings-hint" style={{ fontSize: 11 }}>
                    {settings.markdownFontSize === 0
                      ? t('settings.markdownFontSize.inherit')
                      : t('settings.markdownFontSize.custom', { n: settings.markdownFontSize })}
                  </div>
                </div>
              </FlatGroup>
            </>
          )}

          {/* 行为 */}
          {activeSection === 'behavior' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.behavior')}</h2>
              <FlatGroup title={t('settings.autoSave')}>
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
              </FlatGroup>

              {/* 关闭窗口行为 */}
              <FlatGroup title={t('window.closeAction.title')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('window.closeAction.label')}</div>
                    <div className="settings-hint">{t('window.closeAction.hint')}</div>
                  </div>
                  <div className="settings-radio-group" style={{ flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
                    {([
                      { value: 'ask' as const, label: t('window.closeAction.ask') },
                      { value: 'minimize' as const, label: t('window.closeAction.minimize') },
                      { value: 'close' as const, label: t('window.closeAction.close') },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        className={`settings-radio-btn ${settings.closeAction === opt.value ? 'active' : ''}`}
                        onClick={() => update({
                          closeAction: opt.value,
                          ...(opt.value !== 'ask' ? { skipClosePrompt: false } : {}),
                        })}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
                {settings.skipClosePrompt && (
                  <div className="settings-row" style={{ alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--muted)' }}>
                    <span>✓</span>
                    <span>{t('window.closeAction.skipPromptActive')}</span>
                    <button
                      style={{ marginLeft: 'auto', padding: '2px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
                      onClick={() => update({ skipClosePrompt: false })}
                    >{t('window.closeAction.resetPrompt')}</button>
                  </div>
                )}
              </FlatGroup>
            </>
          )}

          {/* 语言 */}
          {activeSection === 'language' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.language')}</h2>
              <FlatGroup title={t('settings.group.language')}>
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
              </FlatGroup>
            </>
          )}

          {/* 快捷键 */}
          {activeSection === 'shortcuts' && (
            <>
              <h2 className="settings-content-title">{t('settings.group.shortcuts')}</h2>
              <div className="settings-hint" style={{ marginBottom: 12 }}>{t('shortcuts.hint')}</div>
              <div className="shortcut-reset-all">
                <button className="settings-btn ghost" onClick={() => update({ keymap: { ...DEFAULT_KEYMAP } })}>
                  {t('shortcuts.resetAll')}
                </button>
              </div>
              <div className="shortcut-list">
                {COMMANDS.map((c) => {
                  const combo = keymap[c.id] || c.defaultKey
                  const capturing = capturingId === c.id
                  return (
                    <div className="shortcut-row" key={c.id}>
                      <span className="shortcut-label">{t(c.labelKey)}</span>
                      <span className={`shortcut-scope scope-${c.scope}`}>
                        {c.scope === 'editor' ? t('shortcuts.scopeEditor') : t('shortcuts.scopeApp')}
                      </span>
                      <button
                        className={`shortcut-key ${capturing ? 'capturing' : ''}`}
                        onClick={() => setCapturingId(capturing ? null : c.id)}
                      >
                        {capturing ? t('shortcuts.pressKey') : formatCombo(combo)}
                      </button>
                      {combo !== c.defaultKey && (
                        <button
                          className="shortcut-reset"
                          title={t('shortcuts.reset')}
                          onClick={() => update({ keymap: { ...keymap, [c.id]: c.defaultKey } })}
                        >
                          {t('shortcuts.reset')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* 实验性功能 */}
          {activeSection === 'ai' && (
            <SettingsAiSection t={t} settings={settings} update={update} numInputStyle={numInputStyle} />
          )}

          {activeSection === 'experimental' && (
            <>
              <h2 className="settings-content-title">
                <span>{t('experimental.title')}</span>
                <span className="experimental-badge inline">{t('experimental.badge')}</span>
              </h2>
              <ExperimentalBanner />

              <FlatGroup title={t('experimental.mermaid')} badge={t('experimental.badge')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('experimental.mermaid')}</div>
                    <div className="settings-hint">{t('experimental.mermaid.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.mermaid} onChange={(e) => update({ mermaid: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </FlatGroup>

              <FlatGroup title={t('experimental.vim')} badge={t('experimental.badge')}>
                <div className="settings-row">
                  <div className="settings-label-group">
                    <div className="settings-label">{t('experimental.vim')}</div>
                    <div className="settings-hint">{t('experimental.vim.hint')}</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={settings.vim} onChange={(e) => update({ vim: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </FlatGroup>

              <MarkdownEngineSetting />
            </>
          )}

          {/* 关于 */}
          {/* ?? */}
          {activeSection === 'about' && (
            <SettingsAboutSection
              t={t}
              settings={settings}
              update={update}
              language={language}
              appVersion={appVersion}
              updateInfo={updateInfo}
              checkingUpdate={checkingUpdate}
              detectedChannel={detectedChannel}
              setDetectedChannel={setDetectedChannel}
              onCheckUpdate={onCheckUpdate}
              updater={updater}
              rollbackAvailable={rollbackAvailable}
              onOpenDevtools={onOpenDevtools}
            />
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
