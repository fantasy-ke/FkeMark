import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings } from '../src/types'
import {
  DEFAULT_ANTHROPIC_AI_ENDPOINT,
  DEFAULT_API_AI_ENDPOINT,
  DEFAULT_LOCAL_AI_ENDPOINT,
  buildAiChatRequestBody,
  buildAiMessages,
  buildAiProviderRequestBody,
  buildAiRequestBody,
  extractAiContent,
  extractAiModels,
  extractAiStreamChunk,
  fetchAiModels,
  limitAiChatMessages,
  limitAiInput,
  normalizeAiEndpoint,
  normalizeAiModelsEndpoint,
  testAiConnection,
} from '../src/utils/aiAssistant'

const aiSettings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  aiEnabled: true,
  aiModel: 'test-model',
  ...patch,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AI assistant helpers', () => {
  it('builds request and model paths unless full URL mode is enabled', () => {
    expect(normalizeAiEndpoint('', 'local')).toBe(`${DEFAULT_LOCAL_AI_ENDPOINT}/chat/completions`)
    expect(normalizeAiEndpoint('', 'api', 'responses')).toBe(`${DEFAULT_API_AI_ENDPOINT}/responses`)
    expect(normalizeAiEndpoint('', 'api', 'anthropic-messages')).toBe(`${DEFAULT_ANTHROPIC_AI_ENDPOINT}/messages`)
    expect(normalizeAiEndpoint('https://example.com/v1/chat/completions', 'api', 'responses')).toBe('https://example.com/v1/responses')
    expect(normalizeAiEndpoint('https://example.com/custom/request', 'api', 'responses', true)).toBe('https://example.com/custom/request')
    expect(normalizeAiModelsEndpoint('https://example.com/v1/messages', 'api', 'anthropic-messages')).toBe('https://example.com/v1/models')
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

  it('adapts common messages to Responses and Anthropic request bodies', () => {
    const messages = [
      { role: 'user' as const, content: 'Question' },
      { role: 'assistant' as const, content: 'Answer' },
    ]
    const request = buildAiChatRequestBody(aiSettings(), messages, 'en')
    const anthropicSettings = aiSettings({ aiUpstreamFormat: 'anthropic-messages', aiTemperature: 1.8 })
    const responsesBody = buildAiProviderRequestBody(aiSettings({ aiUpstreamFormat: 'responses' }), request, true)
    const anthropicBody = buildAiProviderRequestBody(
      anthropicSettings,
      buildAiChatRequestBody(anthropicSettings, messages, 'en'),
      false,
    )

    expect(responsesBody).toMatchObject({ model: 'test-model', input: request.messages, stream: true })
    expect(anthropicBody).toMatchObject({
      model: 'test-model',
      system: expect.stringContaining('Markdown writing'),
      messages: [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
      ],
      max_tokens: 4096,
      temperature: 1,
      stream: false,
    })
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

  it('extracts text from Chat Completions, Responses, and Anthropic payloads', () => {
    expect(extractAiContent({ choices: [{ message: { content: ' hello ' } }] })).toBe('hello')
    expect(extractAiContent({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'responses' }] }] })).toBe('responses')
    expect(extractAiContent({ content: [{ type: 'text', text: 'anthropic' }] })).toBe('anthropic')
    expect(extractAiContent({ response: 'ollama' })).toBe('ollama')
  })

  it('extracts streamed chunks from all supported upstream formats', () => {
    expect(extractAiStreamChunk('data: {"choices":[{"delta":{"content":"Chat"}}]}')).toBe('Chat')
    expect(extractAiStreamChunk('data: {"type":"response.output_text.delta","delta":"Responses"}')).toBe('Responses')
    expect(extractAiStreamChunk('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Anthropic"}}')).toBe('Anthropic')
    expect(extractAiStreamChunk('data: [DONE]')).toBe('')
  })

  it('extracts model identifiers from compatible list payloads', () => {
    expect(extractAiModels({ data: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-a' }] })).toEqual(['model-a', 'model-b'])
    expect(extractAiModels({ models: [{ name: 'local-a' }, 'local-b'] })).toEqual(['local-a', 'local-b'])
  })

  it('tests Anthropic connectivity with the expected URL, headers, and body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: 'text', text: 'OK' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(testAiConnection(aiSettings({
      aiProvider: 'api',
      aiUpstreamFormat: 'anthropic-messages',
      aiEndpoint: DEFAULT_ANTHROPIC_AI_ENDPOINT,
      aiApiKey: 'secret',
    }))).resolves.toBe('OK')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init?.headers).toMatchObject({
      'x-api-key': 'secret',
      'anthropic-version': '2023-06-01',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 4096,
      stream: false,
    })
  })

  it('fetches the model list from the derived models endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'model-a' }, { id: 'model-b' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(fetchAiModels(aiSettings({
      aiProvider: 'api',
      aiUpstreamFormat: 'responses',
      aiEndpoint: 'https://example.com/v1/responses',
      aiApiKey: 'secret',
    }))).resolves.toEqual(['model-a', 'model-b'])

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }))
  })

  it('adds target-language instructions only to translation prompts', () => {
    expect(buildAiMessages('translate', 'Text', 'en', 'German')[1].content).toContain('German')
    expect(buildAiMessages('polish', 'Text', 'en', 'German')[1].content).not.toContain('German')
  })
})
