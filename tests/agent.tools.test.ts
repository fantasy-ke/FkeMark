import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings, FileTreeNode } from '../src/types'
import {
  canUseAgentTool,
  describeAgentTools,
  executeAgentTool,
  isMarkdownPath,
  isPathInsideRoots,
  resolveAgentRoots,
} from '../src/utils/agent/tools'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: () => true }))

const tree: FileTreeNode[] = [
  {
    name: 'notes',
    path: 'D:\\notes',
    type: 'folder',
    children: [
      { name: '首页.md', path: 'D:\\notes\\首页.md', type: 'file' },
      { name: '图片.png', path: 'D:\\notes\\图片.png', type: 'file' },
    ],
  },
]

function settingsWith(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, mcpAllowedRoots: 'D:/notes', ...patch }
}

function context(patch: Partial<AppSettings> = {}, currentFolder: string | null = null) {
  return {
    settings: settingsWith(patch),
    currentFolder,
    onFileWritten: vi.fn(),
  }
}

beforeEach(() => {
  invokeMock.mockReset()
})

describe('Agent 工具权限与路径守卫', () => {
  it('允许目录优先取设置，其次回落到当前文件夹', () => {
    expect(resolveAgentRoots(settingsWith(), 'D:/other')).toEqual(['D:/notes'])
    expect(resolveAgentRoots(settingsWith({ mcpAllowedRoots: '' }), 'D:/other')).toEqual(['D:/other'])
    expect(resolveAgentRoots(settingsWith({ mcpAllowedRoots: 'D:/a\nD:/b' }), null)).toEqual(['D:/a', 'D:/b'])
    expect(resolveAgentRoots(settingsWith({ mcpAllowedRoots: '' }), null)).toEqual([])
  })

  it('路径比较忽略分隔符与大小写，并阻止目录外访问', () => {
    expect(isPathInsideRoots('d:\\notes\\a.md', ['D:/notes'])).toBe(true)
    expect(isPathInsideRoots('D:/notes/sub/a.md', ['D:/notes'])).toBe(true)
    expect(isPathInsideRoots('D:/notes-other/a.md', ['D:/notes'])).toBe(false)
    expect(isPathInsideRoots('D:/etc/a.md', ['D:/notes'])).toBe(false)
    expect(isMarkdownPath('a.MD')).toBe(true)
    expect(isMarkdownPath('a.markdown')).toBe(true)
    expect(isMarkdownPath('a.txt')).toBe(false)
  })

  it('只读模式禁止写入类工具，提示词也只暴露可用工具', () => {
    expect(canUseAgentTool('read-only', 'read_markdown')).toBe(true)
    expect(canUseAgentTool('read-only', 'write_markdown')).toBe(false)
    expect(canUseAgentTool('data-read-write', 'write_markdown')).toBe(true)
    expect(canUseAgentTool(undefined, 'append_markdown')).toBe(true)

    const readOnlyPrompt = describeAgentTools('read-only')
    expect(readOnlyPrompt).toContain('read_markdown')
    expect(readOnlyPrompt).not.toContain('write_markdown')
  })
})

describe('Agent 工具执行', () => {
  it('读取允许范围内的 Markdown 笔记', async () => {
    invokeMock.mockResolvedValue('笔记内容')
    const outcome = await executeAgentTool('read_markdown', { path: 'D:\\notes\\首页.md' }, context())

    expect(outcome.ok).toBe(true)
    expect(outcome.data).toEqual({ path: 'D:\\notes\\首页.md', content: '笔记内容' })
    expect(invokeMock).toHaveBeenCalledWith('read_file_command', { path: 'D:\\notes\\首页.md' })
  })

  it('拒绝越权路径、非 Markdown 文件与未知工具', async () => {
    const outside = await executeAgentTool('read_markdown', { path: 'D:\\secret\\a.md' }, context())
    const notMarkdown = await executeAgentTool('read_markdown', { path: 'D:\\notes\\a.txt' }, context())
    const unknown = await executeAgentTool('delete_everything', { path: 'D:\\notes\\a.md' }, context())

    expect(outside).toMatchObject({ ok: false })
    expect(outside.summary).toContain('不在允许范围')
    expect(notMarkdown.summary).toContain('.md')
    expect(unknown.summary).toContain('未知工具')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('只读权限下拒绝写入并说明原因', async () => {
    const outcome = await executeAgentTool(
      'write_markdown',
      { path: 'D:\\notes\\首页.md', content: '新内容' },
      context({ mcpPermissionMode: 'read-only' }),
    )

    expect(outcome.ok).toBe(false)
    expect(outcome.summary).toContain('read-only')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('写入时带快照上限、回调同步标签页并记录前后内容', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'read_file_command') return Promise.resolve('旧内容')
      return Promise.resolve({})
    })
    const ctx = context({ versionSnapshotLimit: 25 })
    const outcome = await executeAgentTool(
      'write_markdown',
      { path: 'D:\\notes\\首页.md', content: '新内容' },
      ctx,
    )

    expect(outcome.ok).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('write_file_command', {
      path: 'D:\\notes\\首页.md',
      content: '新内容',
      snapshotLimit: 25,
    })
    expect(ctx.onFileWritten).toHaveBeenCalledWith('D:\\notes\\首页.md', '新内容')
    expect(outcome.change).toMatchObject({ path: 'D:\\notes\\首页.md', before: '旧内容', after: '新内容' })
  })

  it('追加写入以磁盘内容为基线，新建文件时基线为空', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'read_file_command') return Promise.resolve('已有内容')
      return Promise.resolve({})
    })
    const append = await executeAgentTool(
      'append_markdown',
      { path: 'D:\\notes\\首页.md', content: '补充内容' },
      context(),
    )
    expect(append.change).toMatchObject({ before: '已有内容', after: '已有内容补充内容' })

    invokeMock.mockImplementation((command: string) => {
      if (command === 'read_file_command') return Promise.reject(new Error('文件不存在'))
      return Promise.resolve({})
    })
    const created = await executeAgentTool(
      'write_markdown',
      { path: 'D:\\notes\\新笔记.md', content: '正文' },
      context(),
    )
    expect(created.change).toMatchObject({ before: '', after: '正文' })
  })

  it('列出笔记、搜索并过滤非 Markdown 命中、提取大纲', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'scan_directory') return Promise.resolve(tree)
      if (command === 'search_in_files') {
        return Promise.resolve({
          totalMatches: 2,
          matches: [
            { filePath: 'D:\\notes\\首页.md', fileName: '首页.md', lineNumber: 2, lineText: '命中' },
            { filePath: 'D:\\notes\\图片.png', fileName: '图片.png', lineNumber: 1, lineText: '命中' },
          ],
        })
      }
      if (command === 'read_file_command') return Promise.resolve('# 标题\n\n```\n# 代码里的井号\n```\n\n## 二级')
      return Promise.resolve({})
    })

    const listed = await executeAgentTool('list_markdown_files', {}, context())
    expect(listed.data).toMatchObject({ count: 1 })

    const searched = await executeAgentTool('search_markdown', { query: '命中' }, context())
    expect(searched.data).toMatchObject({ count: 1 })
    expect(invokeMock).toHaveBeenCalledWith('search_in_files', {
      dirPath: 'D:/notes',
      query: '命中',
      caseSensitive: false,
      useRegex: false,
      wholeWord: false,
    })

    const outline = await executeAgentTool('get_markdown_outline', { path: 'D:\\notes\\首页.md' }, context())
    expect(outline.data).toMatchObject({
      count: 2,
      headings: [
        { level: 1, text: '标题', line: 1 },
        { level: 2, text: '二级', line: 7 },
      ],
    })
  })

  it('没有允许目录时给出明确错误', async () => {
    const outcome = await executeAgentTool(
      'list_markdown_files',
      {},
      context({ mcpAllowedRoots: '' }, null),
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.summary).toContain('打开文件夹')
  })
})
