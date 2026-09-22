import type { FileTreeNode } from '../../types'
import { findWikiLinkOccurrences, flattenMarkdownFiles, resolveWikiNotePath } from './wikiLinks'

/** 图谱最多渲染的笔记数，超出时只保留链接最密集的部分。 */
export const MAX_GRAPH_NODES = 200

export interface MarkdownFileContent {
  path: string
  content: string
}

export interface WikiGraphNode {
  path: string
  name: string
  /** 指向其他笔记的双链条数。 */
  outLinks: number
  /** 被其他笔记引用的双链条数。 */
  backLinks: number
}

export interface WikiGraphEdge {
  source: string
  target: string
  /** 同一对笔记之间的双链条数。 */
  count: number
}

export interface WikiLinkGraph {
  nodes: WikiGraphNode[]
  edges: WikiGraphEdge[]
  /** 笔记总数超过上限时为 true。 */
  truncated: boolean
}

export interface LinkGraphPoint {
  x: number
  y: number
}

function noteNameFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop() || path
  return name.replace(/\.(?:md|markdown)$/i, '')
}

// 按码位比较而非 localeCompare：图谱截断与布局需要跨环境稳定的顺序。
function comparePath(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * 由「路径 + 内容」列表构建双链图谱。
 * 只包含已解析到实际笔记的双链，指向不存在笔记的链接会被忽略。
 */
export function buildWikiLinkGraph(
  files: MarkdownFileContent[],
  limit = MAX_GRAPH_NODES,
): WikiLinkGraph {
  const paths = files.map((file) => file.path)
  const outCounts = new Map<string, number>()
  const backCounts = new Map<string, number>()
  const edgeCounts = new Map<string, WikiGraphEdge>()

  for (const file of files) {
    for (const occurrence of findWikiLinkOccurrences(file.content)) {
      const target = resolveWikiNotePath(paths, occurrence.target)
      if (!target || target === file.path) continue
      outCounts.set(file.path, (outCounts.get(file.path) || 0) + 1)
      backCounts.set(target, (backCounts.get(target) || 0) + 1)
      const key = `${file.path}\u0000${target}`
      const existing = edgeCounts.get(key)
      if (existing) existing.count += 1
      else edgeCounts.set(key, { source: file.path, target, count: 1 })
    }
  }

  const ranked = files
    .map((file) => ({
      path: file.path,
      name: noteNameFromPath(file.path),
      outLinks: outCounts.get(file.path) || 0,
      backLinks: backCounts.get(file.path) || 0,
    }))
    .sort((a, b) => {
      const degree = (b.outLinks + b.backLinks) - (a.outLinks + a.backLinks)
      return degree !== 0 ? degree : comparePath(a.path, b.path)
    })

  const nodes = ranked.slice(0, Math.max(0, limit))
  const kept = new Set(nodes.map((node) => node.path))

  return {
    nodes,
    edges: [...edgeCounts.values()]
      .filter((edge) => kept.has(edge.source) && kept.has(edge.target))
      .sort((a, b) => comparePath(a.source, b.source) || comparePath(a.target, b.target)),
    truncated: ranked.length > nodes.length,
  }
}

export function countGraphLinks(graph: WikiLinkGraph): number {
  return graph.edges.reduce((total, edge) => total + edge.count, 0)
}

/** 由文件树取出图谱候选笔记路径（按路径排序，保证截断结果稳定）。 */
export function collectGraphNotePaths(fileTree: FileTreeNode[], limit = MAX_GRAPH_NODES): string[] {
  return flattenMarkdownFiles(fileTree)
    .map((node) => node.path)
    .sort(comparePath)
    .slice(0, Math.max(0, limit))
}
