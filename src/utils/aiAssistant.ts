import type { AiAssistantAction, AiProvider, AppSettings } from '../types'
import { isTauri } from './tauri'

export const DEFAULT_LOCAL_AI_ENDPOINT = 'http://localhost:11434/v1/chat/completions'
export const DEFAULT_API_AI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
export const MAX_AI_CONTEXT_CHARS = 12_000

interface AiMessage {
  role: 'system' | 'user'
  content: string
}

interface AiRequestBody {
  model: string
  messages: AiMessage[]
  temperature: number
  stream: false
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

export function limitAiInput(input: string, action: AiAssistantAction, maxChars = MAX_AI_CONTEXT_CHARS): string {
  const text = input.trim()
  if (text.length <= maxChars) return text
  return action === 'continue' ? text.slice(-maxChars) : text.slice(0, maxChars)
}

export function normalizeAiEndpoint(endpoint: string, provider: AiProvider): string {
  const fallback = provider === 'api' ? DEFAULT_API_AI_ENDPOINT : DEFAULT_LOCAL_AI_ENDPOINT
  const value = (endpoint.trim() || fallback).replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('AI endpoint must be a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI endpoint must start with http:// or https://')
  }

  const path = url.pathname.replace(/\/+$/, '')
  if (!path || path === '') {
    url.pathname = '/v1/chat/completions'
    return url.toString()
  }
  if (path === '/v1') {
    url.pathname = '/v1/chat/completions'
    return url.toString()
  }
  return url.toString().replace(/\/+$/, '')
}

export function buildAiMessages(
  action: AiAssistantAction,
  input: string,
  uiLanguage: string,
  targetLanguage: string,
): AiMessage[] {
  const instruction = ACTION_PROMPTS[action].replace('{targetLanguage}', targetLanguage.trim() || 'English')
  const limitedInput = limitAiInput(input, action)
  return [
    {
      role: 'system',
      content: [
        'You are an AI writing assistant inside a Markdown editor.',
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
  const model = settings.aiModel.trim()
  if (!model) throw new Error('AI model is required')
  return {
    model,
    messages: buildAiMessages(action, input, uiLanguage, settings.aiTargetLanguage),
    temperature: clampTemperature(settings.aiTemperature),
    stream: false,
  }
}

export function extractAiContent(payload: unknown): string {
  const data = payload as any
  const choice = data?.choices?.[0]
  const content = choice?.message?.content ?? choice?.text ?? data?.message?.content ?? data?.response
  const text = contentToText(content).trim()
  if (!text) throw new Error('AI returned an empty result')
  return text
}

export async function runAiAssistant(
  settings: AppSettings,
  action: AiAssistantAction,
  input: string,
  uiLanguage: string,
): Promise<string> {
  if (!settings.aiEnabled) throw new Error('AI assistant is disabled')
  if (!input.trim()) throw new Error('No Markdown content was provided')

  const endpoint = normalizeAiEndpoint(settings.aiEndpoint, settings.aiProvider)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const apiKey = settings.aiApiKey.trim()
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const body = JSON.stringify(buildAiRequestBody(settings, action, input, uiLanguage))
  const response = await postJson(endpoint, headers, body)
  return extractAiContent(response)
}

async function postJson(endpoint: string, headers: Record<string, string>, body: string): Promise<unknown> {
  const response = await request(endpoint, headers, body)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`AI request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  return response.json()
}

async function request(endpoint: string, headers: Record<string, string>, body: string): Promise<Response> {
  if (isTauri()) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      return await tauriFetch(endpoint, { method: 'POST', headers, body })
    } catch {
      // Browser fetch remains useful for dev mode and for Tauri HTTP plugin fallback.
    }
  }
  return fetch(endpoint, { method: 'POST', headers, body })
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
        return typeof value === 'string' ? value : ''
      }
      return ''
    })
    .join('')
}
