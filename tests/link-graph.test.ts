import { describe, expect, it } from 'vitest'
import type { FileTreeNode } from '../src/types'
import {
  MAX_GRAPH_NODES,
  buildWikiLinkGraph,
  collectGraphNotePaths,
  countGraphLinks,
} from '../src/utils/markdown/linkGraph'

const files = [
  { path: 'D:\\notes\\首页.md', content: '入口，指向 [[项目]] 和 [[归档]]' },
  { path: 'D:\\notes\\项目.md', content: '项目说明，返回 [[首页]]' },
  { path: 'D:\\notes\\归档.md', content: '归档，返回 [[首页]]，并再次 [[首页]]' },
  { path: 'D:\\notes\\孤立.md', content: '没有任何双链' },
]

const fileTree: FileTreeNode[] = [
  {
    name: 'notes',
    path: 'D:\\notes',
    type: 'folder',
    children: [
      { name: '首页.md', path: 'D:\\notes\\首页.md', type: 'file' },
      { name: '项目.md', path: 'D:\\notes\\项目.md', type: 'file' },
      { name: '归档.md', path: 'D:\\notes\\归档.md', type: 'file' },
      { name: '图片.png', path: 'D:\\notes\\图片.png', type: 'file' },
    ],
  },
]

describe('双链图谱数据层', () => {
  it('按已解析的双链统计出链、反向链接与边权重', () => {
    const graph = buildWikiLinkGraph(files)
    const byPath = new Map(graph.nodes.map((node) => [node.path, node]))

    expect(graph.nodes).toHaveLength(4)
    expect(byPath.get('D:\\notes\\首页.md')).toMatchObject({ outLinks: 2, backLinks: 3 })
    expect(byPath.get('D:\\notes\\项目.md')).toMatchObject({ outLinks: 1, backLinks: 1 })
    expect(byPath.get('D:\\notes\\归档.md')).toMatchObject({ outLinks: 2, backLinks: 1 })
    expect(byPath.get('D:\\notes\\孤立.md')).toMatchObject({ outLinks: 0, backLinks: 0 })

    expect(graph.edges).toContainEqual({ source: 'D:\\notes\\归档.md', target: 'D:\\notes\\首页.md', count: 2 })
    expect(graph.edges).toContainEqual({ source: 'D:\\notes\\首页.md', target: 'D:\\notes\\项目.md', count: 1 })
    expect(countGraphLinks(graph)).toBe(5)
    expect(graph.truncated).toBe(false)
  })

  it('忽略自引用与指向不存在笔记的链接', () => {
    const graph = buildWikiLinkGraph([
      { path: 'D:\\notes\\a.md', content: '[[a]] 与 [[不存在的笔记]] 与 [[b]]' },
      { path: 'D:\\notes\\b.md', content: '正文' },
    ])

    expect(graph.edges).toEqual([{ source: 'D:\\notes\\a.md', target: 'D:\\notes\\b.md', count: 1 }])
    expect(graph.nodes.find((node) => node.path === 'D:\\notes\\a.md')).toMatchObject({ outLinks: 1 })
  })

  it('按连接度排序并在超过上限时截断', () => {
    const many = Array.from({ length: MAX_GRAPH_NODES + 5 }, (_item, index) => ({
      path: `D:\\notes\\note-${String(index).padStart(3, '0')}.md`,
      content: index === 0 ? '[[note-001]]' : '',
    }))
    const graph = buildWikiLinkGraph(many)

    expect(graph.nodes).toHaveLength(MAX_GRAPH_NODES)
    expect(graph.truncated).toBe(true)
    // 有链接的 note-000 / note-001 排在前面。
    expect(graph.nodes[0].path).toBe('D:\\notes\\note-000.md')
    expect(graph.nodes[1].path).toBe('D:\\notes\\note-001.md')
  })

  it('只从文件树收集 Markdown 笔记并按路径排序', () => {
    expect(collectGraphNotePaths(fileTree)).toEqual([
      'D:\\notes\\归档.md',
      'D:\\notes\\项目.md',
      'D:\\notes\\首页.md',
    ])
    expect(collectGraphNotePaths(fileTree, 2)).toHaveLength(2)
  })
})
