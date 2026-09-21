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

function clampToBounds(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 确定性力导向布局（Fruchterman-Reingold 变体）。
 * 初始位置按索引均分在圆周上且不使用随机数，因此同一图谱每次得到相同坐标，便于测试与稳定渲染。
 */
export function computeLinkGraphLayout(
  graph: WikiLinkGraph,
  options: { width: number; height: number; iterations?: number },
): Record<string, LinkGraphPoint> {
  const { width, height } = options
  const nodes = graph.nodes
  const layout: Record<string, LinkGraphPoint> = {}
  if (nodes.length === 0) return layout

  const padding = 26
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.max(20, Math.min(width, height) / 2 - padding - 12)
  const positions = nodes.map((_node, index) => {
    if (nodes.length === 1) return { x: centerX, y: centerY }
    const angle = (index / nodes.length) * Math.PI * 2
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }
  })

  if (nodes.length > 1) {
    const indexByPath = new Map(nodes.map((node, index) => [node.path, index]))
    const links = graph.edges
      .map((edge) => ({ source: indexByPath.get(edge.source), target: indexByPath.get(edge.target) }))
      .filter((edge): edge is { source: number; target: number } =>
        edge.source !== undefined && edge.target !== undefined)
    const iterations = options.iterations
      ?? clampToBounds(Math.round(6000 / nodes.length), 40, 220)
    const ideal = Math.sqrt((width * height) / nodes.length) * 0.55
    const displacement = positions.map(() => ({ x: 0, y: 0 }))

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const item of displacement) { item.x = 0; item.y = 0 }

      for (let a = 0; a < positions.length; a += 1) {
        for (let b = a + 1; b < positions.length; b += 1) {
          let dx = positions[a].x - positions[b].x
          let dy = positions[a].y - positions[b].y
          let distance = Math.hypot(dx, dy)
          if (distance < 0.01) {
            // 完全重合时按索引给一个确定性的微小偏移，避免除零。
            dx = (a - b) * 0.01
            dy = 0.01
            distance = Math.hypot(dx, dy)
          }
          const force = (ideal * ideal) / distance
          displacement[a].x += (dx / distance) * force
          displacement[a].y += (dy / distance) * force
          displacement[b].x -= (dx / distance) * force
          displacement[b].y -= (dy / distance) * force
        }
      }

      for (const link of links) {
        const dx = positions[link.source].x - positions[link.target].x
        const dy = positions[link.source].y - positions[link.target].y
        const distance = Math.max(0.01, Math.hypot(dx, dy))
        const force = (distance * distance) / ideal
        displacement[link.source].x -= (dx / distance) * force
        displacement[link.source].y -= (dy / distance) * force
        displacement[link.target].x += (dx / distance) * force
        displacement[link.target].y += (dy / distance) * force
      }

      const temperature = 12 * (1 - iteration / iterations) + 1
      for (let index = 0; index < positions.length; index += 1) {
        displacement[index].x += (centerX - positions[index].x) * 0.02
        displacement[index].y += (centerY - positions[index].y) * 0.02
        const magnitude = Math.hypot(displacement[index].x, displacement[index].y)
        if (magnitude < 0.01) continue
        const step = Math.min(magnitude, temperature)
        positions[index].x = clampToBounds(
          positions[index].x + (displacement[index].x / magnitude) * step,
          padding,
          width - padding,
        )
        positions[index].y = clampToBounds(
          positions[index].y + (displacement[index].y / magnitude) * step,
          padding,
          height - padding,
        )
      }
    }
  }

  nodes.forEach((node, index) => {
    layout[node.path] = { x: positions[index].x, y: positions[index].y }
  })
  return layout
}

/** 由文件树取出图谱候选笔记路径（按路径排序，保证截断结果稳定）。 */
export function collectGraphNotePaths(fileTree: FileTreeNode[], limit = MAX_GRAPH_NODES): string[] {
  return flattenMarkdownFiles(fileTree)
    .map((node) => node.path)
    .sort(comparePath)
    .slice(0, Math.max(0, limit))
}
