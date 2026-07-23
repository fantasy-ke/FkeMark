import { afterEach, describe, expect, it } from 'vitest'
import type { FileTreeNode } from '../src/types'
import { htmlToMarkdown, markdownToHtml, setMarkdownEngine } from '../src/utils/markdown/engine'
import {
  buildBacklinks,
  findWikiLinkOccurrences,
  findWikiNotePath,
  getWikiTargetFromHref,
  prepareWikiLinksForRendering,
  restoreWikiLinksFromMarkdown,
  wikiTargetToHref,
} from '../src/utils/markdown/wikiLinks'

const tree: FileTreeNode[] = [
  {
    name: '知识库',
    path: 'D:\\notes',
    type: 'folder',
    children: [
      { name: '首页.md', path: 'D:\\notes\\首页.md', type: 'file' },
      { name: '项目 A.md', path: 'D:\\notes\\项目 A.md', type: 'file' },
      {
        name: '归档',
        path: 'D:\\notes\\归档',
        type: 'folder',
        children: [{ name: '项目 A.md', path: 'D:\\notes\\归档\\项目 A.md', type: 'file' }],
      },
      { name: '图片.png', path: 'D:\\notes\\图片.png', type: 'file' },
    ],
  },
]

describe('Wiki 双向链接', () => {
  afterEach(() => setMarkdownEngine('third'))
  it('把双链转换为内部链接并可恢复原语法', () => {
    const href = wikiTargetToHref('项目 A')
    expect(href).toBe('#fkemark-wiki:%E9%A1%B9%E7%9B%AE%20A')
    expect(getWikiTargetFromHref(href)).toBe('项目 A')

    const prepared = prepareWikiLinksForRendering('关联 [[项目 A]]。')
    expect(prepared).toBe(`关联 [项目 A](${href})。`)
    expect(restoreWikiLinksFromMarkdown(prepared)).toBe('关联 [[项目 A]]。')
  })

  it.each(['third', 'builtin'] as const)('%s 引擎支持双链渲染与往返', (engine) => {
    setMarkdownEngine(engine)
    const html = markdownToHtml('前往 [[项目 A]]')
    expect(html).toContain('href="#fkemark-wiki:%E9%A1%B9%E7%9B%AE%20A"')
    expect(htmlToMarkdown(html)).toContain('[[项目 A]]')
  })
  it('忽略围栏代码、行内代码与转义语法', () => {
    const markdown = [
      '正文 [[首页]]',
      '',
      '```md',
      '[[代码示例]]',
      '```',
      '',
      '`[[行内示例]]` 与 \\[[已转义]]',
    ].join('\n')

    expect(findWikiLinkOccurrences(markdown)).toEqual([
      { target: '首页', line: 1, context: '正文 [[首页]]' },
    ])
    const prepared = prepareWikiLinksForRendering(markdown)
    expect(prepared).toContain('[首页](#fkemark-wiki:')
    expect(prepared).toContain('[[代码示例]]')
    expect(prepared).toContain('`[[行内示例]]`')
    expect(prepared).toContain('\\[[已转义]]')
  })

  it('按笔记名解析，并在指定目录时优先匹配路径', () => {
    expect(findWikiNotePath(tree, '首页')).toBe('D:\\notes\\首页.md')
    expect(findWikiNotePath(tree, '项目 A.md')).toBe('D:\\notes\\项目 A.md')
    expect(findWikiNotePath(tree, '归档/项目 A')).toBe('D:\\notes\\归档\\项目 A.md')
    expect(findWikiNotePath(tree, '不存在')).toBeNull()
  })

  it('构建指向当前笔记的反向链接并保留行号与上下文', () => {
    const files = [
      { path: 'D:\\notes\\首页.md', content: '# 首页' },
      { path: 'D:\\notes\\项目 A.md', content: '返回 [[首页]]\n再次提到 [[首页.md]]' },
      { path: 'D:\\notes\\忽略.md', content: '`[[首页]]`\n[[其他]]' },
    ]

    expect(buildBacklinks(files, 'D:\\notes\\首页.md')).toEqual([
      {
        target: '首页',
        line: 1,
        context: '返回 [[首页]]',
        filePath: 'D:\\notes\\项目 A.md',
        noteName: '项目 A',
      },
      {
        target: '首页.md',
        line: 2,
        context: '再次提到 [[首页.md]]',
        filePath: 'D:\\notes\\项目 A.md',
        noteName: '项目 A',
      },
    ])
  })
})