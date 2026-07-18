import { useState, useRef, useEffect } from 'react'
import { useTauriWindow } from '../hooks/useTauriWindow'
import { useI18n } from '../i18n'
import type { EditorMode } from '../types'
import { GITHUB_URLS, openExternalUrl } from '../utils/updater'

interface TopBarProps {
  currentFile: string | null
  isModified: boolean
  theme: 'light' | 'dark' | 'system'
  editorMode: EditorMode
  onToggleTheme: () => void
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void
  onOpenSettings: (section?: string) => void
  onExport: () => void
  onSave: () => void
  onEditorModeChange: (mode: EditorMode) => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  hasUpdate?: boolean
  /** 关闭窗口按钮点击回调（由 App 决定是直接关闭还是弹提示） */
  onCloseAction?: () => void
}

export function TopBar({
  currentFile,
  isModified,
  theme,
  editorMode,
  onToggleTheme,
  onThemeChange,
  onOpenSettings,
  onExport,
  onSave,
  onEditorModeChange,
  sidebarCollapsed = false,
  onToggleSidebar,
  hasUpdate = false,
  onCloseAction,
}: TopBarProps) {
  const { minimize, toggleMaximize, close, startDragging } = useTauriWindow()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const fileName = currentFile ? currentFile.split(/[\\/]/).pop() : null

  // 头部拖拽移动窗口：仅在非交互元素上触发
  function handleHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, a, [contenteditable], .app-menu-dropdown, .app-menu')) return
    startDragging()
  }

  // 视图模式切换的图标和标签
  const viewModes: { key: EditorMode; icon: JSX.Element; label: string }[] = [
    {
      key: 'live',
      icon: <svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>,
      label: t('status.mode.live'),
    },
    {
      key: 'read',
      icon: <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
      label: t('status.mode.read'),
    },
    {
      key: 'source',
      icon: <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
      label: t('status.mode.source'),
    },
  ]

  return (
    <header className="titlebar" onMouseDown={handleHeaderMouseDown} data-tauri-drag-region>
      {/* 左侧：Logo + 品牌 + 侧边栏切换 */}
      <div className="titlebar-left">
        {/* Logo */}
        <svg className="titlebar-logo" viewBox="0 0 32 32" width="20" height="20">
          <rect x="4" y="6" width="24" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/>
          <line x1="8" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="8" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="8" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="26" cy="8" r="4" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5"/>
        </svg>

        <span className="titlebar-brand">Fke<span>Mark</span></span>

        {/* 侧边栏折叠/展开按钮 */}
        {onToggleSidebar && (
          <button
            className={`sidebar-toggle ${sidebarCollapsed ? 'collapsed' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleSidebar() }}
            title={sidebarCollapsed ? t('topbar.expandSidebar') : t('topbar.collapseSidebar')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed ? (
                /* 展开图标：面板向左滑出（竖线在左） */
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                </>
              ) : (
                /* 收起图标：面板隐藏到左侧（竖线在右） */
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="15" y1="3" x2="15" y2="21"/>
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      {/* 中间：文件名（也是拖拽区域）*/}
      <div className="titlebar-center">
        {fileName && <span className="filename">{fileName}</span>}
        <span className={`unsaved-dot ${isModified ? 'active' : ''}`}></span>
      </div>

      {/* 右侧：菜单 + 视图模式 + 窗口控制 */}
      <div className="titlebar-right">
        {/* App Menu（下拉箭头菜单：保存 / 导出 / 视图切换 / 主题 / 关于）— 位于右上角，窗口控制前面 */}
        <div className="app-menu" ref={menuRef}>
          <button
            className="app-menu-btn"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            title={t('topbar.menu')}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Dropdown — 核心操作菜单 */}
          <div className={`app-menu-dropdown ${menuOpen ? 'open' : ''}`}>
            {/* ① 保存 💾 */}
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onSave() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              </span>
              <span className="menu-label">{t('topbar.save')}</span>
              <span className="menu-shortcut">Ctrl+S</span>
            </button>

            {/* ② 导出/下载 ⬇️ */}
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onExport() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </span>
              <span className="menu-label">{t('export.title')}</span>
              <span className="menu-shortcut">⬇</span>
            </button>

            <div className="app-menu-divider"></div>

            {/* ③ 视图模式切换（Live / Read / Source）— 替代原来的主题切换 */}
            <div className="app-menu-view-modes">
              <span className="app-menu-view-label">{t('status.viewMode')}</span>
              <div className="app-menu-view-buttons">
                {viewModes.map((mode) => (
                  <button
                    key={mode.key}
                    className={`app-menu-view-btn ${editorMode === mode.key ? 'active' : ''}`}
                    onClick={() => { setMenuOpen(false); onEditorModeChange(mode.key) }}
                    title={mode.label}
                  >
                    <span className="menu-icon">{mode.icon}</span>
                    <span className="menu-label">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="app-menu-divider"></div>

            {/* ④ 主题切换（明亮 / 黑暗 / 系统）— 三态按钮组 */}
            <div className="app-menu-theme-modes">
              <span className="app-menu-view-label">{t('topbar.theme')}</span>
              <div className="app-menu-view-buttons">
                {/* 明亮 ☀️ */}
                <button
                  className={`app-menu-view-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => { setMenuOpen(false); onThemeChange ? onThemeChange('light') : onToggleTheme() }}
                  title={t('settings.theme.light')}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5"/>
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                    </svg>
                  </span>
                  <span className="menu-label">{t('settings.theme.light')}</span>
                </button>
                {/* 黑暗 🌙 */}
                <button
                  className={`app-menu-view-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => { setMenuOpen(false); onThemeChange ? onThemeChange('dark') : onToggleTheme() }}
                  title={t('settings.theme.dark')}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  </span>
                  <span className="menu-label">{t('settings.theme.dark')}</span>
                </button>
                {/* 系统 🖥️ */}
                <button
                  className={`app-menu-view-btn ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => { setMenuOpen(false); onThemeChange ? onThemeChange('system') : onToggleTheme() }}
                  title={t('settings.theme.system')}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                  </span>
                  <span className="menu-label">{t('settings.theme.system')}</span>
                </button>
              </div>
            </div>

            <div className="app-menu-divider"></div>

            {/* ⑥ GitHub 链接区 */}
            <div className="app-menu-view-modes">
              <span className="app-menu-view-label">GitHub</span>
              <div className="app-menu-view-buttons">
                {/* 仓库 */}
                <button
                  className="app-menu-view-btn"
                  onClick={() => { setMenuOpen(false); openExternalUrl(GITHUB_URLS.repo) }}
                  title={t('github.repo')}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.7.1 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
                  </span>
                  <span className="menu-label">{t('github.repo')}</span>
                </button>
                {/* 问题反馈 */}
                <button
                  className="app-menu-view-btn"
                  onClick={() => { setMenuOpen(false); openExternalUrl(GITHUB_URLS.newIssue) }}
                  title={t('github.newIssue')}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </span>
                  <span className="menu-label">{t('github.issues')}</span>
                </button>
                {/* 发布记录 */}
                <button
                  className="app-menu-view-btn"
                  onClick={() => { setMenuOpen(false); openExternalUrl(GITHUB_URLS.releases) }}
                  title={t('github.releases')}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </span>
                  <span className="menu-label">{t('github.releases')}</span>
                </button>
              </div>
            </div>

            <div className="app-menu-divider"></div>

            {/* ⑦ 关于 — 打开设置页并导航到关于项 */}
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onOpenSettings('about') }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </span>
              <span className="menu-label">{t('topbar.about')}</span>
              {hasUpdate && <span className="menu-update-badge" />}
            </button>
          </div>
        </div>

        {/* 窗口控制按钮（最小化 / 最大化 / 关闭）*/}
        <div className="win-ctrls">
          <button
            className="win-btn min"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); minimize() }}
            title={t('topbar.minimize')}
          >
            <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button
            className="win-btn max"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); toggleMaximize() }}
            title={t('topbar.maximize')}
          >
            <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
          </button>
          <button
            className="win-btn close"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCloseAction ? onCloseAction() : close() }}
            title={t('topbar.close')}
          >
            <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
          </button>
        </div>
      </div>
    </header>
  )
}
