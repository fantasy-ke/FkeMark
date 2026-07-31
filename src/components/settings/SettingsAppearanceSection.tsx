import type { CSSProperties, ReactNode } from 'react'
import type { AppSettings, ThemeMode, ToolbarButtonConfig } from '../../types'
import { THEME_OPTIONS, normalizeTheme, type ThemeOption, type ThemeTone } from '../../utils/themes'
import { DEFAULT_TOOLBAR_ITEMS } from '../../utils/toolbar'
import { FlatGroup } from './FlatGroup'
import { ToolbarLayoutEditor } from './ToolbarLayoutEditor'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface AppearanceSectionProps {
  t: Translator
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  numInputStyle: CSSProperties
  systemDark?: boolean
}

interface ThemeModeButton {
  id: Extract<ThemeMode, 'light' | 'dark' | 'system'>
  tone: ThemeTone
  icon: ReactNode
}

const THEME_MODE_BUTTONS: readonly ThemeModeButton[] = [
  {
    id: 'light',
    tone: 'light',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    ),
  },
  {
    id: 'dark',
    tone: 'dark',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    id: 'system',
    tone: 'light',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
]

function cloneDefaultToolbarItems(): ToolbarButtonConfig[] {
  return DEFAULT_TOOLBAR_ITEMS.map((item) => ({ ...item }))
}

function getThemeOption(theme: ThemeMode): ThemeOption {
  return THEME_OPTIONS.find((item) => item.id === theme) || THEME_OPTIONS[2]
}

export function SettingsAppearanceSection({ t, settings, update, numInputStyle, systemDark = false }: AppearanceSectionProps) {
  const selectedTheme = getThemeOption(normalizeTheme(settings.theme))
  const activeTone: ThemeTone = selectedTheme.id === 'system'
    ? (systemDark ? 'dark' : 'light')
    : selectedTheme.tone
  const visibleThemes = THEME_OPTIONS.filter((item) => item.tone === activeTone && item.id !== 'system')

  return (
      <>
        <h2 className="settings-content-title">{t('settings.group.appearance')}</h2>
        <FlatGroup title={t('settings.theme')}>
          <section className="theme-picker" aria-labelledby="theme-picker-title">
            <div className="theme-picker-heading">
              <div className="settings-label" id="theme-picker-title">{t('settings.theme')}</div>
              <div className="settings-hint">{t('settings.theme.hint')}</div>
            </div>

            <div className="theme-mode-tabs" role="group" aria-label={t('settings.theme.mode.label')}>
              {THEME_MODE_BUTTONS.map((mode) => {
                const isActive = selectedTheme.id === mode.id || (selectedTheme.group === 'palette' && mode.id !== 'system' && selectedTheme.tone === mode.tone)
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`theme-mode-tab ${isActive ? 'active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => update({ theme: mode.id })}
                  >
                    <span className="theme-mode-tab-icon">{mode.icon}</span>
                    <span>{t(`settings.theme.${mode.id}`)}</span>
                  </button>
                )
              })}
            </div>

            <div className="theme-palette-heading">
              <div className="settings-label">{t('settings.theme.palette.title')}</div>
              <div className="settings-hint">{t('settings.theme.palette.hint')}</div>
            </div>

            <div className="theme-card-grid" data-theme-tone={activeTone}>
              {visibleThemes.map((item) => {
                const isActive = settings.theme === item.id
                const previewStyle = {
                  '--theme-preview-sidebar': item.preview.sidebar,
                  '--theme-preview-panel': item.preview.panel,
                  '--theme-preview-surface': item.preview.surface,
                  '--theme-preview-line': item.preview.line,
                } as CSSProperties

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`theme-card ${isActive ? 'active' : ''}`}
                    data-theme-card={item.id}
                    aria-pressed={isActive}
                    onClick={() => update({ theme: normalizeTheme(item.id) })}
                  >
                    <span className="theme-card-head">
                      <span className="theme-card-title">{t(item.labelKey)}</span>
                      {isActive && <span className="theme-card-badge">{t('settings.theme.current')}</span>}
                    </span>
                    <span className="theme-card-desc">{t(item.descriptionKey)}</span>
                    <span className="theme-card-preview" style={previewStyle} aria-hidden="true">
                      <span className="theme-card-preview-sidebar" />
                      <span className="theme-card-preview-block" />
                      <span className="theme-card-preview-lines">
                        <span />
                        <span />
                      </span>
                    </span>
                    <span className="theme-card-footer">
                      <span className="theme-card-swatches" aria-hidden="true">
                        {item.preview.swatches.map((color) => (
                          <span key={color} className="theme-card-swatch" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      <span className="theme-card-kind">{t(item.group === 'basic' ? 'settings.theme.group.basic' : 'settings.theme.palette.kind')}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </FlatGroup>

        <FlatGroup title={t('settings.toolbar')}>
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
          <div className="settings-row">
            <div className="settings-label-group">
              <div className="settings-label">{t('settings.toolbarPosition')}</div>
              <div className="settings-hint">{t('settings.toolbarPosition.hint')}</div>
            </div>
            <div className="settings-radio-group">
              {(['top', 'left', 'bottom', 'right'] as const).map((position) => (
                <button key={position} className={`settings-radio-btn ${settings.toolbarPosition === position ? 'active' : ''}`}
                  onClick={() => update({ toolbarPosition: position })}>{t(`settings.toolbarPosition.${position}`)}</button>
              ))}
            </div>
          </div>
          <div className="settings-row toolbar-customize-row">
            <div className="toolbar-customize-heading">
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.toolbarCustomize')}</div>
                <div className="settings-hint">{t('settings.toolbarCustomize.hint')}</div>
              </div>
              <button className="toolbar-customize-reset" onClick={() => update({ toolbarButtons: cloneDefaultToolbarItems() })}>
                {t('settings.toolbarCustomize.reset')}
              </button>
            </div>
            <ToolbarLayoutEditor
              t={t}
              value={settings.toolbarButtons}
              onChange={(toolbarButtons) => update({ toolbarButtons })}
            />
          </div>
        </FlatGroup>

        <FlatGroup title={t('settings.cornerRadius')}>
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
                <span style={{ fontSize: 'var(--ui-font-md)', color: 'var(--muted)' }}>{t('unit.px')}</span>
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
                <span style={{ fontSize: 'var(--ui-font-md)', color: 'var(--muted)' }}>{t('unit.px')}</span>
              </div>
            </div>
            <input type="range" min={0} max={12} value={settings.buttonRadius}
              onChange={(e) => update({ buttonRadius: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
          </div>
        </FlatGroup>
      </>
  )
}
