import { useEffect, useState } from 'react'
import type { AiAssistantAction } from '../../types'
import type { EditorAiAssistantController } from './useEditorAiAssistant'

interface AiAssistantProps {
  ai: EditorAiAssistantController
  t: (key: string, params?: Record<string, string | number>) => string
}

const AI_ACTIONS: AiAssistantAction[] = ['continue', 'summarize', 'polish', 'translate']

export function AiAssistantMenu({ ai, t }: AiAssistantProps) {
  const [open, setOpen] = useState(false)
  const disabled = !ai.enabled || ai.busy

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="ai-assistant-menu">
      <button
        className={`tb-btn ai-assistant-trigger ${open ? 'active' : ''}`}
        title={disabled ? t('ai.menu.disabled') : t('toolbar.ai')}
        disabled={ai.busy}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!ai.enabled) {
            ai.runAction('continue')
            return
          }
          setOpen((value) => !value)
        }}
      >
        AI
      </button>
      {open && ai.enabled && (
        <div className="ai-assistant-dropdown" role="menu">
          {AI_ACTIONS.map((action) => (
            <button
              key={action}
              className="ai-assistant-menu-item"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false)
                ai.runAction(action)
              }}
            >
              {t(`ai.action.${action}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function AiAssistantPanel({ ai, t }: AiAssistantProps) {
  useEffect(() => {
    if (!ai.panelOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') ai.closePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ai])

  if (!ai.panelOpen) return null

  const title = ai.action ? `${t('toolbar.ai')} - ${t(`ai.action.${ai.action}`)}` : t('toolbar.ai')
  const replaceLabel = ai.canReplaceSelection ? t('ai.panel.replaceSelection') : t('ai.panel.replaceDocument')

  return (
    <div className="ai-assistant-panel-overlay" onMouseDown={(event) => event.stopPropagation()}>
      <div className="ai-assistant-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ai-assistant-panel-header">
          <div className="ai-assistant-panel-title">{title}</div>
          <button className="ai-assistant-close" onClick={ai.closePanel} title={t('ai.panel.close')}>&times;</button>
        </div>

        {ai.busy && <div className="ai-assistant-loading">{t('ai.panel.loading')}</div>}

        {!ai.busy && ai.error && (
          <div className="ai-assistant-error">
            <div>{t('common.error')}</div>
            <pre>{ai.error}</pre>
          </div>
        )}

        {!ai.busy && ai.result && (
          <textarea
            className="ai-assistant-result"
            value={ai.result}
            readOnly
            spellCheck={false}
          />
        )}

        <div className="ai-assistant-panel-actions">
          {ai.result && (
            <>
              <button className="link-dialog-btn" onClick={() => ai.applyResult('insert')}>{t('ai.panel.insert')}</button>
              <button className="link-dialog-btn ok" onClick={() => ai.applyResult('replace')}>{replaceLabel}</button>
            </>
          )}
          <button className="link-dialog-btn cancel" onClick={ai.closePanel}>{t('ai.panel.close')}</button>
        </div>
      </div>
    </div>
  )
}
