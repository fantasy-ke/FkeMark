import { describe, expect, it } from 'vitest'
import {
  buildSearchResultList,
  buildSearchResultTree,
  collectCollapsiblePaths,
  contentMatches,
  groupSearchMatches,
  hasFileNameMatch,
  normalizeSearchPath,
} from '../src/utils/searchResults'
import type { SearchMatchResult } from '../src/components/CommandPalette'

function match(
  filePath: string,
  fileName: string,
  options: { isFileNameMatch?: boolean; lineNumber?: number } = {},
): SearchMatchResult {
  return {
    filePath,
    fileName,
    lineNumber: options.lineNumber ?? 1,
    column: 1,
    lineText: '目标',
    matchStart: 0,
    matchEnd: 2,
    isFileNameMatch: options.isFileNameMatch ?? false,
  }
}

describe('searchResults 分组', () => {
  it('按文件路径分组并保持原有顺序', () => {
    const groups = groupSearchMatches([
      match('D:/n/b.md', 'b.md'),
      match('D:/n/a.md', 'a.md'),
      match('D:/n/b.md', 'b.md', { lineNumber: 7 }),
    ])

    expect(groups.map((group) => group.fileName)).toEqual(['b.md', 'a.md'])
    expect(groups[0].matches).toHaveLength(2)
    expect(groups[1].matches).toHaveLength(1)
  })

  it('统一分隔符并去掉结尾分隔符', () => {
    expect(normalizeSearchPath('D:\\notes\\guide\\')).toBe('D:/notes/guide')
    expect(normalizeSearchPath('D:/notes/guide')).toBe('D:/notes/guide')
  })
})

describe('searchResults 树形结构', () => {
  const groups = groupSearchMatches([
    match('D:/notes/guide/intro.md', 'intro.md'),
    match('D:/notes/guide/deep/nested.md', 'nested.md'),
    match('D:/notes/目标笔记.md', '目标笔记.md', { isFileNameMatch: true }),
  ])

  it('按根目录展开目录层级', () => {
    const tree = buildSearchResultTree(groups, 'D:/notes')

    // 目录在前、文件在后
    expect(tree.map((node) => node.name)).toEqual(['guide', '目标笔记.md'])
    const guide = tree[0]
    expect(guide.type).toBe('folder')
    expect(guide.path).toBe('D:/notes/guide')
    expect(guide.children.map((node) => node.name)).toEqual(['deep', 'intro.md'])

    const deep = guide.children[0]
    expect(deep.type).toBe('folder')
    expect(deep.children[0].name).toBe('nested.md')
    expect(deep.children[0].type).toBe('file')
  })

  it('兼容反斜杠路径与根目录', () => {
    const tree = buildSearchResultTree(
      groupSearchMatches([match('D:\\notes\\guide\\intro.md', 'intro.md')]),
      'D:/notes',
    )

    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('guide')
    expect(tree[0].children[0].name).toBe('intro.md')
  })

  it('不在根目录下时退化为文件名', () => {
    const tree = buildSearchResultTree(
      groupSearchMatches([match('E:/other/place/note.md', 'note.md')]),
      'D:/notes',
    )

    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('note.md')
    expect(tree[0].type).toBe('file')
  })

  it('同名目录下的多个文件合并到同一节点', () => {
    const tree = buildSearchResultTree(
      groupSearchMatches([
        match('D:/notes/guide/a.md', 'a.md'),
        match('D:/notes/guide/b.md', 'b.md'),
      ]),
      'D:/notes',
    )

    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((node) => node.name)).toEqual(['a.md', 'b.md'])
  })
})

describe('searchResults 列表结构与折叠', () => {
  it('列表结构是扁平的，与树形共用同一套节点', () => {
    const list = buildSearchResultList(groupSearchMatches([
      match('D:/notes/guide/intro.md', 'intro.md'),
      match('D:/notes/目标笔记.md', '目标笔记.md', { isFileNameMatch: true }),
    ]))

    expect(list.map((node) => node.name)).toEqual(['intro.md', '目标笔记.md'])
    expect(list.every((node) => node.type === 'file' && node.children.length === 0)).toBe(true)
  })

  it('文件名命中不占用命中行', () => {
    const list = buildSearchResultList(groupSearchMatches([
      match('D:/notes/a.md', 'a.md', { isFileNameMatch: true }),
      match('D:/notes/a.md', 'a.md', { lineNumber: 4 }),
    ]))

    expect(contentMatches(list[0])).toHaveLength(1)
    expect(hasFileNameMatch(list[0])).toBe(true)
  })

  it('可折叠节点包含有内容的目录与文件，跳过只有文件名命中的文件', () => {
    const tree = buildSearchResultTree(
      groupSearchMatches([
        match('D:/notes/guide/intro.md', 'intro.md'),
        match('D:/notes/目标笔记.md', '目标笔记.md', { isFileNameMatch: true }),
      ]),
      'D:/notes',
    )

    expect(collectCollapsiblePaths(tree)).toEqual([
      'D:/notes/guide',
      'D:/notes/guide/intro.md',
    ])
  })
})
