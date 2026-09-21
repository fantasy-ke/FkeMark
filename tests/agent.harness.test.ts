import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AiChatMessage, AppSettings } from '../src/types'
import {
  AGENT_MAX_STEPS,
  buildAgentSystemPrompt,
  parseAgentToolCall,
  runAgentHarness,
  stripAgentToolBlocks,
} from '../src/utils/agent/harness'

const { runAiChatMock } = vi.hoisted(() => ({ runAiChatMock: vi.fn() }))
vi.mock('../src/utils/aiAssistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/aiAssistant')>()
  return { ...actual, runAiChat: runAiChatMock }
})

const { executeAgentToolMock } = vi.hoisted(() => ({ executeAgentToolMock: vi.fn() }))
vi.mock('../src/utils/agent/tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/agent/tools')>()
  return { ...actual, executeAgentTool: executeAgentToolMock }
})

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, aiEnabled: true, aiModel: 'test-model', ...patch }
}

const messages: AiChatMessage[] = [{ role: 'user', content: '帮我补全首页笔记' }]

beforeEach(() => {
  runAiChatMock.mockReset()
  executeAgentToolMock.mockReset()
})

describe('Agent 工具调用协议', () => {
  it('解析 tool / json 围栏以及裸 JSON', () => {
    expect(parseAgentToolCall('```tool\n{"tool":"read_markdown","arguments":{"path":"a.md"}}\n```'))
      .toEqual({ tool: 'read_markdown', arguments: { path: 'a.md' } })
    expect(parseAgentToolCall('先说明\n```json\n{"name":"read_markdown","args":{"path":"b.md"}}\n```'))
      .toEqual({ tool: 'read_markdown', arguments: { path: 'b.md' } })
    expect(parseAgentToolCall('{"tool":"list_markdown_files"}'))
      .toEqual({ tool: 'list_markdown_files', arguments: {} })
  })

  it('忽略普通回答、未知工具与非法 JSON', () => {
    expect(parseAgentToolCall('这是最终回答，没有工具调用。')).toBeNull()
    expect(parseAgentToolCall('```tool\n{"tool":"drop_database"}\n```')).toBeNull()
    expect(parseAgentToolCall('```tool\n{not json}\n```')).toBeNull()
    expect(parseAgentToolCall('```json\n{"answer":"ok"}\n```')).toBeNull()
  })

  it('剥离工具块后保留最终回答', () => {
    expect(stripAgentToolBlocks('前言\n```tool\n{"tool":"read_markdown"}\n```\n')).toBe('前言')
  })

  it('系统提示词列出可用工具并随权限变化', () => {
    const prompt = buildAgentSystemPrompt(settings(), 'zh-CN')
    expect(prompt).toContain('write_markdown')
    expect(prompt).toContain('zh-CN')

    const readOnly = buildAgentSystemPrompt(settings({ mcpPermissionMode: 'read-only' }), 'en')
    expect(readOnly).not.toContain('write_markdown')
  })
})

describe('Agent 工具循环', () => {
  it('执行工具后继续请求，直到模型给出最终回答', async () => {
    runAiChatMock
      .mockResolvedValueOnce('```tool\n{"tool":"read_markdown","arguments":{"path":"D:/notes/首页.md"}}\n```')
      .mockResolvedValueOnce('已经补全首页笔记。')
    executeAgentToolMock.mockResolvedValue({
      ok: true,
      summary: '读取 D:/notes/首页.md',
      data: { path: 'D:/notes/首页.md', content: '正文' },
    })

    const onEvent = vi.fn()
    const result = await runAgentHarness({
      settings: settings(),
      messages,
      uiLanguage: 'zh-CN',
      currentFolder: 'D:/notes',
      onEvent,
    })

    expect(runAiChatMock).toHaveBeenCalledTimes(2)
    expect(executeAgentToolMock).toHaveBeenCalledWith(
      'read_markdown',
      { path: 'D:/notes/首页.md' },
      expect.objectContaining({ currentFolder: 'D:/notes' }),
    )
    expect(result.answer).toBe('已经补全首页笔记。')
    expect(result.events).toHaveLength(1)
    expect(result.changes).toHaveLength(0)
    expect(result.truncated).toBe(false)
    expect(onEvent).toHaveBeenCalledTimes(1)

    // 工具结果以 user 消息回灌，且不再重复最初的系统提示。
    const secondCallMessages = runAiChatMock.mock.calls[1][1] as AiChatMessage[]
    expect(secondCallMessages.at(-1)?.content).toContain('Tool result for read_markdown')
    expect(secondCallMessages.at(-1)?.content).toContain('正文')
  })

  it('记录写入产生的变更并回调同步标签页', async () => {
    runAiChatMock
      .mockResolvedValueOnce('```tool\n{"tool":"write_markdown","arguments":{"path":"D:/notes/首页.md","content":"新内容"}}\n```')
      .mockResolvedValueOnce('写入完成。')
    const change = { path: 'D:/notes/首页.md', before: '旧内容', after: '新内容', createdAt: 1 }
    executeAgentToolMock.mockImplementation(async (_name, _args, context) => {
      context.onFileWritten?.('D:/notes/首页.md', '新内容')
      return { ok: true, summary: '写入 D:/notes/首页.md', change }
    })

    const onFileWritten = vi.fn()
    const result = await runAgentHarness({
      settings: settings(),
      messages,
      uiLanguage: 'zh-CN',
      currentFolder: 'D:/notes',
      onFileWritten,
    })

    expect(onFileWritten).toHaveBeenCalledWith('D:/notes/首页.md', '新内容')
    expect(result.changes).toEqual([change])
  })

  it('工具失败时把失败结果回灌给模型并继续', async () => {
    runAiChatMock
      .mockResolvedValueOnce('```tool\n{"tool":"read_markdown","arguments":{"path":"D:/secret/a.md"}}\n```')
      .mockResolvedValueOnce('无法访问该文件。')
    executeAgentToolMock.mockResolvedValue({ ok: false, summary: '路径不在允许范围内' })

    const result = await runAgentHarness({
      settings: settings(),
      messages,
      uiLanguage: 'zh-CN',
      currentFolder: 'D:/notes',
    })

    expect(result.events[0]).toMatchObject({ ok: false, summary: '路径不在允许范围内' })
    expect(result.answer).toBe('无法访问该文件。')
  })

  it('模型持续请求工具时在上限处停止', async () => {
    runAiChatMock.mockResolvedValue('```tool\n{"tool":"list_markdown_files","arguments":{}}\n```')
    executeAgentToolMock.mockResolvedValue({ ok: true, summary: '列出 1 篇笔记', data: { count: 1 } })

    const result = await runAgentHarness({
      settings: settings(),
      messages,
      uiLanguage: 'zh-CN',
      currentFolder: 'D:/notes',
    })

    expect(runAiChatMock).toHaveBeenCalledTimes(AGENT_MAX_STEPS)
    expect(result.events).toHaveLength(AGENT_MAX_STEPS)
    expect(result.truncated).toBe(true)
  })

  it('没有工具调用时直接返回回答', async () => {
    runAiChatMock.mockResolvedValue('直接回答')
    const result = await runAgentHarness({
      settings: settings(),
      messages,
      uiLanguage: 'zh-CN',
      currentFolder: null,
    })

    expect(executeAgentToolMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ answer: '直接回答', events: [], changes: [], truncated: false })
  })
})
