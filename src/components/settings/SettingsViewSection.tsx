import type { CSSProperties } from 'react'
import type { AppSettings, EditorMode } from '../../types'
import type { FontGroupKey, FontOption } from '../../utils/fonts'
import { Select } from '../Select'
import { FlatGroup } from './FlatGroup'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface ViewSectionProps {
  t: Translator
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  fontGroups: Record<FontGroupKey, FontOption[]>
  groupLabels: Record<FontGroupKey, string>
  numInputStyle: CSSProperties
}

export function SettingsViewSection({ t, settings, update, fontGroups, groupLabels, numInputStyle }: ViewSectionProps) {
  return (
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
  )
}
