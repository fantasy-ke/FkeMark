import type { CSSProperties } from 'react'
import type { AiProvider, AppSettings } from '../../types'
import { DEFAULT_API_AI_ENDPOINT, DEFAULT_LOCAL_AI_ENDPOINT } from '../../utils/aiAssistant'
import { FlatGroup } from './FlatGroup'

interface SettingsAiSectionProps {
  t: (key: string, params?: Record<string, string | number>) => string
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  numInputStyle: CSSProperties
}

export function SettingsAiSection({ t, settings, update, numInputStyle }: SettingsAiSectionProps) {
  const setProvider = (provider: AiProvider) => {
    const fallback = provider === 'api' ? DEFAULT_API_AI_ENDPOINT : DEFAULT_LOCAL_AI_ENDPOINT
    update({
      aiProvider: provider,
      aiEndpoint: settings.aiEndpoint.trim() ? settings.aiEndpoint : fallback,
    })
  }

  return (
    <>
      <h2 className="settings-content-title">{t('settings.group.ai')}</h2>

      <FlatGroup title={t('ai.settings.enable')}>
        <div className="settings-row">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.enable')}</div>
            <div className="settings-hint">{t('ai.settings.enable.hint')}</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={settings.aiEnabled} onChange={(e) => update({ aiEnabled: e.target.checked })} />
            <span className="toggle-slider" />
          </label>
        </div>
      </FlatGroup>

      <FlatGroup title={t('ai.settings.provider')}>
        <div className="settings-row">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.provider')}</div>
            <div className="settings-hint">{t('ai.settings.endpoint.hint')}</div>
          </div>
          <div className="settings-radio-group">
            {(['local', 'api'] as AiProvider[]).map((provider) => (
              <button
                key={provider}
                className={`settings-radio-btn ${settings.aiProvider === provider ? 'active' : ''}`}
                onClick={() => setProvider(provider)}
              >
                {t(`ai.settings.provider.${provider}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.endpoint')}</div>
            <div className="settings-hint">{t('ai.settings.endpoint.hint')}</div>
          </div>
          <input
            className="ai-settings-input"
            type="url"
            value={settings.aiEndpoint}
            onChange={(e) => update({ aiEndpoint: e.target.value })}
            spellCheck={false}
          />
          <div className="ai-settings-defaults">
            <button className="link-dialog-btn" onClick={() => update({ aiEndpoint: DEFAULT_LOCAL_AI_ENDPOINT, aiProvider: 'local' })}>
              {t('ai.settings.localDefault')}
            </button>
            <button className="link-dialog-btn" onClick={() => update({ aiEndpoint: DEFAULT_API_AI_ENDPOINT, aiProvider: 'api' })}>
              {t('ai.settings.apiDefault')}
            </button>
          </div>
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.model')}</div>
            <div className="settings-hint">{t('ai.settings.model.hint')}</div>
          </div>
          <input
            className="ai-settings-input"
            value={settings.aiModel}
            onChange={(e) => update({ aiModel: e.target.value })}
            spellCheck={false}
          />
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.apiKey')}</div>
            <div className="settings-hint">{t('ai.settings.apiKey.hint')}</div>
          </div>
          <input
            className="ai-settings-input"
            type="password"
            value={settings.aiApiKey}
            onChange={(e) => update({ aiApiKey: e.target.value })}
            spellCheck={false}
          />
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.targetLanguage')}</div>
          </div>
          <input
            className="ai-settings-input"
            value={settings.aiTargetLanguage}
            onChange={(e) => update({ aiTargetLanguage: e.target.value })}
            spellCheck={false}
          />
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.temperature')}</div>
            <div className="settings-hint">{t('ai.settings.temperature.hint')}</div>
          </div>
          <div className="ai-temperature-row">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={settings.aiTemperature}
              onChange={(e) => update({ aiTemperature: Number(e.target.value) })}
            />
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={settings.aiTemperature}
              onChange={(e) => update({ aiTemperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })}
              style={numInputStyle}
            />
          </div>
        </div>
      </FlatGroup>

      <div className="ai-settings-privacy">{t('ai.settings.privacyHint')}</div>
    </>
  )
}
