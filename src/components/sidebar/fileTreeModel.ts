import type { FileTreeNode } from '../../types'
import type { SidebarSortMode } from './layout'

function compareName(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function sortFileTree(nodes: FileTreeNode[], mode: SidebarSortMode): FileTreeNode[] {
  if (mode === 'source') return nodes
  const factor = mode === 'name-desc' ? -1 : 1
  return [...nodes]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return compareName(a.name.toLowerCase(), b.name.toLowerCase()) * factor
    })
    .map((node) => node.type === 'folder'
      ? { ...node, children: sortFileTree(node.children ?? [], mode) }
      : node)
}

export function filterFileTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes
  const matched: FileTreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      const children = filterFileTree(node.children ?? [], needle)
      if (children.length > 0 || node.name.toLowerCase().includes(needle)) {
        matched.push({ ...node, children })
      }
    } else if (node.name.toLowerCase().includes(needle)) {
      matched.push(node)
    }
  }
  return matched
}

export function collectFolderPaths(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    into.push(node.path)
    if (node.children) collectFolderPaths(node.children, into)
  }
  return into
}
