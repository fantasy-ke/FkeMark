import type { AiAssistantAction, AiChatMessage, AiProvider, AiUpstreamFormat, AppSettings } from '../types'
import { isTauri } from './tauri'
import { sanitizeAiCompletion } from './aiGhostText'

export const DEFAULT_LOCAL_AI_ENDPOINT = 'http://localhost:11434/v1'
export const DEFAULT_API_AI_ENDPOINT = 'https://api.openai.com/v1'
export const DEFAULT_ANTHROPIC_AI_ENDPOINT = 'https://api.anthropic.com/v1'
export const DEFAULT_MARKDOWN_AI_PROMPT = 'You are an AI assistant for Markdown writing. Help the user reason, edit, and organize content while preserving Markdown structure. Respond in the user\'s language unless asked otherwise.'
export const MAX_AI_CONTEXT_CHARS = 12_000

// Tab 半自动续写的系统指令。幽灵建议是行内灰字，因此禁止 Markdown 语法与换行。
export const GHOST_TEXT_INSTRUCTION = [
  'Continue the document exactly from the end of the text given by the user.',
  'Reply with the continuation only: no explanation, no repetition of the given text, no Markdown syntax, no headings, no list markers, no code fences, no quotation marks.',
  'Keep it to one sentence of at most 25 words and match the language of the document.',
  'If no useful continuation is possible, reply with NONE.',
].join(' ')

const AI_FORMAT_PATHS: Record<AiUpstreamFormat, string> = {
  'chat-completions': '/chat/completions',
  responses: '/responses',
  'anthropic-messages': '/messages',
}

export interface AiRequestMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AiRequestBody {
  model: string
  messages: AiRequestMessage[]
  temperature: number
  stream: boolean
}

export type AiStreamHandler = (chunk: string) => void

/**
 * 流式请求的用户控制：停止与暂停。
 * 停止会中断请求并保留已生成内容；暂停只阻塞本地读取，服务端仍在继续生成。
 */
export interface AiStreamControl {
  signal?: AbortSignal
  /** 暂停期间返回未完成的 Promise，恢复后 resolve。 */
  waitWhilePaused?: () => Promise<void>
}

const ACTION_PROMPTS: Record<AiAssistantAction, string> = {
  continue: 'Continue the Markdown naturally. Keep the original tone, structure, and language. Do not repeat the given text.',
  summarize: 'Summarize the Markdown into a concise, well-structured summary. Preserve important facts and action items.',
  polish: 'Polish the Markdown for clarity, flow, and readability. Keep the original meaning and do not invent new facts.',
  translate: 'Translate the Markdown to {targetLanguage}. Preserve Markdown structure, links, code blocks, and factual meaning.',
}

export function getAiActionLabel(action: AiAssistantAction): string {
  switch (action) {
    case 'continue': return 'Continue'
    case 'summarize': return 'Summarize'
    case 'polish': return 'Polish'
    case 'translate': return 'Translate'
  }
}

export function getAiUpstreamFormat(settings: Pick<AppSettings, 'aiUpstreamFormat'>): AiUpstreamFormat {
  return settings.aiUpstreamFormat || 'chat-completions'
}

export function getAiFormatPath(format: AiUpstreamFormat): string {
  return AI_FORMAT_PATHS[format]
}

export function getDefaultAiEndpoint(provider: AiProvider, format: AiUpstreamFormat): string {
  if (provider === 'local') return DEFAULT_LOCAL_AI_ENDPOINT
  return format === 'anthropic-messages' ? DEFAULT_ANTHROPIC_AI_ENDPOINT : DEFAULT_API_AI_ENDPOINT
}

export function limitAiInput(input: string, action: AiAssistantAction, maxChars = MAX_AI_CONTEXT_CHARS): string {
  const text = input.trim()
  if (text.length <= maxChars) return text
  return action === 'continue' ? text.slice(-maxChars) : text.slice(0, maxChars)
}

export function limitAiChatMessages(messages: AiChatMessage[], maxChars = MAX_AI_CONTEXT_CHARS): AiChatMessage[] {
  const result: AiChatMessage[] = []
  let remaining = maxChars
  for (let index = messages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = messages[index]
    const content = message.content.trim()
    if (!content) continue
    if (content.length > remaining) {
      result.unshift({ ...message, content: content.slice(-remaining) })
      break
    }
    result.unshift({ ...message, content })
    remaining -= content.length
  }
  return result
}

export function normalizeAiEndpoint(
  endpoint: string,
  provider: AiProvider,
  format: AiUpstreamFormat = 'chat-completions',
  useFullUrl = false,
): string {
  const url = parseAiUrl(endpoint, provider, format)
  if (!useFullUrl) {
    url.pathname = `${stripKnownAiPath(url.pathname)}${AI_FORMAT_PATHS[format]}`
  }
  return serializeAiUrl(url)
}

export function normalizeAiModelsEndpoint(
  endpoint: string,
  provider: AiProvider,
  format: AiUpstreamFormat = 'chat-completions',
): string {
  const url = parseAiUrl(endpoint, provider, format)
  url.pathname = `${stripKnownAiPath(url.pathname)}/models`
  return serializeAiUrl(url)
}

export function buildAiMessages(
  action: AiAssistantAction,
  input: string,
  uiLanguage: string,
  targetLanguage: string,
  markdownPrompt = DEFAULT_MARKDOWN_AI_PROMPT,
): AiRequestMessage[] {
  const instruction = ACTION_PROMPTS[action].replace('{targetLanguage}', targetLanguage.trim() || 'English')
  const limitedInput = limitAiInput(input, action)
  return [
    {
      role: 'system',
      content: [
        markdownPrompt.trim() || DEFAULT_MARKDOWN_AI_PROMPT,
        'Return only the Markdown result. Do not wrap the answer in code fences unless the content itself needs code fences.',
        `The application UI language is ${uiLanguage}.`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${instruction}\n\nMarkdown:\n${limitedInput}`,
    },
  ]
}

export function buildAiRequestBody(
  settings: AppSettings,
  action: AiAssistantAction,
  input: string,
  uiLanguage: string,
): AiRequestBody {
  return createRequestBody(
    settings,
    buildAiMessages(action, input, uiLanguage, settings.aiTargetLanguage, settings.aiMarkdownPrompt),
  )
}

/** 构造 Tab 半自动续写的请求消息。 */
export function buildAiCompletionMessages(
  settings: AppSettings,
  input: string,
  uiLanguage: string,
): AiRequestMessage[] {
  return [
    {
      role: 'system',
      content: [
        settings.aiMarkdownPrompt.trim() || DEFAULT_MARKDOWN_AI_PROMPT,
        GHOST_TEXT_INSTRUCTION,
        `The application UI language is ${uiLanguage}.`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Document text before the cursor:\n\n${limitAiInput(input, 'continue')}`,
    },
  ]
}

/**
 * 请求一条行内续写建议。返回 null 表示模型没有给出可用续写（例如回答 NONE）。
 */
export async function runAiCompletion(
  settings: AppSettings,
  input: string,
  uiLanguage: string,
): Promise<string | null> {
  if (!settings.aiEnabled) throw new Error('AI assistant is disabled')
  const text = input.trim()
  if (!text) return null
  const requestBody = createRequestBody(settings, buildAiCompletionMessages(settings, text, uiLanguage))
  return sanitizeAiCompletion(await performAiRequest(settings, requestBody), text)
}

export function buildAiChatMessages(
  settings: AppSettings,
  messages: AiChatMessage[],
  uiLanguage: string,
): AiRequestMessage[] {  return [
    {
      role: 'system',
      content: [
        settings.aiMarkdownPrompt.trim() || DEFAULT_MARKDOWN_AI_PROMPT,
        `The application UI language is ${uiLanguage}.`,
        'Use Markdown when it improves the answer.',
      ].join('\n'),
    },
    ...limitAiChatMessages(messages),
  ]
}

export function buildAiChatRequestBody(
  settings: AppSettings,
  messages: AiChatMessage[],
  uiLanguage: string,
): AiRequestBody {
  return createRequestBody(settings, buildAiChatMessages(settings, messages, uiLanguage))
}

export function buildAiProviderRequestBody(
  settings: AppSettings,
  requestBody: AiRequestBody,
  stream: boolean,
): Record<string, unknown> {
  const format = getAiUpstreamFormat(settings)
  if (format === 'responses') {
    return {
      model: requestBody.model,
      input: requestBody.messages,
      temperature: requestBody.temperature,
      stream,
    }
  }
  if (format === 'anthropic-messages') {
    const system = requestBody.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
    return {
      model: requestBody.model,
      ...(system ? { system } : {}),
      messages: requestBody.messages.filter((message) => message.role !== 'system'),
      max_tokens: 4096,
      temperature: Math.min(1, requestBody.temperature),
      stream,
    }
  }
  return { ...requestBody, stream }
}

export function extractAiContent(payload: unknown): string {
  const data = payload as any
  const choice = data?.choices?.[0]
  const content = choice?.message?.content
    ?? choice?.text
    ?? data?.output_text
    ?? data?.output
    ?? data?.content
    ?? data?.message?.content
    ?? data?.response
  const text = contentToText(content).trim()
  if (!text) throw new Error('AI returned an empty result')
  return text
}

export function extractAiModels(payload: unknown): string[] {
  const data = payload as any
  const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []
  return Array.from(new Set(models
    .map((model: any) => typeof model === 'string' ? model : model?.id ?? model?.name ?? model?.model)
    .filter((model: unknown): model is string => typeof model === 'string' && Boolean(model.trim()))))
}

export async function runAiAssistant(
  settings: AppSettings,
  action: AiAssistantAction,
  input: string,
  uiLanguage: string,
): Promise<string> {
  if (!input.trim()) throw new Error('No Markdown content was provided')
  return runAiRequest(settings, buildAiRequestBody(settings, action, input, uiLanguage))
}

export async function runAiChat(
  settings: AppSettings,
  messages: AiChatMessage[],
  uiLanguage: string,
  onChunk?: AiStreamHandler,
  control?: AiStreamControl,
): Promise<string> {
  if (!messages.some((message) => message.content.trim())) throw new Error('No chat content was provided')
  const body = buildAiChatRequestBody(settings, messages, uiLanguage)
  return onChunk ? runAiStreamingRequest(settings, body, onChunk, control) : runAiRequest(settings, body)
}

export async function testAiConnection(settings: AppSettings): Promise<string> {
  const requestBody = createRequestBody(settings, [
    { role: 'user', content: 'Reply with OK.' },
  ])
  return performAiRequest(settings, requestBody)
}

export async function fetchAiModels(settings: AppSettings): Promise<string[]> {
  const format = getAiUpstreamFormat(settings)
  const endpoint = normalizeAiModelsEndpoint(settings.aiEndpoint, settings.aiProvider, format)
  const response = await request(endpoint, {
    method: 'GET',
    headers: createAiHeaders(settings, 'application/json', false),
  })
  if (!response.ok) throw await createResponseError(response, 'AI model list request failed')
  const models = extractAiModels(await response.json())
  if (!models.length) throw new Error('AI model list is empty')
  return models
}

async function runAiRequest(settings: AppSettings, requestBody: AiRequestBody): Promise<string> {
  if (!settings.aiEnabled) throw new Error('AI assistant is disabled')
  return performAiRequest(settings, requestBody)
}

async function performAiRequest(settings: AppSettings, requestBody: AiRequestBody): Promise<string> {
  const format = getAiUpstreamFormat(settings)
  const endpoint = normalizeAiEndpoint(settings.aiEndpoint, settings.aiProvider, format, Boolean(settings.aiUseFullUrl))
  const headers = createAiHeaders(settings, 'application/json')
  const body = JSON.stringify(buildAiProviderRequestBody(settings, requestBody, false))
  const response = await request(endpoint, { method: 'POST', headers, body })
  if (!response.ok) throw await createResponseError(response, 'AI request failed')
  return extractAiContent(await response.json())
}

async function runAiStreamingRequest(
  settings: AppSettings,
  requestBody: AiRequestBody,
  onChunk: AiStreamHandler,
  control?: AiStreamControl,
): Promise<string> {
  if (!settings.aiEnabled) throw new Error('AI assistant is disabled')
  const format = getAiUpstreamFormat(settings)
  const endpoint = normalizeAiEndpoint(settings.aiEndpoint, settings.aiProvider, format, Boolean(settings.aiUseFullUrl))
  const headers = createAiHeaders(settings, 'text/event-stream')
  const body = JSON.stringify(buildAiProviderRequestBody(settings, requestBody, true))
  const signal = control?.signal
  const response = await request(endpoint, { method: 'POST', headers, body, signal })
  if (!response.ok) throw await createResponseError(response, 'AI request failed')
  if (!response.body) return performAiRequest(settings, requestBody)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  // 停止时必须立即取消读取：否则流空闲时 await reader.read() 会一直挂起，
  // 循环顶部的中止检查永远等不到执行。
  const cancelOnAbort = () => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', cancelOnAbort)
  if (signal?.aborted) cancelOnAbort()
  let pending = ''
  let result = ''
  let done = false

  try {
    while (!done) {
      // 用户停止：立刻结束本地消费，保留已生成内容。
      if (signal?.aborted) break
      // 用户暂停：阻塞在这里，恢复后才继续读取下一段。
      if (control?.waitWhilePaused) await control.waitWhilePaused()
      const next = await reader.read()
      done = next.done
      // 读取期间可能刚被暂停：先挂起再追加，保证暂停后界面不再增长。
      if (control?.waitWhilePaused) await control.waitWhilePaused()
      if (signal?.aborted) break
      pending += decoder.decode(next.value || new Uint8Array(), { stream: !done })
      pending = readStreamLines(pending, (line) => {
        const chunk = extractAiStreamChunk(line)
        if (!chunk) return
        result += chunk
        onChunk(chunk)
      })
    }
  } catch (error) {
    // 中断请求会抛 AbortError，属预期的用户操作，不作为错误上报。
    if (!signal?.aborted) throw error
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
    if (signal?.aborted) await reader.cancel().catch(() => undefined)
  }

  if (pending.trim()) {
    const chunk = extractAiStreamChunk(pending.trim())
    if (chunk) {
      result += chunk
      onChunk(chunk)
    }
  }
  const text = result.trim()
  // 用户主动停止时允许结果为空，避免把「停止」显示成请求失败。
  if (!text && !signal?.aborted) throw new Error('AI returned an empty result')
  return text
}

function createAiHeaders(settings: AppSettings, accept: string, includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept }
  if (includeContentType) headers['Content-Type'] = 'application/json'
  const apiKey = settings.aiApiKey.trim()
  if (getAiUpstreamFormat(settings) === 'anthropic-messages') {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

function createRequestBody(settings: AppSettings, messages: AiRequestMessage[]): AiRequestBody {
  const model = settings.aiModel.trim()
  if (!model) throw new Error('AI model is required')
  return {
    model,
    messages,
    temperature: clampTemperature(settings.aiTemperature),
    stream: false,
  }
}

function parseAiUrl(endpoint: string, provider: AiProvider, format: AiUpstreamFormat): URL {
  const value = endpoint.trim() || getDefaultAiEndpoint(provider, format)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('AI endpoint must be a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI endpoint must start with http:// or https://')
  }
  return url
}

function stripKnownAiPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '')
  for (const suffix of Object.values(AI_FORMAT_PATHS)) {
    if (path.endsWith(suffix)) return path.slice(0, -suffix.length).replace(/\/+$/, '')
  }
  return path
}

function serializeAiUrl(url: URL): string {
  return url.toString().replace(/\/$/, '')
}

async function createResponseError(response: Response, prefix: string): Promise<Error> {
  const detail = await response.text().catch(() => '')
  return new Error(`${prefix} (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
}

function readStreamLines(text: string, onLine: (line: string) => void): string {
  const lines = text.split(/\r?\n/)
  const lastLineIsComplete = /\r?\n$/.test(text)
  const rest = lastLineIsComplete ? '' : lines.pop() || ''
  for (const line of lines) {
    const value = line.trim()
    if (value) onLine(value)
  }
  return rest
}

export function extractAiStreamChunk(line: string): string {
  const data = line.startsWith('data:') ? line.slice(5).trim() : line.trim()
  if (!data || data === '[DONE]' || !data.startsWith('{')) return ''
  try {
    const payload = JSON.parse(data) as any
    if (payload?.type === 'response.output_text.delta') return typeof payload.delta === 'string' ? payload.delta : ''
    if (payload?.type === 'content_block_delta' && payload?.delta?.type === 'text_delta') {
      return typeof payload.delta.text === 'string' ? payload.delta.text : ''
    }
    const choice = payload?.choices?.[0]
    const content = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? payload?.message?.content ?? payload?.response
    return contentToText(content)
  } catch {
    return ''
  }
}

async function request(endpoint: string, init: RequestInit): Promise<Response> {
  if (isTauri()) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      return await tauriFetch(endpoint, init)
    } catch {
      // Browser fetch remains useful for dev mode and for Tauri HTTP plugin fallback.
    }
  }
  return fetch(endpoint, init)
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.3
  return Math.min(2, Math.max(0, value))
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        const value = (part as any).text ?? (part as any).content
        return typeof value === 'string' ? value : contentToText(value)
      }
      return ''
    })
    .join('')
}
