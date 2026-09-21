import { afterEach, describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings } from '../src/types'
import {
  GHOST_TEXT_INSTRUCTION,
  buildAiCompletionMessages,
  runAiCompletion,
} from '../src/utils/aiAssistant'
import {
  GHOST_TEXT_MAX_CHARS,
  sanitizeAiCompletion,
  shouldRequestGhostText,
  takeGhostTextContext,
} from '../src/utils/aiGhostText'
import {
  aiGhostTextKey,
  applyAiGhostText,
  createAiGhostTextPlugin,
  readAiGhostText,
} from '../src/components/editor/aiGhostTextExtension'

const aiSettings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  aiEnabled: true,
  aiModel: 'test-model',
  ...patch,
})

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
  },
})

const plugin = createAiGhostTextPlugin()

function createState(text = 'Hello world '): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])])
  return EditorState.create({ doc, plugins: [plugin] })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Tab 半自动续写触发规则', () => {
  it('只在光标前有内容且停在空白、标点或中日韩文字后触发', () => {
    expect(shouldRequestGhostText('')).toBe(false)
    expect(shouldRequestGhostText('   \n ')).toBe(false)
    expect(shouldRequestGhostText('Hello wor')).toBe(false)
    expect(shouldRequestGhostText('Hello world ')).toBe(true)
    expect(shouldRequestGhostText('Hello world.')).toBe(true)
    expect(shouldRequestGhostText('这是一段中文')).toBe(true)
  })

  it('只保留光标前文的末尾部分作为上下文', () => {
    expect(takeGhostTextContext('0123456789', 4)).toBe('6789')
    expect(takeGhostTextContext('0123', 10)).toBe('0123')
  })
})

describe('续写结果清洗', () => {
  it('拒绝空回答与 NONE 占位', () => {
    expect(sanitizeAiCompletion('', 'context')).toBeNull()
    expect(sanitizeAiCompletion('   ', 'context')).toBeNull()
    expect(sanitizeAiCompletion('NONE', 'context')).toBeNull()
    expect(sanitizeAiCompletion('无', 'context')).toBeNull()
  })

  it('去掉代码围栏、包裹引号，并且只保留第一行', () => {
    expect(sanitizeAiCompletion('```\nnext sentence\n```', 'context')).toBe('next sentence')
    expect(sanitizeAiCompletion('"next sentence"', 'context')).toBe('next sentence')
    expect(sanitizeAiCompletion('first line\nsecond line', 'context')).toBe('first line')
  })

  it('去掉模型复述的前文尾部', () => {
    expect(sanitizeAiCompletion('Hello world and more', 'Hello world ')).toBe('and more')
  })

  it('超长建议回退到最近的断句位置', () => {
    const long = `${'a'.repeat(120)}。${'b'.repeat(200)}`
    const result = sanitizeAiCompletion(long, 'context')
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(GHOST_TEXT_MAX_CHARS)
    expect(result!.endsWith('。')).toBe(true)
  })
})

describe('续写请求', () => {
  it('构造带续写指令的请求消息并限制上下文长度', () => {
    const messages = buildAiCompletionMessages(aiSettings(), 'x'.repeat(20_000), 'zh-CN')

    expect(messages[0].content).toContain(GHOST_TEXT_INSTRUCTION)
    expect(messages[1].content).toContain('x'.repeat(100))
    expect(messages[1].content.length).toBeLessThan(20_000)
  })

  it('返回清洗后的建议，模型回答 NONE 时返回 null', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'and keeps writing' } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'NONE' } }],
      }), { status: 200 }))

    await expect(runAiCompletion(aiSettings(), 'Hello world ', 'en')).resolves.toBe('and keeps writing')
    await expect(runAiCompletion(aiSettings(), 'Hello world ', 'en')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('AI 助手关闭或没有前文时不发请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(runAiCompletion(aiSettings({ aiEnabled: false }), 'Hello ', 'en')).rejects.toThrow()
    await expect(runAiCompletion(aiSettings(), '   ', 'en')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('幽灵建议插件状态', () => {
  it('写入建议后产生行内装饰，文档变化后自动失效', () => {
    const state = createState()
    const withSuggestion = state.apply(applyAiGhostText(state.tr, { text: 'suggested', pos: 5 }))

    expect(readAiGhostText(withSuggestion)).toEqual({ text: 'suggested', pos: 5 })
    const decorations = aiGhostTextKey.getState(withSuggestion)!
    expect(decorations.suggestion).toEqual({ text: 'suggested', pos: 5 })

    const plugin = createAiGhostTextPlugin()
    const rendered = plugin.props.decorations!(withSuggestion) as { find: () => { from: number }[] }
    expect(rendered.find().map((decoration) => decoration.from)).toEqual([5])

    const edited = withSuggestion.apply(withSuggestion.tr.insertText('x', 5))
    expect(readAiGhostText(edited)).toBeNull()

    const moved = withSuggestion.apply(withSuggestion.tr.setSelection(
      withSuggestion.selection.constructor.near(withSuggestion.doc.resolve(2)) as never,
    ))
    expect(readAiGhostText(moved)).toBeNull()
  })

  it('清除建议后不再渲染装饰', () => {
    const state = createState()
    const withSuggestion = state.apply(applyAiGhostText(state.tr, { text: 'suggested', pos: 5 }))
    const cleared = withSuggestion.apply(applyAiGhostText(withSuggestion.tr, null))

    expect(readAiGhostText(cleared)).toBeNull()
    const plugin = createAiGhostTextPlugin()
    const rendered = plugin.props.decorations!(cleared) as { find: () => unknown[] }
    expect(rendered.find()).toHaveLength(0)
  })
})
