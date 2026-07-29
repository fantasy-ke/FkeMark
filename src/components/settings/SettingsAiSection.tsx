import { useState, type CSSProperties } from 'react'
import type { AiProvider, AiUpstreamFormat, AppSettings, McpPermissionMode } from '../../types'
import {
  DEFAULT_MARKDOWN_AI_PROMPT,
  fetchAiModels,
  getAiFormatPath,
  getAiUpstreamFormat,
  getDefaultAiEndpoint,
  testAiConnection,
} from '../../utils/aiAssistant'
import { FlatGroup } from './FlatGroup'

interface SettingsAiSectionProps {
  t: (key: string, params?: Record<string, string | number>) => string
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  numInputStyle: CSSProperties
}

type RequestStatus = { kind: 'success' | 'error'; text: string } | null

const AI_FORMATS: AiUpstreamFormat[] = ['chat-completions', 'responses', 'anthropic-messages']
const MCP_PERMISSION_DEFAULT: McpPermissionMode = 'data-read-write'
const MCP_PERMISSION_MODES: McpPermissionMode[] = ['read-only', 'data-read-write', 'full-access']
const MCP_PERMISSION_CAPABILITIES: { key: string; allowed: Record<McpPermissionMode, boolean> }[] = [
  { key: 'queryRead', allowed: { 'read-only': true, 'data-read-write': true, 'full-access': true } },
  { key: 'scopedDataChange', allowed: { 'read-only': false, 'data-read-write': true, 'full-access': true } },
  { key: 'destructiveDataChange', allowed: { 'read-only': false, 'data-read-write': false, 'full-access': true } },
  { key: 'ddlAdmin', allowed: { 'read-only': false, 'data-read-write': false, 'full-access': true } },
  { key: 'connectionManage', allowed: { 'read-only': false, 'data-read-write': true, 'full-access': true } },
]

export function SettingsAiSection({ t, settings, update, numInputStyle }: SettingsAiSectionProps) {
  const [models, setModels] = useState<string[]>([])
  const [busyAction, setBusyAction] = useState<'test' | 'models' | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<RequestStatus>(null)
  const [modelStatus, setModelStatus] = useState<RequestStatus>(null)
  const format = getAiUpstreamFormat(settings)
  const maxTemperature = format === 'anthropic-messages' ? 1 : 2
  const mcpPermissionMode = settings.mcpPermissionMode ?? MCP_PERMISSION_DEFAULT
  const modelOptions = settings.aiModel.trim() && !models.includes(settings.aiModel.trim())
    ? [settings.aiModel.trim(), ...models]
    : models

  const setProvider = (provider: AiProvider) => {
    update({
      aiProvider: provider,
      aiEndpoint: settings.aiEndpoint.trim() ? settings.aiEndpoint : getDefaultAiEndpoint(provider, format),
    })
  }

  const setFormat = (nextFormat: AiUpstreamFormat) => {
    setModels([])
    setModelStatus(null)
    update({
      aiUpstreamFormat: nextFormat,
      aiTemperature: nextFormat === 'anthropic-messages'
        ? Math.min(1, settings.aiTemperature)
        : settings.aiTemperature,
    })
  }

  const handleTestConnection = async () => {
    setBusyAction('test')
    setConnectionStatus(null)
    try {
      await testAiConnection(settings)
      setConnectionStatus({ kind: 'success', text: t('ai.settings.test.success') })
    } catch (error) {
      setConnectionStatus({ kind: 'error', text: t('ai.settings.test.error', { detail: errorMessage(error) }) })
    } finally {
      setBusyAction(null)
    }
  }

  const handleFetchModels = async () => {
    setBusyAction('models')
    setModelStatus(null)
    try {
      const nextModels = await fetchAiModels(settings)
      setModels(nextModels)
      setModelStatus({ kind: 'success', text: t('ai.settings.models.success', { count: nextModels.length }) })
    } catch (error) {
      setModelStatus({ kind: 'error', text: t('ai.settings.models.error', { detail: errorMessage(error) }) })
    } finally {
      setBusyAction(null)
    }
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
            <div className="settings-hint">{t('ai.settings.provider.hint')}</div>
          </div>
          <div className="settings-radio-group">
            {(['local', 'api'] as AiProvider[]).map((provider) => (
              <button
                type="button"
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
            <div className="settings-label">{t('ai.settings.format')}</div>
            <div className="settings-hint">{t('ai.settings.format.hint')}</div>
          </div>
          <select
            className="ai-settings-input"
            value={format}
            onChange={(e) => setFormat(e.target.value as AiUpstreamFormat)}
          >
            {AI_FORMATS.map((item) => (
              <option key={item} value={item}>{t(`ai.settings.format.${item}`)}</option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.fullUrl')}</div>
            <div className="settings-hint">
              {settings.aiUseFullUrl
                ? t('ai.settings.fullUrl.enabledHint')
                : t('ai.settings.fullUrl.disabledHint', { path: getAiFormatPath(format) })}
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={Boolean(settings.aiUseFullUrl)}
              onChange={(e) => update({ aiUseFullUrl: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{settings.aiUseFullUrl ? t('ai.settings.fullEndpoint') : t('ai.settings.baseUrl')}</div>
            <div className="settings-hint">{t('ai.settings.endpoint.hint')}</div>
          </div>
          <div className="ai-settings-control-row">
            <input
              className="ai-settings-input"
              type="url"
              value={settings.aiEndpoint}
              onChange={(e) => {
                setConnectionStatus(null)
                setModels([])
                update({ aiEndpoint: e.target.value })
              }}
              spellCheck={false}
            />
            <button
              type="button"
              className="link-dialog-btn ai-settings-action-btn"
              disabled={busyAction !== null}
              onClick={handleTestConnection}
            >
              {busyAction === 'test' ? t('ai.settings.testing') : t('ai.settings.test')}
            </button>
          </div>
          {connectionStatus && (
            <div className={`ai-settings-status ${connectionStatus.kind}`} role="status">{connectionStatus.text}</div>
          )}
          <div className="ai-settings-defaults">
            <button
              type="button"
              className="link-dialog-btn"
              onClick={() => update({
                aiEndpoint: getDefaultAiEndpoint('local', format),
                aiProvider: 'local',
                aiUseFullUrl: false,
              })}
            >
              {t('ai.settings.localDefault')}
            </button>
            <button
              type="button"
              className="link-dialog-btn"
              onClick={() => update({
                aiEndpoint: getDefaultAiEndpoint('api', format),
                aiProvider: 'api',
                aiUseFullUrl: false,
              })}
            >
              {t('ai.settings.apiDefault')}
            </button>
          </div>
        </div>

        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.model')}</div>
            <div className="settings-hint">{t('ai.settings.model.hint')}</div>
          </div>
          <div className="ai-settings-control-row">
            <input
              className="ai-settings-input"
              list="ai-settings-model-options"
              value={settings.aiModel}
              onChange={(e) => update({ aiModel: e.target.value })}
              spellCheck={false}
            />
            <datalist id="ai-settings-model-options">
              {modelOptions.map((model) => <option key={model} value={model} />)}
            </datalist>
            <button
              type="button"
              className="link-dialog-btn ai-settings-action-btn"
              disabled={busyAction !== null}
              onClick={handleFetchModels}
            >
              {busyAction === 'models' ? t('ai.settings.models.loading') : t('ai.settings.models.fetch')}
            </button>
          </div>
          {modelStatus && (
            <div className={`ai-settings-status ${modelStatus.kind}`} role="status">{modelStatus.text}</div>
          )}
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
            <div className="settings-label">{t('ai.settings.markdownPrompt')}</div>
            <div className="settings-hint">{t('ai.settings.markdownPrompt.hint')}</div>
          </div>
          <textarea
            className="ai-settings-input ai-settings-prompt"
            rows={7}
            value={settings.aiMarkdownPrompt}
            onChange={(e) => update({ aiMarkdownPrompt: e.target.value })}
            spellCheck={false}
          />
          <div className="ai-settings-defaults">
            <button type="button" className="link-dialog-btn" onClick={() => update({ aiMarkdownPrompt: DEFAULT_MARKDOWN_AI_PROMPT })}>
              {t('ai.settings.resetPrompt')}
            </button>
          </div>
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
              max={maxTemperature}
              step={0.1}
              value={Math.min(maxTemperature, settings.aiTemperature)}
              onChange={(e) => update({ aiTemperature: Number(e.target.value) })}
            />
            <input
              type="number"
              min={0}
              max={maxTemperature}
              step={0.1}
              value={Math.min(maxTemperature, settings.aiTemperature)}
              onChange={(e) => update({ aiTemperature: Math.min(maxTemperature, Math.max(0, Number(e.target.value) || 0)) })}
              style={numInputStyle}
            />
          </div>
        </div>
      </FlatGroup>

      <FlatGroup title={t('ai.settings.mcp.permission')}>
        <div className="settings-row ai-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('ai.settings.mcp.permission')}</div>
            <div className="settings-hint">{t('ai.settings.mcp.permission.hint')}</div>
          </div>
          <div className="settings-radio-group mcp-permission-mode-group" role="group" aria-label={t('ai.settings.mcp.permission')}>
            {MCP_PERMISSION_MODES.map((mode) => (
              <button
                type="button"
                key={mode}
                className={`settings-radio-btn ${mcpPermissionMode === mode ? 'active' : ''}`}
                aria-pressed={mcpPermissionMode === mode}
                onClick={() => update({ mcpPermissionMode: mode })}
              >
                <span>{t(`ai.settings.mcp.permission.${mode}`)}</span>
                {mode === MCP_PERMISSION_DEFAULT && <span className="mcp-permission-recommended">{t('ai.settings.mcp.recommended')}</span>}
              </button>
            ))}
          </div>
          <div className="mcp-permission-summary">{t('ai.settings.mcp.permission.summary')}</div>
          <div className="mcp-permission-matrix-title">{t('ai.settings.mcp.matrixTitle')}</div>
          <div className="mcp-permission-table-wrap">
            <table className="mcp-permission-table">
              <thead>
                <tr>
                  <th scope="col">{t('ai.settings.mcp.capability')}</th>
                  {MCP_PERMISSION_MODES.map((mode) => (
                    <th scope="col" key={mode}>{t(`ai.settings.mcp.permission.${mode}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MCP_PERMISSION_CAPABILITIES.map((capability) => (
                  <tr key={capability.key}>
                    <th scope="row">{t(`ai.settings.mcp.capability.${capability.key}`)}</th>
                    {MCP_PERMISSION_MODES.map((mode) => {
                      const allowed = capability.allowed[mode]
                      return (
                        <td key={mode}>
                          <span className={`mcp-permission-mark ${allowed ? 'allowed' : 'blocked'}`} aria-label={t(allowed ? 'ai.settings.mcp.allowed' : 'ai.settings.mcp.blocked')}>
                            {allowed ? '\u2713' : '\u00d7'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="settings-hint">{t('ai.settings.mcp.permission.footnote')}</div>
          <div className="mcp-permission-examples">
            <div className="mcp-permission-matrix-title">{t('ai.settings.mcp.examplesTitle')}</div>
            <div className="mcp-permission-example-list">
              {MCP_PERMISSION_MODES.map((mode) => (
                <div className="mcp-permission-example-card" key={mode}>
                  <div className="mcp-permission-example-title">
                    <span>{t('ai.settings.mcp.permission.' + mode)}</span>
                    {mode === MCP_PERMISSION_DEFAULT && <span className="mcp-permission-recommended">{t('ai.settings.mcp.recommended')}</span>}
                  </div>
                  <dl>
                    <div>
                      <dt>{t('ai.settings.mcp.example.scenario')}</dt>
                      <dd>{t('ai.settings.mcp.example.' + mode + '.scenario')}</dd>
                    </div>
                    <div>
                      <dt>{t('ai.settings.mcp.example.config')}</dt>
                      <dd>{t('ai.settings.mcp.example.' + mode + '.config')}</dd>
                    </div>
                    <div>
                      <dt>{t('ai.settings.mcp.example.guard')}</dt>
                      <dd>{t('ai.settings.mcp.example.' + mode + '.guard')}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      </FlatGroup>

      <div className="ai-settings-privacy">{t('ai.settings.privacyHint')}</div>
    </>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
