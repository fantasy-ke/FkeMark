import { invoke } from '@tauri-apps/api/core'
import type { AppSettings, FileTreeNode, McpPermissionMode } from '../../types'
import { isTauri } from '../tauri'
import { flattenMarkdownFiles } from '../markdown/wikiLinks'
import { normalizeVersionSnapshotLimit } from '../versionHistory'

export const AGENT_TOOL_NAMES = [
  'list_markdown_files',
  'read_markdown',
  'search_markdown',
  'get_markdown_outline',
  'write_markdown',
  'append_markdown',
] as const

export type AgentToolName = typeof AGENT_TOOL_NAMES[number]

export interface AgentToolDefinition {
  name: AgentToolName
  description: string
  /** 参数说明，写入系统提示词。 */
  parameters: string
  /** 会修改磁盘文件，受权限模式限制。 */
  write: boolean
}

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'list_markdown_files',
    description: 'List Markdown notes in the current folder.',
    parameters: '{ "root"?: string, "limit"?: number }',
    write: false,
  },
  {
    name: 'read_markdown',
    description: 'Read one Markdown note.',
    parameters: '{ "path": string }',
    write: false,
  },
  {
    name: 'search_markdown',
    description: 'Search plain text across Markdown notes and return matching lines.',
    parameters: '{ "query": string, "root"?: string, "limit"?: number }',
    write: false,
  },
  {
    name: 'get_markdown_outline',
    description: 'Extract headings with line numbers from one Markdown note.',
    parameters: '{ "path": string }',
    write: false,
  },
  {
    name: 'write_markdown',
    description: 'Create or replace one Markdown note. Always pass the complete final content.',
    parameters: '{ "path": string, "content": string }',
    write: true,
  },
  {
    name: 'append_markdown',
    description: 'Append Markdown content to the end of one note.',
    parameters: '{ "path": string, "content": string }',
    write: true,
  },
]

export const AGENT_MAX_TOOL_RESULT_CHARS = 6000
export const AGENT_DEFAULT_LIST_LIMIT = 200
export const AGENT_DEFAULT_SEARCH_LIMIT = 40

export interface AgentFileChange {
  path: string
  before: string
  after: string
  createdAt: number
}

export interface AgentToolContext {
  settings: AppSettings
  /** 当前打开的文件夹，作为默认的允许根目录。 */
  currentFolder: string | null
  /** 写入成功后回调，用于同步已打开的标签页。 */
  onFileWritten?: (path: string, content: string) => void
}

export interface AgentToolOutcome {
  ok: boolean
  /** 展示在对话流里的简短说明。 */
  summary: string
  /** 回传给模型的结构化结果。 */
  data?: unknown
  change?: AgentFileChange
}

interface SearchResultData {
  matches: Array<{ filePath: string; fileName: string; lineNumber: number; lineText: string }>
  totalMatches: number
}

export function normalizeAgentPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function pathKey(value: string): string {
  const normalized = normalizeAgentPath(value)
  // 路径比较不区分大小写，兼容 Windows 与用户手写的盘符大小写差异。
  return normalized.toLocaleLowerCase()
}

export function isMarkdownPath(value: string): boolean {
  return /\.(?:md|markdown)$/i.test(value)
}

/** 解析允许 Agent 访问的根目录：优先设置中的 MCP 允许目录，其次当前文件夹。 */
export function resolveAgentRoots(settings: AppSettings, currentFolder: string | null): string[] {
  const configured = (settings.mcpAllowedRoots || '')
    .split(/[\r\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (configured.length > 0) return configured
  return currentFolder ? [currentFolder] : []
}

export function isPathInsideRoots(path: string, roots: string[]): boolean {
  const target = pathKey(path)
  return roots.some((root) => {
    const base = pathKey(root)
    return Boolean(base) && (target === base || target.startsWith(`${base}/`))
  })
}

export function canUseAgentTool(mode: McpPermissionMode | undefined, name: AgentToolName): boolean {
  const tool = AGENT_TOOLS.find((item) => item.name === name)
  if (!tool) return false
  if (!tool.write) return true
  return (mode ?? 'data-read-write') !== 'read-only'
}

/** 系统提示词中的工具清单，供模型选择工具。 */
export function describeAgentTools(mode: McpPermissionMode | undefined): string {
  return AGENT_TOOLS
    .filter((tool) => canUseAgentTool(mode, tool.name))
    .map((tool) => `- ${tool.name}: ${tool.description} arguments ${tool.parameters}`)
    .join('\n')
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(1, Math.trunc(numeric)))
}

function truncate(text: string, maxChars = AGENT_MAX_TOOL_RESULT_CHARS): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(内容已截断)` : text
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`参数 ${key} 必须是非空字符串`)
  return value.trim()
}

async function readNote(path: string): Promise<string> {
  if (!isTauri()) throw new Error('Agent 工具需要在 FkeMark 桌面应用中使用')
  return invoke<string>('read_file_command', { path })
}

async function writeNote(path: string, content: string, settings: AppSettings): Promise<void> {
  if (!isTauri()) throw new Error('Agent 工具需要在 FkeMark 桌面应用中使用')
  await invoke('write_file_command', {
    path,
    content,
    snapshotLimit: normalizeVersionSnapshotLimit(settings.versionSnapshotLimit),
  })
}

function resolveMarkdownTarget(
  context: AgentToolContext,
  args: Record<string, unknown>,
  key = 'path',
): { path: string; roots: string[] } {
  const raw = requireString(args, key)
  const roots = resolveAgentRoots(context.settings, context.currentFolder)
  if (roots.length === 0) throw new Error('还没有打开文件夹，也没有配置允许访问的目录')
  if (!isPathInsideRoots(raw, roots)) throw new Error(`路径不在允许范围内：${raw}`)
  if (!isMarkdownPath(raw)) throw new Error('只允许读写 .md 与 .markdown 文件')
  return { path: raw, roots }
}

function resolveSearchRoot(context: AgentToolContext, args: Record<string, unknown>): string {
  const raw = args.root
  const roots = resolveAgentRoots(context.settings, context.currentFolder)
  if (typeof raw === 'string' && raw.trim()) {
    if (!isPathInsideRoots(raw.trim(), roots)) throw new Error(`路径不在允许范围内：${raw}`)
    return raw.trim()
  }
  if (roots.length === 0) throw new Error('还没有打开文件夹，也没有配置允许访问的目录')
  return roots[0]
}

function listHeadings(content: string): Array<{ level: number; text: string; line: number }> {
  const headings: Array<{ level: number; text: string; line: number }> = []
  let fence: string | null = null
  content.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
      return
    }
    if (fence) return
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (match) headings.push({ level: match[1].length, text: match[2].trim(), line: index + 1 })
  })
  return headings
}

/** 执行一次工具调用。错误会转换成 ok:false 的结果回传给模型，而不是中断循环。 */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
): Promise<AgentToolOutcome> {
  if (!AGENT_TOOL_NAMES.includes(name as AgentToolName)) {
    return { ok: false, summary: `未知工具：${name}` }
  }
  const toolName = name as AgentToolName
  if (!canUseAgentTool(context.settings.mcpPermissionMode, toolName)) {
    const mode = context.settings.mcpPermissionMode ?? 'data-read-write'
    return { ok: false, summary: `当前权限模式（${mode}）不允许调用 ${toolName}，请在设置中提高 MCP 权限。` }
  }

  try {
    switch (toolName) {
      case 'list_markdown_files': {
        const root = resolveSearchRoot(context, args)
        const limit = clampLimit(args.limit, AGENT_DEFAULT_LIST_LIMIT, 1000)
        const tree = await invoke<FileTreeNode[]>('scan_directory', { path: root })
        const files = flattenMarkdownFiles(tree).slice(0, limit)
        return {
          ok: true,
          summary: `列出 ${files.length} 篇笔记`,
          data: { root, count: files.length, files: files.map((file) => ({ path: file.path, name: file.name })) },
        }
      }
      case 'read_markdown': {
        const { path } = resolveMarkdownTarget(context, args)
        const content = await readNote(path)
        return {
          ok: true,
          summary: `读取 ${path}`,
          data: { path, content: truncate(content) },
        }
      }
      case 'search_markdown': {
        const query = requireString(args, 'query')
        const root = resolveSearchRoot(context, args)
        const limit = clampLimit(args.limit, AGENT_DEFAULT_SEARCH_LIMIT, 200)
        const result = await invoke<SearchResultData>('search_in_files', {
          dirPath: root,
          query,
          caseSensitive: false,
          useRegex: false,
          wholeWord: false,
        })
        const matches = (result.matches || [])
          .filter((match) => isMarkdownPath(match.filePath))
          .slice(0, limit)
        return {
          ok: true,
          summary: `搜索“${query}”命中 ${matches.length} 处`,
          data: { query, count: matches.length, matches },
        }
      }
      case 'get_markdown_outline': {
        const { path } = resolveMarkdownTarget(context, args)
        const content = await readNote(path)
        const headings = listHeadings(content)
        return {
          ok: true,
          summary: `提取 ${headings.length} 个标题`,
          data: { path, count: headings.length, headings },
        }
      }
      case 'write_markdown':
      case 'append_markdown': {
        const { path } = resolveMarkdownTarget(context, args)
        const content = requireString(args, 'content')
        let before = ''
        try {
          before = await readNote(path)
        } catch {
          // 新文件没有历史内容，快照与差异对比都以空内容为基线。
          before = ''
        }
        const after = toolName === 'append_markdown' ? `${before}${content}` : content
        await writeNote(path, after, context.settings)
        context.onFileWritten?.(path, after)
        return {
          ok: true,
          summary: `${toolName === 'append_markdown' ? '追加' : '写入'} ${path}`,
          data: { path, size: after.length },
          change: { path, before, after, createdAt: Date.now() },
        }
      }
      default:
        return { ok: false, summary: `未知工具：${name}` }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, summary: `${toolName} 执行失败：${detail}` }
  }
}
