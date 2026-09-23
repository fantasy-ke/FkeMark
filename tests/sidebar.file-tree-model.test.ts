import { describe, expect, it } from 'vitest'
import type { FileTreeNode } from '../src/types'
import { filterFileTree, sortFileTree } from '../src/components/sidebar/fileTreeModel'

const tree: FileTreeNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'folder',
    children: [
      { name: 'zeta.md', path: 'src/zeta.md', type: 'file' },
      { name: 'alpha.md', path: 'src/alpha.md', type: 'file' },
    ],
  },
  { name: 'readme.md', path: 'readme.md', type: 'file' },
]

describe('file tree model', () => {
  it('按名称排序时文件夹仍在文件前面', () => {
    const sorted = sortFileTree(tree, 'name')
    expect(sorted.map((node) => node.name)).toEqual(['src', 'readme.md'])
    expect(sorted[0].children?.map((node) => node.name)).toEqual(['alpha.md', 'zeta.md'])
  })

  it('筛选时保留命中文件的父目录', () => {
    const filtered = filterFileTree(tree, 'alpha')
    expect(filtered).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'folder',
        children: [{ name: 'alpha.md', path: 'src/alpha.md', type: 'file' }],
      },
    ])
  })
})
