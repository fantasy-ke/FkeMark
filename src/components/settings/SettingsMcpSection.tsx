import type { AppSettings, McpPermissionMode } from '../../types'
import { FlatGroup } from './FlatGroup'

interface SettingsMcpSectionProps {
  t: (key: string, params?: Record<string, string | number>) => string
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

const MCP_PERMISSION_DEFAULT: McpPermissionMode = 'data-read-write'
const MCP_PERMISSION_MODES: McpPermissionMode[] = ['read-only', 'data-read-write', 'full-access']
const MCP_PERMISSION_CAPABILITIES: { key: string; allowed: Record<McpPermissionMode, boolean> }[] = [
  { key: 'readMarkdown', allowed: { 'read-only': true, 'data-read-write': true, 'full-access': true } },
  { key: 'outlineMarkdown', allowed: { 'read-only': true, 'data-read-write': true, 'full-access': true } },
  { key: 'writeMarkdown', allowed: { 'read-only': false, 'data-read-write': true, 'full-access': true } },
  { key: 'deleteMarkdown', allowed: { 'read-only': false, 'data-read-write': false, 'full-access': true } },
  { key: 'workspaceManage', allowed: { 'read-only': false, 'data-read-write': false, 'full-access': true } },
]

export function SettingsMcpSection({ t, settings, update }: SettingsMcpSectionProps) {
  const mcpPermissionMode = settings.mcpPermissionMode ?? MCP_PERMISSION_DEFAULT
  const allowedRoots = settings.mcpAllowedRoots ?? ''

  return (
    <>
      <h2 className="settings-content-title">{t('mcp.settings.title')}</h2>

      <FlatGroup title={t('mcp.settings.service')}>
        <div className="settings-row">
          <div className="settings-label-group">
            <div className="settings-label">{t('mcp.settings.service.enable')}</div>
            <div className="settings-hint">{t('mcp.settings.service.enable.hint')}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={Boolean(settings.mcpServiceEnabled)}
              onChange={(e) => update({ mcpServiceEnabled: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-row mcp-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('mcp.settings.service.roots')}</div>
            <div className="settings-hint">{t('mcp.settings.service.roots.hint')}</div>
          </div>
          <textarea
            className="mcp-settings-input mcp-settings-roots"
            value={allowedRoots}
            onChange={(e) => update({ mcpAllowedRoots: e.target.value })}
            placeholder={t('mcp.settings.service.roots.placeholder')}
            spellCheck={false}
          />
        </div>
        <div className="mcp-settings-note">{t('mcp.settings.service.note')}</div>
      </FlatGroup>

      <FlatGroup title={t('mcp.settings.permission')}>
        <div className="settings-row mcp-settings-row-stack">
          <div className="settings-label-group">
            <div className="settings-label">{t('mcp.settings.permission')}</div>
            <div className="settings-hint">{t('mcp.settings.permission.hint')}</div>
          </div>
          <div className="settings-radio-group mcp-permission-mode-group" role="group" aria-label={t('mcp.settings.permission')}>
            {MCP_PERMISSION_MODES.map((mode) => (
              <button
                type="button"
                key={mode}
                className={`settings-radio-btn ${mcpPermissionMode === mode ? 'active' : ''}`}
                aria-pressed={mcpPermissionMode === mode}
                onClick={() => update({ mcpPermissionMode: mode })}
              >
                <span>{t('mcp.settings.permission.' + mode)}</span>
                {mode === MCP_PERMISSION_DEFAULT && <span className="mcp-permission-recommended">{t('mcp.settings.recommended')}</span>}
              </button>
            ))}
          </div>
          <div className="mcp-permission-summary">{t('mcp.settings.permission.summary')}</div>
          <div className="mcp-permission-matrix-title">{t('mcp.settings.matrixTitle')}</div>
          <div className="mcp-permission-table-wrap">
            <table className="mcp-permission-table">
              <thead>
                <tr>
                  <th scope="col">{t('mcp.settings.capability')}</th>
                  {MCP_PERMISSION_MODES.map((mode) => (
                    <th scope="col" key={mode}>{t('mcp.settings.permission.' + mode)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MCP_PERMISSION_CAPABILITIES.map((capability) => (
                  <tr key={capability.key}>
                    <th scope="row">{t('mcp.settings.capability.' + capability.key)}</th>
                    {MCP_PERMISSION_MODES.map((mode) => {
                      const allowed = capability.allowed[mode]
                      return (
                        <td key={mode}>
                          <span className={`mcp-permission-mark ${allowed ? 'allowed' : 'blocked'}`} aria-label={t(allowed ? 'mcp.settings.allowed' : 'mcp.settings.blocked')}>
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
          <div className="settings-hint">{t('mcp.settings.permission.footnote')}</div>
          <div className="mcp-permission-examples">
            <div className="mcp-permission-matrix-title">{t('mcp.settings.examplesTitle')}</div>
            <div className="mcp-permission-example-list">
              {MCP_PERMISSION_MODES.map((mode) => (
                <div className="mcp-permission-example-card" key={mode}>
                  <div className="mcp-permission-example-title">
                    <span>{t('mcp.settings.permission.' + mode)}</span>
                    {mode === MCP_PERMISSION_DEFAULT && <span className="mcp-permission-recommended">{t('mcp.settings.recommended')}</span>}
                  </div>
                  <dl>
                    <div>
                      <dt>{t('mcp.settings.example.scenario')}</dt>
                      <dd>{t('mcp.settings.example.' + mode + '.scenario')}</dd>
                    </div>
                    <div>
                      <dt>{t('mcp.settings.example.config')}</dt>
                      <dd>{t('mcp.settings.example.' + mode + '.config')}</dd>
                    </div>
                    <div>
                      <dt>{t('mcp.settings.example.guard')}</dt>
                      <dd>{t('mcp.settings.example.' + mode + '.guard')}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      </FlatGroup>

      <FlatGroup title={t('mcp.settings.service.configTitle')}>
        <div className="mcp-settings-config-example">
          <div className="settings-hint">{t('mcp.settings.service.configHint')}</div>
          <pre><code>{t('mcp.settings.service.configExample')}</code></pre>
        </div>
      </FlatGroup>

      <div className="mcp-settings-note">{t('mcp.settings.privacyHint')}</div>
    </>
  )
}
