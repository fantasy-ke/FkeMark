import type { CSSProperties } from 'react'
import type { AppSettings } from '../../types'
import type { FontGroupKey, FontOption } from '../../utils/fonts'
import { Select } from '../Select'
import { FlatGroup } from './FlatGroup'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface EditorSectionProps {
  t: Translator
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  currentFontKnown: boolean
  fontGroups: Record<FontGroupKey, FontOption[]>
  fonts: FontOption[]
  groupLabels: Record<FontGroupKey, string>
  numInputStyle: CSSProperties
}

export function SettingsEditorSection({ t, settings, update, currentFontKnown, fontGroups, fonts, groupLabels, numInputStyle }: EditorSectionProps) {
  return (
      <>
        <h2 className="settings-content-title">{t('settings.group.editor')}</h2>
        <FlatGroup title={t('settings.fontFamily')}>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
            <div className="settings-label-group">
              <div className="settings-label">{t('settings.fontFamily')}</div>
              <div className="settings-hint">{t('settings.fontFamily.hint')}</div>
            </div>
            <Select className="settings-select" value={settings.fontFamily} onChange={(v) => update({ fontFamily: v })}>
              {!currentFontKnown && <Select.Option value={settings.fontFamily}>{settings.fontFamily}</Select.Option>}
              {(['default', 'cjk', 'latin', 'mono'] as FontGroupKey[]).map((g) => {
                const items = fontGroups[g]
                if (!items || items.length === 0) return null
                return (
                  <Select.Group key={g} label={groupLabels[g]}>
                    {items.map((f) => (
                      <Select.Option key={f.value} value={f.value}>
                        <span style={{ fontFamily: `"${f.value}"` }}>{f.value}</span>
                      </Select.Option>
                    ))}
                  </Select.Group>
                )
              })}
            </Select>
            {fonts.length === 0 ? <div className="settings-hint">{t('font.loading')}</div> : <div className="settings-hint">{t('font.count', { n: fonts.length })}</div>}
          </div>
        </FlatGroup>

        <FlatGroup title={t('settings.fontSize')}>
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
        </FlatGroup>

        <FlatGroup title={t('settings.lineHeight')}>
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
        </FlatGroup>

        <FlatGroup title={t('settings.editorWidth')}>
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
        </FlatGroup>

        <FlatGroup title={t('settings.showMarkers')}>
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
        </FlatGroup>

        <FlatGroup title={t('settings.spellCheck')}>
          <div className="settings-row">
            <div className="settings-label-group">
              <div className="settings-label">{t('settings.spellCheck')}</div>
              <div className="settings-hint">{t('settings.spellCheck.hint')}</div>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={settings.spellCheckEnabled} onChange={(e) => update({ spellCheckEnabled: e.target.checked })} />
              <span className="toggle-slider" />
            </label>
          </div>
        </FlatGroup>

        <FlatGroup title={t('settings.autoBracket')}>
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
        </FlatGroup>
      </>
  )
}
