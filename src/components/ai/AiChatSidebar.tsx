import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../../i18n'
import type { AiAssistantAction, AiChatMessage, AppSettings } from '../../types'
import { runAiChat } from '../../utils/aiAssistant'

export interface PendingAiContext {
  id: number
  text: string
}

interface AiChatSidebarProps {
  open: boolean
  settings: AppSettings
  pendingContext: PendingAiContext | null
  onClose: () => void
  onOpenSettings: () => void
}

const QUICK_ACTIONS: AiAssistantAction[] = ['continue', 'summarize', 'polish', 'translate']

export function composeAiChatMessage(
  question: string,
  context: string,
  labels: { context: string; request: string; contextOnly: string },
): string {
  const parts: string[] = []
  if (context.trim()) parts.push(`${labels.context}:\n\n${context.trim()}`)
  parts.push(`${labels.request}:\n\n${question.trim() || labels.contextOnly}`)
  return parts.join('\n\n')
}

export function AiChatSidebar({ open, settings, pendingContext, onClose, onOpenSettings }: AiChatSidebarProps) {
  const { t, language } = useI18n()
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [context, setContext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pendingContext?.text.trim()) return
    setContext(pendingContext.text.trim())
    setError('')
  }, [pendingContext])

  useEffect(() => {
    if (!open) return
    textareaRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    const node = messagesRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, busy])

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    if (busy || !settings.aiEnabled || (!draft.trim() && !context.trim())) return

    const userMessage: AiChatMessage = {
      role: 'user',
      content: composeAiChatMessage(draft, context, {
        context: t('ai.chat.contextLabel'),
        request: t('ai.chat.requestLabel'),
        contextOnly: t('ai.chat.contextOnlyPrompt'),
      }),
    }
    const requestMessages = [...messages, userMessage]
    setMessages(requestMessages)
    setDraft('')
    setContext('')
    setError('')
    setBusy(true)
    try {
      const content = await runAiChat(settings, requestMessages, language)
      setMessages((current) => [...current, { role: 'assistant', content }])
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setError(t('ai.chat.error', { detail }))
    } finally {
      setBusy(false)
      textareaRef.current?.focus()
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void sendMessage()
  }

  return (
    <aside className={`ai-chat-sidebar ${open ? 'open' : ''}`} aria-hidden={!open}>
      {open && (
        <>
          <header className="ai-chat-header">
            <div>
              <div className="ai-chat-title">{t('ai.chat.title')}</div>
              <div className="ai-chat-subtitle">{t('ai.chat.subtitle')}</div>
            </div>
            <div className="ai-chat-header-actions">
              <button type="button" onClick={() => { setMessages([]); setError('') }} disabled={busy || messages.length === 0} title={t('ai.chat.clear')}>
                <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
              </button>
              <button type="button" onClick={onClose} title={t('ai.chat.close')}>
                <svg viewBox="0 0 24 24"><path d="m18 6-12 12M6 6l12 12"/></svg>
              </button>
            </div>
          </header>

          {!settings.aiEnabled ? (
            <div className="ai-chat-disabled">
              <div className="ai-chat-disabled-icon">AI</div>
              <strong>{t('ai.chat.notEnabledTitle')}</strong>
              <span>{t('ai.chat.notEnabledHint')}</span>
              <button type="button" className="link-dialog-btn ok" onClick={onOpenSettings}>{t('ai.chat.openSettings')}</button>
            </div>
          ) : (
            <>
              <div className="ai-chat-messages" ref={messagesRef}>
                {messages.length === 0 && (
                  <div className="ai-chat-welcome">
                    <div className="ai-chat-welcome-icon">?</div>
                    <p>{t('ai.chat.welcome')}</p>
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`ai-chat-message ${message.role}`}>
                    <div className="ai-chat-message-role">{message.role === 'assistant' ? 'AI' : t('ai.chat.you')}</div>
                    <div className="ai-chat-message-content">{message.content}</div>
                  </div>
                ))}
                {busy && <div className="ai-chat-thinking"><span /><span /><span />{t('ai.chat.loading')}</div>}
                {error && <div className="ai-chat-error">{error}</div>}
              </div>

              <form className="ai-chat-composer" onSubmit={sendMessage}>
                {context && (
                  <div className="ai-chat-context">
                    <div>
                      <strong>{t('ai.chat.selectedContext')}</strong>
                      <span>{context}</span>
                    </div>
                    <button type="button" onClick={() => setContext('')} title={t('ai.chat.removeContext')}>&times;</button>
                  </div>
                )}
                <div className="ai-chat-quick-actions">
                  {QUICK_ACTIONS.map((action) => (
                    <button key={action} type="button" onClick={() => { setDraft(t(`ai.chat.prompt.${action}`)); textareaRef.current?.focus() }}>
                      {t(`ai.action.${action}`)}
                    </button>
                  ))}
                </div>
                <div className="ai-chat-input-row">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={t('ai.chat.placeholder')}
                    rows={3}
                  />
                  <button type="submit" className="ai-chat-send" disabled={busy || (!draft.trim() && !context.trim())} title={t('ai.chat.send')}>
                    <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </aside>
  )
}
