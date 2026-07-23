import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings } from '../src/types'
import {
  DEFAULT_API_AI_ENDPOINT,
  DEFAULT_LOCAL_AI_ENDPOINT,
  buildAiChatRequestBody,
  buildAiMessages,
  buildAiRequestBody,
  extractAiContent,
  limitAiChatMessages,
  limitAiInput,
  normalizeAiEndpoint,
} from '../src/utils/aiAssistant'

const aiSettings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  aiEnabled: true,
  aiModel: 'test-model',
  ...patch,
})

describe('AI assistant helpers', () => {
  it('normalizes local and API endpoints', () => {
    expect(normalizeAiEndpoint('', 'local')).toBe(DEFAULT_LOCAL_AI_ENDPOINT)
    expect(normalizeAiEndpoint('', 'api')).toBe(DEFAULT_API_AI_ENDPOINT)
    expect(normalizeAiEndpoint('https://example.com/v1', 'api')).toBe('https://example.com/v1/chat/completions')
    expect(normalizeAiEndpoint('https://example.com/custom/chat', 'api')).toBe('https://example.com/custom/chat')
  })

  it('keeps the newest context for continuation and the first context for rewrites', () => {
    expect(limitAiInput('0123456789', 'continue', 4)).toBe('6789')
    expect(limitAiInput('0123456789', 'summarize', 4)).toBe('0123')
    expect(limitAiInput('  short  ', 'polish', 100)).toBe('short')
  })

  it('builds an OpenAI-compatible chat payload', () => {
    const body = buildAiRequestBody(aiSettings({ aiTemperature: 5, aiTargetLanguage: 'Japanese' }), 'translate', '# Title', 'en')

    expect(body.model).toBe('test-model')
    expect(body.temperature).toBe(2)
    expect(body.stream).toBe(false)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].content).toContain('Translate the Markdown to Japanese')
    expect(body.messages[1].content).toContain('# Title')
  })

  it('uses the configurable Markdown prompt for actions and chat', () => {
    const settings = aiSettings({ aiMarkdownPrompt: 'Follow my Markdown house style.' })
    const actionBody = buildAiRequestBody(settings, 'polish', 'Text', 'en')
    const chatBody = buildAiChatRequestBody(settings, [{ role: 'user', content: 'Help' }], 'en')

    expect(actionBody.messages[0].content).toContain('Follow my Markdown house style.')
    expect(chatBody.messages[0].content).toContain('Follow my Markdown house style.')
    expect(chatBody.messages[1]).toEqual({ role: 'user', content: 'Help' })
  })

  it('keeps the newest complete chat turns within the context limit', () => {
    expect(limitAiChatMessages([
      { role: 'user', content: '12345' },
      { role: 'assistant', content: '67890' },
    ], 7)).toEqual([
      { role: 'user', content: '45' },
      { role: 'assistant', content: '67890' },
    ])
  })

  it('extracts text from common compatible response shapes', () => {
    expect(extractAiContent({ choices: [{ message: { content: ' hello ' } }] })).toBe('hello')
    expect(extractAiContent({ choices: [{ text: 'legacy' }] })).toBe('legacy')
    expect(extractAiContent({ response: 'ollama' })).toBe('ollama')
    expect(extractAiContent({ choices: [{ message: { content: [{ text: 'part 1' }, { content: ' part 2' }] } }] })).toBe('part 1 part 2')
  })

  it('adds target-language instructions only to translation prompts', () => {
    expect(buildAiMessages('translate', 'Text', 'en', 'German')[1].content).toContain('German')
    expect(buildAiMessages('polish', 'Text', 'en', 'German')[1].content).not.toContain('German')
  })
})
