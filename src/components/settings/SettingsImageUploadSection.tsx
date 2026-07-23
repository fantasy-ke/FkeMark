import type { AppSettings, ImageUploadMode } from '../../types'
import { FlatGroup } from './FlatGroup'

interface SettingsImageUploadSectionProps {
  t: (key: string, params?: Record<string, string | number>) => string
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

const MODES: ImageUploadMode[] = ['local', 'smms', 'custom', 'webdav', 'base64']

interface FieldProps {
  label: string
  hint?: string
  type?: 'text' | 'url' | 'password'
  value: string
  onChange: (value: string) => void
}

function SettingsField({ label, hint, type = 'text', value, onChange }: FieldProps) {
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

export function SettingsImageUploadSection({ t, settings, update }: SettingsImageUploadSectionProps) {
  return (
    <>
      <h2 className="settings-content-title">{t('settings.group.imageUpload')}</h2>

      <FlatGroup title={t('imageUpload.settings.mode')}>
        <div className="settings-row">
          <div className="settings-label-group">
            <div className="settings-label">{t('imageUpload.settings.mode')}</div>
            <div className="settings-hint">{t('imageUpload.settings.mode.hint')}</div>
          </div>
          <div className="settings-radio-group image-upload-mode-group">
            {MODES.map((mode) => (
              <button
                key={mode}
                className={`settings-radio-btn ${settings.imageUploadMode === mode ? 'active' : ''}`}
                onClick={() => update({ imageUploadMode: mode })}
              >
                {t(`imageUpload.mode.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      </FlatGroup>

      {settings.imageUploadMode === 'smms' && (
        <FlatGroup title={t('imageUpload.mode.smms')}>
          <SettingsField
            label={t('imageUpload.settings.smmsToken')}
            hint={t('imageUpload.settings.smmsToken.hint')}
            type="password"
            value={settings.smmsToken}
            onChange={(smmsToken) => update({ smmsToken })}
          />
        </FlatGroup>
      )}

      {settings.imageUploadMode === 'custom' && (
        <FlatGroup title={t('imageUpload.mode.custom')}>
          <SettingsField
            label={t('imageUpload.settings.customUrl')}
            hint={t('imageUpload.settings.customUrl.hint')}
            type="url"
            value={settings.customImageUploadUrl}
            onChange={(customImageUploadUrl) => update({ customImageUploadUrl })}
          />
          <SettingsField
            label={t('imageUpload.settings.customToken')}
            hint={t('imageUpload.settings.customToken.hint')}
            type="password"
            value={settings.customImageUploadToken}
            onChange={(customImageUploadToken) => update({ customImageUploadToken })}
          />
        </FlatGroup>
      )}

      {settings.imageUploadMode === 'webdav' && (
        <FlatGroup title={t('imageUpload.mode.webdav')}>
          <SettingsField
            label={t('imageUpload.settings.webdavUrl')}
            hint={t('imageUpload.settings.webdavUrl.hint')}
            type="url"
            value={settings.webdavUrl}
            onChange={(webdavUrl) => update({ webdavUrl })}
          />
          <SettingsField
            label={t('imageUpload.settings.webdavPublicUrl')}
            hint={t('imageUpload.settings.webdavPublicUrl.hint')}
            type="url"
            value={settings.webdavPublicUrl}
            onChange={(webdavPublicUrl) => update({ webdavPublicUrl })}
          />
          <SettingsField
            label={t('imageUpload.settings.webdavUsername')}
            value={settings.webdavUsername}
            onChange={(webdavUsername) => update({ webdavUsername })}
          />
          <SettingsField
            label={t('imageUpload.settings.webdavPassword')}
            type="password"
            value={settings.webdavPassword}
            onChange={(webdavPassword) => update({ webdavPassword })}
          />
        </FlatGroup>
      )}

      <div className="image-upload-settings-note">
        {t(`imageUpload.settings.note.${settings.imageUploadMode}`)}
      </div>
    </>
  )
}
