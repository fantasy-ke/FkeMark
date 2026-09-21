import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../../i18n'
import type { AiAssistantAction, AiChatMessage, AppSettings } from '../../types'
import { MAX_AI_CONTEXT_CHARS, fetchAiModels, runAiChat } from '../../utils/aiAssistant'
import { runAgentHarness, type AgentToolEvent } from '../../utils/agent/harness'
import type { AgentFileChange } from '../../utils/agent/tools'
import { AgentChangeDialog } from './AgentChangeDialog'

export interface PendingAiContext {
  id: number
  text: string
}

export interface ActiveAiDocument {
  name: string
  content: string
}

type AiContextState =
  | { kind: 'selection'; text: string }
  | { kind: 'document' }

interface AiChatSidebarProps {
  open: boolean
  settings: AppSettings
  activeDocument?: ActiveAiDocument | null
  pendingContext: PendingAiContext | null
  /** 当前打开的文件夹，作为 Agent 工具的默认允许目录。 */
  currentFolder?: string | null
  /** Agent 写入文件后同步已打开的标签页。 */
  onAgentFileWritten?: (path: string, content: string) => void
  /** 在侧栏切换模型时写回全局设置，使聊天、Agent 与续写共用同一个模型。 */
  onModelChange?: (model: string) => void
  onClose: () => void
  onOpenSettings: () => void
}

interface AiChatConversation {
  id: string
  title: string
  messages: AiChatMessage[]
  updatedAt: number
}

const QUICK_ACTIONS: AiAssistantAction[] = ['continue', 'summarize', 'polish', 'translate']
const CHAT_HISTORY_KEY = 'fkemark:ai-chat-history:v1'
const MAX_CHAT_HISTORY = 20

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

export function AiChatSidebar({ open, settings, activeDocument, pendingContext, currentFolder, onAgentFileWritten, onModelChange, onClose, onOpenSettings }: AiChatSidebarProps) {
  const { t, language } = useI18n()
  const [conversations, setConversations] = useState<AiChatConversation[]>(loadChatHistory)
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id ?? createConversationId())
  const [messages, setMessages] = useState<AiChatMessage[]>(() => conversations[0]?.messages ?? [])
  const [draft, setDraft] = useState('')
  const [context, setContext] = useState<AiContextState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [agentMode, setAgentMode] = useState(false)
  const [agentEvents, setAgentEvents] = useState<AgentToolEvent[]>([])
  const [agentChanges, setAgentChanges] = useState<AgentFileChange[]>([])
  const [changesOpen, setChangesOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsBusy, setModelsBusy] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    saveChatHistory(conversations)
  }, [conversations])

  useEffect(() => {
    const text = pendingContext?.text.trim().slice(0, MAX_AI_CONTEXT_CHARS)
    if (!text) return
    setContext({ kind: 'selection', text })
    setError('')
  }, [pendingContext])

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    const node = messagesRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [agentEvents, messages, busy])

  function rememberConversation(nextMessages: AiChatMessage[], id = activeConversationId) {
    if (nextMessages.length === 0) {
      setConversations((current) => current.filter((conversation) => conversation.id !== id))
      return
    }
    const conversation: AiChatConversation = {
      id,
      title: createConversationTitle(nextMessages, t('ai.chat.untitled')),
      messages: nextMessages,
      updatedAt: Date.now(),
    }
    setConversations((current) => [
      conversation,
      ...current.filter((item) => item.id !== id),
    ].slice(0, MAX_CHAT_HISTORY))
  }

  function startNewConversation() {
    if (busy) return
    setActiveConversationId(createConversationId())
    setMessages([])
    setDraft('')
    setContext(null)
    setError('')
    setAgentEvents([])
    textareaRef.current?.focus()
  }

  function clearCurrentConversation() {
    if (busy || messages.length === 0) return
    rememberConversation([])
    setActiveConversationId(createConversationId())
    setMessages([])
    setError('')
    setAgentEvents([])
    textareaRef.current?.focus()
  }

  function selectConversation(id: string) {
    if (busy) return
    const conversation = conversations.find((item) => item.id === id)
    if (!conversation) return
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages)
    setDraft('')
    setContext(null)
    setError('')
    textareaRef.current?.focus()
  }

  async function loadModels() {
    if (modelsBusy) return
    setModelsBusy(true)
    setModelsError('')
    try {
      setModels(await fetchAiModels(settings))
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setModelsError(t('ai.settings.models.error', { detail }))
    } finally {
      setModelsBusy(false)
    }
  }

  const currentModel = settings.aiModel.trim()
  // 当前模型可能不在接口返回的列表里（例如手填的私有模型），始终保留为第一个选项。
  const modelOptions = currentModel && !models.includes(currentModel) ? [currentModel, ...models] : models

  const contextText = context?.kind === 'selection'
    ? context.text
    : context?.kind === 'document'
      ? activeDocument?.content.slice(0, MAX_AI_CONTEXT_CHARS).trim() ?? ''
      : ''
  const documentAttached = context?.kind === 'document'
  const contextHeading = context?.kind === 'document'
    ? t('ai.chat.documentContext', { name: activeDocument?.name ?? t('ai.chat.untitledDocument') })
    : t('ai.chat.selectedContext')
  const contextLabel = context?.kind === 'document'
    ? t('ai.chat.documentContextLabel', { name: activeDocument?.name ?? t('ai.chat.untitledDocument') })
    : t('ai.chat.contextLabel')
  const contextPreview = contextText.replace(/\s+/g, ' ').slice(0, 180)

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    if (busy || !settings.aiEnabled || (!draft.trim() && !contextText)) return

    const userMessage: AiChatMessage = {
      role: 'user',
      content: composeAiChatMessage(draft, contextText, {
        context: contextLabel,
        request: t('ai.chat.requestLabel'),
        contextOnly: t('ai.chat.contextOnlyPrompt'),
      }),
    }
    const requestMessages = [...messages, userMessage]
    setMessages(requestMessages)
    setDraft('')
    setContext(null)
    setError('')
    setBusy(true)

    if (agentMode) {
      setAgentEvents([])
      try {
        const result = await runAgentHarness({
          settings,
          messages: requestMessages,
          uiLanguage: language,
          currentFolder: currentFolder ?? null,
          onFileWritten: onAgentFileWritten,
          onEvent: (toolEvent) => setAgentEvents((current) => [...current, toolEvent]),
        })
        const finalMessages: AiChatMessage[] = [...requestMessages, { role: 'assistant', content: result.answer }]
        setMessages(finalMessages)
        rememberConversation(finalMessages)
        if (result.changes.length > 0) {
          setAgentChanges((current) => [...current, ...result.changes])
          setChangesOpen(true)
        }
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : String(reason)
        setMessages(requestMessages)
        rememberConversation(requestMessages)
        setError(t('ai.chat.error', { detail }))
      } finally {
        setBusy(false)
        textareaRef.current?.focus()
      }
      return
    }

    try {
      let streamedContent = ''
      setMessages([...requestMessages, { role: 'assistant', content: '' }])
      const content = await runAiChat(settings, requestMessages, language, (chunk) => {
        streamedContent += chunk
        setMessages([...requestMessages, { role: 'assistant', content: streamedContent }])
      })
      const finalMessages: AiChatMessage[] = [...requestMessages, { role: 'assistant', content: content || streamedContent }]
      setMessages(finalMessages)
      rememberConversation(finalMessages)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setMessages(requestMessages)
      rememberConversation(requestMessages)
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

  const activeHistoryId = conversations.some((conversation) => conversation.id === activeConversationId)
    ? activeConversationId
    : ''

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
              <button
                type="button"
                className={`ai-chat-agent-toggle${agentMode ? ' active' : ''}`}
                aria-pressed={agentMode}
                onClick={() => setAgentMode((current) => !current)}
                title={t(agentMode ? 'ai.agent.mode.on' : 'ai.agent.mode.off')}
              >
                <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 1 5 5L9 22H2v-7z"/><path d="M4 17h3v3"/></svg>
                <span>{t('ai.agent.mode.label')}</span>
              </button>
              {agentChanges.length > 0 && (
                <button
                  type="button"
                  className="ai-chat-changes-button"
                  onClick={() => setChangesOpen(true)}
                  title={t('ai.agent.changes.open')}
                >
                  <svg viewBox="0 0 24 24"><path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/><path d="M9 14h6M12 11v6"/></svg>
                  <span className="ai-chat-change-count">{agentChanges.length}</span>
                </button>
              )}
              <button type="button" onClick={startNewConversation} disabled={busy} title={t('ai.chat.newConversation')}>
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              </button>
              <button type="button" onClick={clearCurrentConversation} disabled={busy || messages.length === 0} title={t('ai.chat.clear')}>
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
              {conversations.length > 0 && (
                <div className="ai-chat-history-row">
                  <span>{t('ai.chat.history')}</span>
                  <select value={activeHistoryId} onChange={(event) => selectConversation(event.target.value)} disabled={busy}>
                    {!activeHistoryId && <option value="">{t('ai.chat.currentConversation')}</option>}
                    {conversations.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="ai-chat-messages" ref={messagesRef}>
                {messages.length === 0 && (
                  <div className="ai-chat-welcome">
                    <div className="ai-chat-welcome-icon">AI</div>
                    <p>{t('ai.chat.welcome')}</p>
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`ai-chat-message ${message.role}`}>
                    <div className="ai-chat-message-role">{message.role === 'assistant' ? 'AI' : t('ai.chat.you')}</div>
                    <div className="ai-chat-message-content">{message.content}</div>
                  </div>
                ))}
                {agentEvents.map((toolEvent, index) => (
                  <div
                    key={`${toolEvent.tool}-${index}`}
                    className={`ai-chat-tool-event${toolEvent.ok ? '' : ' is-error'}`}
                  >
                    <span className="ai-chat-tool-step">{toolEvent.step}</span>
                    <span>{toolEvent.summary}</span>
                  </div>
                ))}
                {busy && <div className="ai-chat-thinking"><span /><span /><span />{t(agentMode ? 'ai.agent.working' : 'ai.chat.loading')}</div>}
                {error && <div className="ai-chat-error">{error}</div>}
              </div>

              <form className="ai-chat-composer" onSubmit={sendMessage}>
                <div className="ai-chat-model-row">
                  <span>{t('ai.settings.model')}</span>
                  <select
                    value={currentModel}
                    onChange={(event) => onModelChange?.(event.target.value)}
                    disabled={busy || modelsBusy}
                    aria-label={t('ai.settings.model')}
                  >
                    {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                  <button
                    type="button"
                    className="ai-chat-model-fetch"
                    onClick={() => void loadModels()}
                    disabled={modelsBusy}
                    title={t(modelsBusy ? 'ai.settings.models.loading' : 'ai.settings.models.fetch')}
                    aria-label={t(modelsBusy ? 'ai.settings.models.loading' : 'ai.settings.models.fetch')}
                  >
                    <svg viewBox="0 0 24 24"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4v5h-5"/></svg>
                  </button>
                </div>
                {modelsError && <div className="ai-chat-model-error" role="status">{modelsError}</div>}
                {agentMode && (
                  <div className="ai-chat-agent-hint">
                    {t('ai.agent.hint', {
                      mode: t(`mcp.settings.permission.${settings.mcpPermissionMode ?? 'data-read-write'}`),
                    })}
                  </div>
                )}
                <button
                  type="button"
                  className={`ai-chat-document-button ${documentAttached ? 'active' : ''}`}
                  onClick={() => setContext(documentAttached ? null : { kind: 'document' })}
                  disabled={!activeDocument?.content}
                  aria-pressed={documentAttached}
                  title={activeDocument?.content ? t('ai.chat.attachDocument') : t('ai.chat.noActiveDocument')}
                >
                  <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/></svg>
                  <span>{documentAttached ? t('ai.chat.documentAttached') : t('ai.chat.attachDocument')}</span>
                  {activeDocument?.name && <small>{activeDocument.name}</small>}
                </button>
                {contextText && (
                  <div className="ai-chat-context">
                    <div>
                      <strong>{contextHeading}</strong>
                      <span>{contextPreview}</span>
                    </div>
                    <button type="button" onClick={() => setContext(null)} title={t('ai.chat.removeContext')}>&times;</button>
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
                  <button type="submit" className="ai-chat-send" disabled={busy || (!draft.trim() && !contextText)} title={t('ai.chat.send')}>
                    <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                  </button>
                </div>
              </form>
              {changesOpen && (
                <AgentChangeDialog changes={agentChanges} onClose={() => setChangesOpen(false)} />
              )}
            </>
          )}
        </>
      )}
    </aside>
  )
}

function createConversationId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function loadChatHistory(): AiChatConversation[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    const value = raw ? JSON.parse(raw) : []
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is AiChatConversation => Boolean(item?.id && Array.isArray(item?.messages)))
      .slice(0, MAX_CHAT_HISTORY)
  } catch {
    return []
  }
}

function saveChatHistory(conversations: AiChatConversation[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations))
  } catch {
    // Ignore storage quota and private-mode failures.
  }
}

function createConversationTitle(messages: AiChatMessage[], fallback: string): string {
  const firstUser = messages.find((message) => message.role === 'user')
  const line = firstUser?.content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !item.endsWith(':'))
  if (!line) return fallback
  return line.length > 36 ? `${line.slice(0, 36)}…` : line
}