import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppSettings, EditorMode } from '../types'
import { getAvailableFonts, type FontGroupKey, type FontOption } from '../utils/fonts'
import { useI18n } from '../i18n'
import { LANG_LABELS, type Lang } from '../i18n/locales'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
}

export function SettingsPanel({ open, onClose, settings, onSettingsChange }: SettingsPanelProps) {
  const { t, language, setLanguage } = useI18n()
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const update = (patch: Partial<AppSettings>) => {
    onSettingsChange({ ...settings, ...patch })
  }

  // 字体：动态读取本机已安装字体，按组聚合
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

  // 若当前字体不在列表（如旧设置中的自定义值），临时追加保证可选
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

  return (
    <>
      <div className={`settings-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`settings-panel ${open ? 'open' : ''}`}>
        <div className="settings-header">
          <h2>{t('settings.title')}</h2>
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
            <div className="settings-group-title">{t('settings.group.appearance')}</div>

            {/* 主题切换：三态图标式 */}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.theme')}</div>
                <div className="settings-hint">{t('settings.theme.hint')}</div>
              </div>
              <div className="theme-toggle-group">
                <button
                  className={`theme-toggle-btn ${settings.theme === 'light' ? 'active' : ''}`}
                  title={t('settings.theme.light')}
                  onClick={() => update({ theme: 'light' })}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  <span>{t('settings.theme.light')}</span>
                </button>
                <button
                  className={`theme-toggle-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                  title={t('settings.theme.dark')}
                  onClick={() => update({ theme: 'dark' })}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>{t('settings.theme.dark')}</span>
                </button>
                <button
                  className={`theme-toggle-btn ${settings.theme === 'system' ? 'active' : ''}`}
                  title={t('settings.theme.system')}
                  onClick={() => update({ theme: 'system' })}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2"/></svg>
                  <span>{t('settings.theme.system')}</span>
                </button>
              </div>
            </div>

            {/* 工具栏悬浮 */}
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

            {/* 整体布局圆角 */}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="settings-label-group">
                  <div className="settings-label">{t('settings.cornerRadius')}</div>
                  <div className="settings-hint">{t('settings.cornerRadius.hint')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min={0}
                    max={16}
                    value={settings.cornerRadius}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 6
                      update({ cornerRadius: Math.min(16, Math.max(0, v)) })
                    }}
                    style={numInputStyle}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.px')}</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={16}
                value={settings.cornerRadius}
                onChange={(e) => update({ cornerRadius: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>

            {/* 按钮圆角 */}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="settings-label-group">
                  <div className="settings-label">{t('settings.buttonRadius')}</div>
                  <div className="settings-hint">{t('settings.buttonRadius.hint')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={settings.buttonRadius}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 4
                      update({ buttonRadius: Math.min(12, Math.max(0, v)) })
                    }}
                    style={numInputStyle}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.px')}</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                value={settings.buttonRadius}
                onChange={(e) => update({ buttonRadius: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* ══════ 编辑器 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">{t('settings.group.editor')}</div>

            {/* 字体选择（读取本机字体）*/}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.fontFamily')}</div>
                <div className="settings-hint">{t('settings.fontFamily.hint')}</div>
              </div>
              <select
                className="settings-select"
                value={settings.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
              >
                {!currentFontKnown && (
                  <option value={settings.fontFamily} style={{ fontFamily: settings.fontFamily }}>
                    {settings.fontFamily}
                  </option>
                )}
                {(['default', 'cjk', 'latin', 'mono'] as FontGroupKey[]).map((g) => {
                  const items = fontGroups[g]
                  if (!items || items.length === 0) return null
                  return (
                    <optgroup key={g} label={GROUP_LABELS[g]}>
                      {items.map((f) => (
                        <option
                          key={f.value}
                          value={f.value}
                          style={{ fontFamily: `"${f.value}"` }}
                        >
                          {f.value}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
              {fonts.length === 0 ? (
                <div className="settings-hint">{t('font.loading')}</div>
              ) : (
                <div className="settings-hint">{t('font.count', { n: fonts.length })}</div>
              )}
            </div>

            {/* 字体大小：输入框 + 滑块 */}
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="settings-label-group">
                  <div className="settings-label">{t('settings.fontSize')}</div>
                  <div className="settings-hint">{t('settings.fontSize.hint')}</div>
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
                    style={numInputStyle}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.pt')}</span>
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
                <div className="settings-label">{t('settings.lineHeight')}</div>
                <div className="settings-hint">{t('settings.lineHeight.hint')}</div>
              </div>
              <div className="settings-radio-group">
                {(['compact', 'normal', 'relaxed'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`settings-radio-btn ${settings.lineHeight === mode ? 'active' : ''}`}
                    onClick={() => update({ lineHeight: mode })}
                  >
                    {t(`settings.lineHeight.${mode}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.editorWidth')}</div>
                <div className="settings-hint">{t('settings.editorWidth.hint')}</div>
              </div>
              <div className="settings-radio-group">
                {(['narrow', 'medium', 'wide'] as const).map((w) => (
                  <button
                    key={w}
                    className={`settings-radio-btn ${settings.editorWidth === w ? 'active' : ''}`}
                    onClick={() => update({ editorWidth: w })}
                  >
                    {t(`settings.width.${w}`)}
                  </button>
                ))}
              </div>
            </div>

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
          </div>

          {/* ══════ 视图 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">{t('settings.group.view')}</div>

            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.defaultMode')}</div>
                <div className="settings-hint">{t('settings.defaultMode.hint')}</div>
              </div>
              <div className="settings-radio-group">
                {(['live', 'source', 'read'] as EditorMode[]).map((m) => (
                  <button
                    key={m}
                    className={`settings-radio-btn ${settings.editorMode === m ? 'active' : ''}`}
                    onClick={() => update({ editorMode: m })}
                  >
                    {t(`settings.mode.${m}`)}
                  </button>
                ))}
              </div>
            </div>

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
                    <button
                      key={side}
                      className={`settings-radio-btn ${settings.minimapSide === side ? 'active' : ''}`}
                      onClick={() => update({ minimapSide: side })}
                    >
                      {t(`settings.side.${side}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 专注模式 */}
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

          </div>

          {/* ══════ 行为 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">{t('settings.group.behavior')}</div>

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
                  <input
                    type="number"
                    min={10}
                    max={3600}
                    value={settings.autoSaveInterval}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 300
                      update({ autoSaveInterval: Math.min(3600, Math.max(10, v)) })
                    }}
                    style={numInputStyle}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('unit.s')}</span>
                </div>
              </div>
            )}
          </div>

          {/* ══════ 语言 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">{t('settings.group.language')}</div>
            <div className="settings-row">
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.group.language')}</div>
                <div className="settings-hint">{t('settings.language.hint')}</div>
              </div>
              <div className="settings-radio-group">
                {langOptions.map((l) => (
                  <button
                    key={l}
                    className={`settings-radio-btn ${language === l ? 'active' : ''}`}
                    onClick={() => setLanguage(l)}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ══════ 快捷键 ══════ */}
          <div className="settings-group">
            <div className="settings-group-title">{t('settings.group.shortcuts')}</div>
            {shortcuts.map(([key, descKey]) => (
              <div className="settings-row" key={key}>
                <span className="settings-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{key}</span>
                <span className="settings-hint" style={{ marginTop: 0 }}>{t(descKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}

const numInputStyle: CSSProperties = {
  width: '56px', padding: '4px 6px', textAlign: 'center',
  border: '1px solid var(--border)', borderRadius: '4px',
  background: 'var(--surface)', color: 'var(--fg)',
  fontSize: '13px', fontFamily: 'var(--font-mono)',
}
