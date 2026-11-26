import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { isTauri } from '../../utils/tauri'
import { FlatGroup } from './FlatGroup'

type ComponentStatus = 'checking' | 'installed' | 'missing' | 'unavailable' | 'error'

export function SettingsComponentsSection({ busy = false, onInstall, onCheckUpdate }: {
  busy?: boolean
  onInstall?: () => void
  onCheckUpdate?: () => void
}) {
  const { t } = useI18n()
  const desktop = isTauri()
  const [status, setStatus] = useState<ComponentStatus>('checking')

  useEffect(() => {
    if (!desktop || busy) return
    let active = true
    invoke<boolean>('is_converter_component_installed').then(
      (installed) => { if (active) setStatus(installed ? 'installed' : 'missing') },
      (error: unknown) => { if (active) setStatus(error === 'component_unavailable' ? 'unavailable' : 'error') },
    )
    return () => { active = false }
  }, [desktop, busy])

  const statusKey = !desktop ? 'import.desktopOnly' : {
    checking: 'settings.components.checking',
    installed: 'import.componentReadyTitle',
    missing: 'settings.components.missing',
    unavailable: 'import.error.component_unavailable',
    error: 'settings.components.statusError',
  }[status]
  const action = status === 'installed' ? onCheckUpdate : status === 'missing' ? onInstall : undefined

  return (
    <FlatGroup title={t('settings.components.converter')}>
      <div className="settings-row">
        <div className="settings-label-group">
          <div className="settings-label" role="status">{t(statusKey)}</div>
          <div className="settings-hint">{t('settings.components.converterHint')}</div>
        </div>
        {desktop && action && (
          <button type="button" className="link-dialog-btn primary" onClick={action} disabled={busy}>
            {t(status === 'installed' ? 'settings.components.checkUpdates' : 'settings.components.download')}
          </button>
        )}
      </div>
    </FlatGroup>
  )
}
