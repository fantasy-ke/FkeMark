import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { isTauri } from '../../utils/tauri'
import { FlatGroup } from './FlatGroup'

type ComponentStatus = 'checking' | 'installed' | 'missing' | 'unavailable' | 'error'
type OcrStatus = 'missing' | 'downloading' | 'installed' | null

interface WechatOcrControls {
  ocr: OcrStatus
  ocrError: string
  installOcr: () => Promise<void>
}

export function useWechatOcr(visible: boolean): WechatOcrControls {
  const installing = useRef(false)
  const [ocr, setOcr] = useState<OcrStatus>(null)
  const [ocrError, setOcrError] = useState('')

  useEffect(() => {
    if (!visible || !isTauri() || installing.current) return
    let active = true
    void invoke<boolean | null>('is_wechat_ocr_installed').then(installed => {
      if (active && !installing.current && typeof installed === 'boolean') setOcr(installed ? 'installed' : 'missing')
    }, () => {})
    return () => { active = false }
  }, [visible])

  const installOcr = async () => {
    if (ocr !== 'missing' || installing.current) return
    installing.current = true
    setOcrError('')
    setOcr('downloading')
    try {
      await invoke('install_wechat_ocr')
      setOcr('installed')
    } catch (error) {
      const code = typeof error === 'string' && [
        'component_integrity_failed', 'wechat_ocr_network_failed', 'wechat_ocr_install_busy',
      ].includes(error) ? error : 'wechat_ocr_install_failed'
      setOcrError(`import.error.${code}`)
      setOcr('missing')
    } finally {
      installing.current = false
    }
  }
  return { ocr, ocrError, installOcr }
}

export function SettingsComponentsSection({ busy = false, onInstall, onCheckUpdate, wechatOcr }: {
  busy?: boolean
  onInstall?: () => void
  onCheckUpdate?: () => void
  wechatOcr: WechatOcrControls
}) {
  const { t } = useI18n()
  const desktop = isTauri()
  const [status, setStatus] = useState<ComponentStatus>('checking')
  const { ocr, ocrError, installOcr } = wechatOcr

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
    <>
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
      {ocr && (
        <FlatGroup title={t('settings.components.wechatOcr')}>
          <div className="settings-row">
            <div className="settings-label-group">
              <div className="settings-label" role="status">{t(`settings.components.wechatOcr.${ocr}`)}</div>
              <div className="settings-hint">{t('settings.components.wechatOcrHint')}</div>
              {ocrError && <div className="settings-hint" role="alert">{t(ocrError)}</div>}
            </div>
            {ocr === 'missing' && (
              <button type="button" className="link-dialog-btn primary" onClick={() => void installOcr()}>
                {t('settings.components.downloadWechatOcr')}
              </button>
            )}
          </div>
        </FlatGroup>
      )}
    </>
  )
}
