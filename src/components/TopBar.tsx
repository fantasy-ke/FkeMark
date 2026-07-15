import { useState, useRef, useEffect } from 'react'
import { useTauriWindow } from '../hooks/useTauriWindow'

interface TopBarProps {
  currentFile: string | null
  isModified: boolean
  isDark: boolean
  onToggleSidebar: () => void
  onToggleTheme: () => void
  onNewFile: () => void
  onOpenFolder: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onCycleMode: () => void
  sidebarCollapsed: boolean
}

export function TopBar({
  currentFile,
  isModified,
  isDark,
  onToggleSidebar,
  onToggleTheme,
  onNewFile,
  onOpenFolder,
  onOpenSettings,
  onOpenAbout,
  onCycleMode,
  sidebarCollapsed,
}: TopBarProps) {
  const { minimize, toggleMaximize, close, startDragging } = useTauriWindow()
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

  return (
    <header className="titlebar" onMouseDown={handleHeaderMouseDown} data-tauri-drag-region>
      {/* 左侧 */}
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

        {/* App Menu（已移除「设置」项，设置入口在左下角齿轮）*/}
        <div className="app-menu" ref={menuRef}>
          <button
            className="app-menu-btn"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            title="菜单"
          >
            <svg viewBox="0 0 24 24">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>

          {/* Dropdown */}
          <div className={`app-menu-dropdown ${menuOpen ? 'open' : ''}`}>
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onCycleMode() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 5V3M16 5V3M8 19v2M16 19v2M5 8H3M21 8h-2M5 16H3M21 16h-2"/></svg>
              </span>
              <span className="menu-label">切换视图</span>
              <span className="menu-shortcut">Ctrl+Shift+F</span>
            </button>
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onToggleTheme() }}>
              <span className="menu-icon">
                {isDark ? (
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </span>
              <span className="menu-label">切换主题</span>
            </button>
            <div className="app-menu-divider"></div>
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onNewFile() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </span>
              <span className="menu-label">新建文件</span>
              <span className="menu-shortcut">Ctrl+N</span>
            </button>
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onOpenFolder() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </span>
              <span className="menu-label">打开文件夹</span>
              <span className="menu-shortcut">Ctrl+O</span>
            </button>
            <div className="app-menu-divider"></div>
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onOpenAbout() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </span>
              <span className="menu-label">关于 FkeMark</span>
            </button>
            <button className="app-menu-item" onClick={() => { setMenuOpen(false); onOpenSettings() }}>
              <span className="menu-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </span>
              <span className="menu-label">设置</span>
            </button>
          </div>
        </div>

        {/* Sidebar Toggle */}
        <button
          className={`sidebar-toggle ${sidebarCollapsed ? 'collapsed' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSidebar() }}
          title="切换侧栏"
        >
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
      </div>

      {/* 中间：文件名（也是拖拽区域）*/}
      <div className="titlebar-center">
        {fileName && <span className="filename">{fileName}</span>}
        <span className={`unsaved-dot ${isModified ? 'active' : ''}`}></span>
      </div>

      {/* 右侧：窗口控制 */}
      <div className="titlebar-right">
        <div className="win-ctrls">
          <button
            className="win-btn min"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); minimize() }}
            title="最小化"
          >
            <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button
            className="win-btn max"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); toggleMaximize() }}
            title="最大化"
          >
            <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
          </button>
          <button
            className="win-btn close"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); close() }}
            title="关闭"
          >
            <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
          </button>
        </div>
      </div>
    </header>
  )
}
