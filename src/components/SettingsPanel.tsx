import { useEffect } from 'react'
import type { AppSettings, EditorMode } from '../types'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  isDark: boolean
}

export function SettingsPanel({ open, onClose, settings, onSettingsChange, isDark }: SettingsPanelProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const update = (patch: Partial<AppSettings>) => {
    onSettingsChange({ ...settings, ...patch })
  }

  return (
    <>
      <div className={`settings-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`settings-panel ${open ? 'open' : ''}`}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="settings-body">
          {/* Logo */}
          <div className="settings-logo">
            <svg viewBox="0 0 32 32" width="36" height="36" style={{ color: 'var(--accent)' }}>
              <rect x="4" y="6" width="24" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/>
              <line x1="8" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="26" cy="8" r="4" fill="currentColor" stroke="var(--surface)" strokeWidth="1.5"/>
            </svg>
            <div>
              <div className="settings-logo-text">Fke<span>Mark</span></div>
              <div className="settings-version">v0.1.0 · Tolaria Edition</div>
            </div>
          </div>

          {/* ══════ 外观 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">外观</div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">深色主题</div>
                <div className="settings-hint">使用暗色配色方案</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={isDark} onChange={(e) => update({ theme: e.target.checked ? 'dark' : 'light' })} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">迷你侧栏</div>
                <div className="settings-hint">折叠时仅显示图标</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.miniSidebar} onChange={(e) => update({ miniSidebar: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* ══════ 编辑器 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">编辑器</div>

            {/* 字体大小：输入框 + 滑块 */}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="settings-label-group">
                  <div className="settings-label">字体大小</div>
                  <div className="settings-hint">编辑区正文字号（8-48pt）</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min={8}
                    max={48}
                    value={settings.fontSize}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 16
                      update({ fontSize: Math.min(48, Math.max(8, v)) })
                    }}
                    style={{
                      width: '56px', padding: '4px 6px', textAlign: 'center',
                      border: '1px solid var(--border)', borderRadius: '4px',
                      background: 'var(--surface)', color: 'var(--fg)',
                      fontSize: '13px', fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>pt</span>
                </div>
              </div>
              <input
                type="range"
                min={8}
                max={48}
                value={settings.fontSize}
                onChange={(e) => update({ fontSize: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">行高</div>
                <div className="settings-hint">正文行间距</div>
              </div>
              <div className="settings-radio-group">
                {(['compact', 'normal', 'relaxed'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`settings-radio-btn ${settings.lineHeight === mode ? 'active' : ''}`}
                    onClick={() => update({ lineHeight: mode })}
                  >
                    {mode === 'compact' ? '紧凑' : mode === 'normal' ? '标准' : '宽松'}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">编辑区宽度</div>
                <div className="settings-hint">内容区域最大宽度</div>
              </div>
              <div className="settings-radio-group">
                {(['narrow', 'medium', 'wide'] as const).map((w) => (
                  <button
                    key={w}
                    className={`settings-radio-btn ${settings.editorWidth === w ? 'active' : ''}`}
                    onClick={() => update({ editorWidth: w })}
                  >
                    {w === 'narrow' ? '窄' : w === 'medium' ? '标准' : '宽'}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">显示 Markdown 标记</div>
                <div className="settings-hint">聚焦时显示行内语法标记</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.showMarkers} onChange={(e) => update({ showMarkers: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">自动补全括号</div>
                <div className="settings-hint">{'输入 ( [ { 时自动配对'}</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.autoBracket} onChange={(e) => update({ autoBracket: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* ══════ 视图 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">视图</div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">默认视图模式</div>
                <div className="settings-hint">启动时使用的编辑器模式</div>
              </div>
              <div className="settings-radio-group">
                {(['live', 'source', 'read'] as EditorMode[]).map((m) => (
                  <button
                    key={m}
                    className={`settings-radio-btn ${settings.editorMode === m ? 'active' : ''}`}
                    onClick={() => update({ editorMode: m })}
                  >
                    {m === 'live' ? '实时' : m === 'source' ? '源码' : '阅读'}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">显示行号</div>
                <div className="settings-hint">编辑器左侧显示行号</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.showLineNumbers} onChange={(e) => update({ showLineNumbers: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">小地图</div>
                <div className="settings-hint">显示文档缩略图</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.showMinimap} onChange={(e) => update({ showMinimap: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>

            {settings.showMinimap && (
              <div className="settings-row">
                <div className="settings-label-group">
                  <div className="settings-label">小地图位置</div>
                  <div className="settings-hint">选择小地图显示在编辑器的左侧或右侧</div>
                </div>
                <div className="settings-radio-group">
                  {(['left', 'right'] as const).map((side) => (
                    <button
                      key={side}
                      className={`settings-radio-btn ${settings.minimapSide === side ? 'active' : ''}`}
                      onClick={() => update({ minimapSide: side })}
                    >
                      {side === 'left' ? '左' : '右'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ══════ 行为 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">行为</div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">自动保存</div>
                <div className="settings-hint">编辑时自动保存到本地</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={settings.autoSave} onChange={(e) => update({ autoSave: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </div>

            {settings.autoSave && (
              <div className="settings-row">
                <div className="settings-label-group">
                  <div className="settings-label">自动保存间隔</div>
                  <div className="settings-hint">秒（{settings.autoSaveInterval}s 后触发）</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min={10}
                    max={3600}
                    value={settings.autoSaveInterval}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 300
                      update({ autoSaveInterval: Math.min(3600, Math.max(10, v)) })
                    }}
                    style={{
                      width: '64px', padding: '4px 6px', textAlign: 'center',
                      border: '1px solid var(--border)', borderRadius: '4px',
                      background: 'var(--surface)', color: 'var(--fg)',
                      fontSize: '13px', fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>s</span>
                </div>
              </div>
            )}
          </div>

          {/* ══════ 快捷键 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">快捷键</div>
            {[
              ['Ctrl+N', '新建文档'],
              ['Ctrl+S', '保存文档'],
              ['Ctrl+O', '打开文件夹'],
              ['Ctrl+Shift+F', '切换视图模式'],
              ['ESC', '退出阅读模式'],
              ['Ctrl+1~6', '标题 H1-H6'],
              ['Ctrl+0', '恢复正文'],
              ['Ctrl+B / I', '粗体 / 斜体'],
              ['Alt+S', '删除线'],
              ['Ctrl+Shift+Q', '引用块'],
              ['Ctrl+K', '插入链接'],
              ['/', '斜杠命令菜单'],
            ].map(([key, desc]) => (
              <div className="settings-row" key={key}>
                <span className="settings-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{key}</span>
                <span className="settings-hint" style={{ marginTop: 0 }}>{desc}</span>
              </div>
            ))}
          </div>

          {/* ══════ 关于 ══════ */}
          <div className="settings-about">
            <div className="settings-group-title">关于</div>
            <div className="settings-about-meta">
              <b>FkeMark</b> — 一款无数据库、文件系统优先的<br />极简 Markdown 即时渲染编辑器。
            </div>
            <div className="settings-about-meta" style={{ marginTop: 10 }}>
              <b>版本</b> v0.1.0 Tolaria<br />
              <b>构建</b> 2025.07.15 release<br />
              <b>许可</b> MIT License<br />
              <b>引擎</b> Tauri + React + ProseMirror
            </div>
            <div className="settings-about-links">
              <span className="settings-about-link">官网</span>
              <span className="settings-about-link">GitHub</span>
              <span className="settings-about-link">反馈</span>
              <span className="settings-about-link">许可证</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
