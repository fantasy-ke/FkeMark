import type { AiChatMessage, AppSettings } from '../../types'
import { runAiChat } from '../aiAssistant'
import {
  AGENT_TOOL_NAMES,
  describeAgentTools,
  executeAgentTool,
  type AgentFileChange,
  type AgentToolContext,
} from './tools'

/** 单次请求最多执行的工具步数，避免模型陷入无限循环。 */
export const AGENT_MAX_STEPS = 6

export const AGENT_TOOL_BLOCK_TAG = 'tool'

export interface AgentToolCall {
  tool: string
  arguments: Record<string, unknown>
}

export interface AgentToolEvent {
  step: number
  tool: string
  arguments: Record<string, unknown>
  ok: boolean
  summary: string
  change?: AgentFileChange
}

export interface AgentRunResult {
  /** 模型给出的最终 Markdown 回答。 */
  answer: string
  events: AgentToolEvent[]
  changes: AgentFileChange[]
  /** 达到步数上限时仍存在未完成的工具调用。 */
  truncated: boolean
  /** 用户主动停止时为 true，answer 只包含停止前已生成的内容。 */
  stopped?: boolean
}

/**
 * 解析模型回复中的工具调用。
 * 采用带 ```tool 围栏的 JSON 协议而不是上游原生 function calling，
 * 这样 Chat Completions、Responses、Anthropic Messages 三种上游格式行为一致。
 */
export function parseAgentToolCall(reply: string): AgentToolCall | null {
  const fencePattern = /```(?:tool|json)\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(reply)) !== null) {
    const call = readToolCall(match[1])
    if (call) return call
  }
  return readToolCall(reply.trim())
}

function readToolCall(source: string): AgentToolCall | null {
  const text = source.trim()
  if (!text.startsWith('{')) return null
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const tool = record.tool ?? record.name
  if (typeof tool !== 'string' || !AGENT_TOOL_NAMES.includes(tool as never)) return null
  const rawArguments = record.arguments ?? record.args ?? record.parameters
  const args = rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)
    ? rawArguments as Record<string, unknown>
    : {}
  return { tool, arguments: args }
}

/** 移除回复里的工具调用块，用于兜底展示最终回答。 */
export function stripAgentToolBlocks(reply: string): string {
  return reply.replace(/```(?:tool|json)\s*\n[\s\S]*?```/g, '').trim()
}

/** 构造 Agent 模式的系统提示词。 */
export function buildAgentSystemPrompt(settings: AppSettings, uiLanguage: string): string {
  return [
    settings.aiMarkdownPrompt.trim(),
    'You are working inside FkeMark as a Markdown file agent. You can read and modify the user\'s Markdown notes with the tools below.',
    'To call a tool, reply with only a fenced block tagged tool that contains one JSON object:',
    '```tool\n{"tool": "read_markdown", "arguments": {"path": "D:/notes/example.md"}}\n```',
    'Call one tool at a time and wait for its result before the next step.',
    'When the task is done, reply with the final answer in Markdown and do not include any tool block.',
    'A referenced file path is a local note. Read it with read_markdown before answering questions about its content, and never claim you cannot access local files.',
    `Available tools:\n${describeAgentTools(settings.mcpPermissionMode)}`,
    `The application UI language is ${uiLanguage}. Answer in the user's language.`,
  ].filter(Boolean).join('\n\n')
}

function formatToolResult(event: AgentToolEvent, data: unknown): string {
  return [
    `Tool result for ${event.tool}: ${event.ok ? 'ok' : 'failed'}`,
    event.summary,
    data === undefined ? '' : JSON.stringify(data),
  ].filter(Boolean).join('\n')
}

/** 只取最新一条用户消息上的引用，避免后续追问把历史文件重复读一遍。 */
function latestReferencedPaths(messages: AiChatMessage[]): string[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const paths = (message.references ?? [])
      .map((reference) => reference.path.trim())
      .filter(Boolean)
    return [...new Set(paths)]
  }
  return []
}

function formatReferencedRead(path: string, event: AgentToolEvent, data: unknown): string {
  return [
    `Referenced file ${path} was read locally with read_markdown.`,
    event.ok
      ? 'Answer from this content. Do not claim you cannot read local files.'
      : 'The read failed. Explain the failure instead of claiming you have no file access.',
    formatToolResult(event, data),
  ].join('\n')
}

export interface AgentRunOptions {
  settings: AppSettings
  /** 已有的对话消息（含本轮用户请求）。 */
  messages: AiChatMessage[]
  uiLanguage: string
  currentFolder: string | null
  onFileWritten?: (path: string, content: string) => void
  /** 每执行完一个工具调用回调一次，用于界面实时展示进度。 */
  onEvent?: (event: AgentToolEvent) => void
  /** 用户停止生成时中断当前请求与后续工具调用。 */
  signal?: AbortSignal
}

/**
 * 运行 Agent 工具循环：模型请求工具 → 本地执行 → 把结果回灌 → 直到模型给出最终回答。
 */
export async function runAgentHarness(options: AgentRunOptions): Promise<AgentRunResult> {
  const { settings, uiLanguage, currentFolder, onEvent, onFileWritten, signal } = options
  const context: AgentToolContext = { settings, currentFolder, onFileWritten }
  const conversation: AiChatMessage[] = [
    { role: 'user', content: buildAgentSystemPrompt(settings, uiLanguage) },
    ...options.messages,
  ]
  const events: AgentToolEvent[] = []
  const changes: AgentFileChange[] = []

  // 引用只带路径。先在本地读入，避免模型把路径当成自己无法访问的磁盘文件。
  for (const path of latestReferencedPaths(options.messages)) {
    if (signal?.aborted) return { answer: '', events, changes, truncated: false, stopped: true }
    if (events.length >= AGENT_MAX_STEPS) break
    const outcome = await executeAgentTool('read_markdown', { path }, context)
    const event: AgentToolEvent = {
      step: events.length + 1,
      tool: 'read_markdown',
      arguments: { path },
      ok: outcome.ok,
      summary: outcome.summary,
      change: outcome.change,
    }
    events.push(event)
    if (outcome.change) changes.push(outcome.change)
    onEvent?.(event)
    conversation.push({ role: 'user', content: formatReferencedRead(path, event, outcome.data) })
  }

  for (let step = events.length + 1; step <= AGENT_MAX_STEPS; step += 1) {
    if (signal?.aborted) return { answer: '', events, changes, truncated: false, stopped: true }
    const reply = await runAiChat(settings, conversation, uiLanguage, undefined, { signal })
    // 停止后不再解析工具调用，避免用半截回复触发写盘。
    if (signal?.aborted) {
      return { answer: stripAgentToolBlocks(reply), events, changes, truncated: false, stopped: true }
    }
    const call = parseAgentToolCall(reply)
    if (!call) return { answer: stripAgentToolBlocks(reply) || reply, events, changes, truncated: false }

    const outcome = await executeAgentTool(call.tool, call.arguments, context)
    const event: AgentToolEvent = {
      step,
      tool: call.tool,
      arguments: call.arguments,
      ok: outcome.ok,
      summary: outcome.summary,
      change: outcome.change,
    }
    events.push(event)
    if (outcome.change) changes.push(outcome.change)
    onEvent?.(event)

    conversation.push({ role: 'assistant', content: reply })
    conversation.push({ role: 'user', content: formatToolResult(event, outcome.data) })
  }

  return {
    answer: `已达到 ${AGENT_MAX_STEPS} 步工具调用上限，已完成的修改见下方变更列表。`,
    events,
    changes,
    truncated: true,
  }
}
