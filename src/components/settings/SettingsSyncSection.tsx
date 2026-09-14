import type { AppSettings } from '../../types'
import { FlatGroup } from './FlatGroup'

interface SettingsSyncSectionProps {
  t: (key: string, params?: Record<string, string | number>) => string
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

interface SyncFieldProps {
  label: string
  hint?: string
  type?: 'text' | 'url' | 'password'
  value: string
  onChange: (value: string) => void
}

function SyncField({ label, hint, type = 'text', value, onChange }: SyncFieldProps) {
  return (
    <div className="settings-row image-upload-settings-row-stack">
      <div className="settings-label-group">
        <div className="settings-label">{label}</div>
        {hint && <div className="settings-hint">{hint}</div>}
      </div>
      <input
        className="image-upload-settings-input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </div>
  )
}

export function SettingsSyncSection({ t, settings, update }: SettingsSyncSectionProps) {
  return (
    <>
      <h2 className="settings-content-title">{t('settings.group.sync')}</h2>
      <FlatGroup title={t('webdavSync.title')}>
        <div className="settings-row">
          <div className="settings-label-group">
            <div className="settings-label">{t('webdavSync.enabled')}</div>
            <div className="settings-hint">{t('webdavSync.enabled.hint')}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.webdavSyncEnabled}
              onChange={(event) => update({ webdavSyncEnabled: event.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        {settings.webdavSyncEnabled && (
          <>
            <SyncField
              label={t('webdavSync.url')}
              hint={t('webdavSync.url.hint')}
              type="url"
              value={settings.webdavSyncUrl}
              onChange={(webdavSyncUrl) => update({ webdavSyncUrl })}
            />
            <SyncField
              label={t('webdavSync.root')}
              hint={t('webdavSync.root.hint')}
              value={settings.webdavSyncRoot}
              onChange={(webdavSyncRoot) => update({ webdavSyncRoot })}
            />
            <SyncField
              label={t('webdavSync.fileName')}
              hint={t('webdavSync.fileName.hint')}
              value={settings.webdavSyncFileName}
              onChange={(webdavSyncFileName) => update({ webdavSyncFileName })}
            />
            <SyncField
              label={t('webdavSync.username')}
              value={settings.webdavSyncUsername}
              onChange={(webdavSyncUsername) => update({ webdavSyncUsername })}
            />
            <SyncField
              label={t('webdavSync.password')}
              type="password"
              value={settings.webdavSyncPassword}
              onChange={(webdavSyncPassword) => update({ webdavSyncPassword })}
            />
          </>
        )}
      </FlatGroup>
      <div className="image-upload-settings-note">{t('webdavSync.note')}</div>
    </>
  )
}
