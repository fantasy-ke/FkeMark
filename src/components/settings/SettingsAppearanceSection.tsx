import type { CSSProperties } from 'react'
import type { AppSettings } from '../../types'
import { Select } from '../Select'
import { THEME_OPTIONS, normalizeTheme } from '../../utils/themes'
import { FlatGroup } from './FlatGroup'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface AppearanceSectionProps {
  t: Translator
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  numInputStyle: CSSProperties
}

export function SettingsAppearanceSection({ t, settings, update, numInputStyle }: AppearanceSectionProps) {
  return (
      <>
        <h2 className="settings-content-title">{t('settings.group.appearance')}</h2>
        <FlatGroup title={t('settings.theme')}>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
            <div className="settings-label-group">
              <div className="settings-label">{t('settings.theme')}</div>
              <div className="settings-hint">{t('settings.theme.hint')}</div>
            </div>
            <Select
              className="settings-select theme-select"
              value={settings.theme}
              onChange={(theme) => update({ theme: normalizeTheme(theme) })}
            >
              <Select.Group label={t('settings.theme.group.basic')}>
                {THEME_OPTIONS.filter((item) => item.group === 'basic').map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    <span className="theme-option"><span className="theme-option-swatch" style={{ background: item.accent }} />{t(item.labelKey)}</span>
                  </Select.Option>
                ))}
              </Select.Group>
              <Select.Group label={t('settings.theme.group.palette')}>
                {THEME_OPTIONS.filter((item) => item.group === 'palette').map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    <span className="theme-option"><span className="theme-option-swatch" style={{ background: item.accent }} />{t(item.labelKey)}</span>
                  </Select.Option>
                ))}
              </Select.Group>
            </Select>
          </div>
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
        </FlatGroup>
      </>
  )
}
