import type { CSSProperties } from 'react'
import type { AppSettings, ToolbarButtonConfig, ToolbarButtonId, ToolbarButtonPlacement } from '../../types'
import { Select } from '../Select'
import { THEME_OPTIONS, normalizeTheme } from '../../utils/themes'
import {
  DEFAULT_TOOLBAR_BUTTONS,
  TOOLBAR_BUTTON_GROUPS,
  TOOLBAR_BUTTONS,
  normalizeToolbarPlacement,
  resolveToolbarButtons,
} from '../../utils/toolbar'
import { FlatGroup } from './FlatGroup'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface AppearanceSectionProps {
  t: Translator
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  numInputStyle: CSSProperties
}

const TOOLBAR_BUTTON_SYMBOLS: Record<ToolbarButtonId, string> = {
  heading: 'H',
  bold: 'B',
  italic: 'I',
  strike: 'S',
  code: '</>',
  quote: '\u275D',
  ul: '\u2261',
  ol: '1.',
  todo: '\u2610',
  hr: '\u2015',
  table: '\u25A6',
  link: String.fromCodePoint(0x1F517),
  wikilink: '[[]]',
  image: String.fromCodePoint(0x1F5BC),
  codeblock: '{}',
  slash: '/',
}

function cloneDefaultToolbarButtons(): ToolbarButtonConfig[] {
  return DEFAULT_TOOLBAR_BUTTONS.map((item) => ({ ...item }))
}

function allowedPlacements(button: typeof TOOLBAR_BUTTONS[number]): readonly ToolbarButtonPlacement[] {
  return button.allowedPlacements || ['toolbar', 'hidden', ...TOOLBAR_BUTTON_GROUPS.map((group) => group.id)]
}

export function SettingsAppearanceSection({ t, settings, update, numInputStyle }: AppearanceSectionProps) {
  const toolbarButtons = resolveToolbarButtons(settings.toolbarButtons)
  const toolbarButtonById = new Map(toolbarButtons.map((item) => [item.id, item]))

  function updateToolbarButton(id: ToolbarButtonId, patch: Partial<ToolbarButtonConfig>) {
    update({
      toolbarButtons: toolbarButtons.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }

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
          <div className="settings-row toolbar-customize-row">
            <div className="toolbar-customize-heading">
              <div className="settings-label-group">
                <div className="settings-label">{t('settings.toolbarCustomize')}</div>
                <div className="settings-hint">{t('settings.toolbarCustomize.hint')}</div>
              </div>
              <button className="toolbar-customize-reset" onClick={() => update({ toolbarButtons: cloneDefaultToolbarButtons() })}>
                {t('settings.toolbarCustomize.reset')}
              </button>
            </div>
            <div className="toolbar-config-list">
              {TOOLBAR_BUTTONS.map((button) => {
                const config = toolbarButtonById.get(button.id) || DEFAULT_TOOLBAR_BUTTONS.find((item) => item.id === button.id)!
                const placements = allowedPlacements(button)
                return (
                  <div className={`toolbar-config-item ${config.placement === 'hidden' ? 'is-hidden' : ''}`} key={button.id}>
                    <div className="toolbar-config-main">
                      <span className="toolbar-config-icon">{TOOLBAR_BUTTON_SYMBOLS[button.id]}</span>
                      <span className="settings-label toolbar-config-name">{t(button.labelKey)}</span>
                    </div>
                    <Select
                      className="settings-select toolbar-config-select"
                      value={config.placement}
                      onChange={(value) => updateToolbarButton(button.id, { placement: normalizeToolbarPlacement(value) })}
                    >
                      {placements.includes('toolbar') && (
                        <Select.Option value="toolbar">{t('settings.toolbarPlacement.toolbar')}</Select.Option>
                      )}
                      {placements.includes('hidden') && (
                        <Select.Option value="hidden">{t('settings.toolbarPlacement.hidden')}</Select.Option>
                      )}
                      {TOOLBAR_BUTTON_GROUPS.some((group) => placements.includes(group.id)) && (
                        <Select.Group label={t('settings.toolbarPlacement.group')}>
                          {TOOLBAR_BUTTON_GROUPS.filter((group) => placements.includes(group.id)).map((group) => (
                            <Select.Option key={group.id} value={group.id}>{t(group.labelKey)}</Select.Option>
                          ))}
                        </Select.Group>
                      )}
                    </Select>
                    <label className={`toolbar-separator-toggle ${config.placement === 'hidden' ? 'disabled' : ''}`}>
                      <input
                        type="checkbox"
                        checked={config.separatorBefore}
                        disabled={config.placement === 'hidden'}
                        onChange={(e) => updateToolbarButton(button.id, { separatorBefore: e.target.checked })}
                      />
                      <span>{t('settings.toolbarSeparatorBefore')}</span>
                    </label>
                  </div>
                )
              })}
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
