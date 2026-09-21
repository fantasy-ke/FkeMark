import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Network, RefreshCw, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { FileTreeNode } from '../types'
import { isTauri } from '../utils/tauri'
import {
  MAX_GRAPH_NODES,
  buildWikiLinkGraph,
  collectGraphNotePaths,
  computeLinkGraphLayout,
  countGraphLinks,
  type LinkGraphPoint,
  type WikiLinkGraph,
} from '../utils/markdown/linkGraph'

interface CachedMarkdownFile {
  path?: string
  content: string
}

interface LinkGraphPanelProps {
  currentFile: string | null
  fileTree: FileTreeNode[]
  cachedFiles?: ReadonlyMap<string, CachedMarkdownFile>
  onOpenFile: (path: string) => void | Promise<void>
}

// 布局坐标系固定为正方形，渲染时由 SVG viewBox 自适应面板尺寸。
const LAYOUT_SIZE = 800
const MIN_RADIUS = 5
const MAX_RADIUS = 12

async function readMarkdownFile(path: string): Promise<string> {
  if (isTauri()) return invoke<string>('read_file_command', { path })
  const response = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  return response.text()
}

function nodeRadius(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.2)
}

export function LinkGraphPanel({ currentFile, fileTree, cachedFiles, onOpenFile }: LinkGraphPanelProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [graph, setGraph] = useState<WikiLinkGraph>({ nodes: [], edges: [], truncated: false })
  const [loading, setLoading] = useState(false)
  const [failedCount, setFailedCount] = useState(0)
  const [showOrphans, setShowOrphans] = useState(true)
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragOffsets, setDragOffsets] = useState<Record<string, LinkGraphPoint>>({})
  const svgRef = useRef<SVGSVGElement>(null)
  const draggingRef = useRef<{ path: string; pointerId: number } | null>(null)
  const draggedRef = useRef(false)

  const allNotePaths = useMemo(() => collectGraphNotePaths(fileTree, Number.MAX_SAFE_INTEGER), [fileTree])
  const notePaths = useMemo(() => allNotePaths.slice(0, MAX_GRAPH_NODES), [allNotePaths])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setFailedCount(0)

    const cachedContent = new Map(
      [...(cachedFiles?.values() ?? [])]
        .filter((file): file is CachedMarkdownFile & { path: string } => Boolean(file.path))
        .map((file) => [file.path.replace(/\\/g, '/').toLocaleLowerCase(), file.content]),
    )

    void Promise.all(notePaths.map(async (path) => {
      const cached = cachedContent.get(path.replace(/\\/g, '/').toLocaleLowerCase())
      if (cached !== undefined) return { path, content: cached }
      try {
        return { path, content: await readMarkdownFile(path) }
      } catch (error) {
        console.warn('Failed to read note for link graph:', path, error)
        return null
      }
    })).then((items) => {
      if (!active) return
      const readable = items.filter((item): item is { path: string; content: string } => item !== null)
      setFailedCount(items.length - readable.length)
      setGraph(buildWikiLinkGraph(readable))
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [cachedFiles, notePaths, open, refreshKey])

  const visibleGraph = useMemo<WikiLinkGraph>(() => {
    if (showOrphans) return graph
    const connected = new Set<string>()
    for (const edge of graph.edges) {
      connected.add(edge.source)
      connected.add(edge.target)
    }
    return { ...graph, nodes: graph.nodes.filter((node) => connected.has(node.path)) }
  }, [graph, showOrphans])

  const layout = useMemo(
    () => computeLinkGraphLayout(visibleGraph, { width: LAYOUT_SIZE, height: LAYOUT_SIZE }),
    [visibleGraph],
  )

  useEffect(() => {
    setDragOffsets({})
  }, [layout])

  const neighbours = useMemo(() => {
    if (!hovered) return null
    const set = new Set<string>([hovered])
    for (const edge of visibleGraph.edges) {
      if (edge.source === hovered) set.add(edge.target)
      if (edge.target === hovered) set.add(edge.source)
    }
    return set
  }, [hovered, visibleGraph])

  function positionOf(path: string): LinkGraphPoint | null {
    const base = layout[path]
    if (!base) return null
    const offset = dragOffsets[path]
    return offset ? { x: base.x + offset.x, y: base.y + offset.y } : base
  }

  function toLayoutPoint(clientX: number, clientY: number): LinkGraphPoint | null {
    const svg = svgRef.current
    if (!svg || typeof svg.getScreenCTM !== 'function') return null
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const local = point.matrixTransform(matrix.inverse())
    return { x: local.x, y: local.y }
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, path: string) {
    if (event.button !== 0) return
    event.stopPropagation()
    draggedRef.current = false
    draggingRef.current = { path, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragging = draggingRef.current
    if (!dragging || dragging.pointerId !== event.pointerId) return
    const base = layout[dragging.path]
    const next = toLayoutPoint(event.clientX, event.clientY)
    if (!base || !next) return
    draggedRef.current = true
    setDragOffsets((current) => ({
      ...current,
      [dragging.path]: { x: next.x - base.x, y: next.y - base.y },
    }))
  }

  function endDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragging = draggingRef.current
    if (!dragging || dragging.pointerId !== event.pointerId) return
    draggingRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function handleNodeClick(path: string) {
    // 拖动结束后触发的 click 不应打开笔记。
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    void onOpenFile(path)
  }

  const linkCount = countGraphLinks(visibleGraph)
  const totalNotes = allNotePaths.length
  const showLabels = visibleGraph.nodes.length <= 60

  return (
    <>
      {!open && (
        <button
          type="button"
          className="link-graph-toggle"
          title={t('graph.toggle')}
          aria-label={t('graph.toggle')}
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <Network size={17} />
        </button>
      )}

      {open && (
        <aside className="link-graph-panel" aria-label={t('graph.title')}>
          <header className="link-graph-header">
            <div className="link-graph-heading">
              <Network size={16} />
              <span>{t('graph.title')}</span>
              {!loading && <span className="link-graph-count">{visibleGraph.nodes.length}</span>}
            </div>
            <div className="link-graph-actions">
              <label className="link-graph-orphans">
                <input
                  type="checkbox"
                  checked={showOrphans}
                  onChange={(event) => setShowOrphans(event.target.checked)}
                />
                <span>{t('graph.showOrphans')}</span>
              </label>
              <button type="button" title={t('graph.refresh')} onClick={() => setRefreshKey((key) => key + 1)}>
                <RefreshCw size={15} />
              </button>
              <button type="button" title={t('graph.close')} onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="link-graph-body">
            {failedCount > 0 && <div className="link-graph-notice">{t('graph.partial', { count: failedCount })}</div>}
            {graph.truncated && (
              <div className="link-graph-notice">{t('graph.truncated', { total: totalNotes, shown: MAX_GRAPH_NODES })}</div>
            )}
            {loading ? (
              <div className="link-graph-empty">{t('graph.loading')}</div>
            ) : visibleGraph.nodes.length === 0 ? (
              <div className="link-graph-empty">{t('graph.empty')}</div>
            ) : (
              <>
                <svg
                  ref={svgRef}
                  className="link-graph-canvas"
                  viewBox={`0 0 ${LAYOUT_SIZE} ${LAYOUT_SIZE}`}
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label={t('graph.title')}
                >
                  <g className="link-graph-edges">
                    {visibleGraph.edges.map((edge) => {
                      const source = positionOf(edge.source)
                      const target = positionOf(edge.target)
                      if (!source || !target) return null
                      const dimmed = Boolean(neighbours)
                        && !(neighbours!.has(edge.source) && neighbours!.has(edge.target))
                      return (
                        <line
                          key={`${edge.source}->${edge.target}`}
                          className={`link-graph-edge${dimmed ? ' is-dimmed' : ''}`}
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          strokeWidth={Math.min(3, 1 + edge.count * 0.4)}
                        />
                      )
                    })}
                  </g>
                  <g className="link-graph-nodes">
                    {visibleGraph.nodes.map((node) => {
                      const point = positionOf(node.path)
                      if (!point) return null
                      const degree = node.outLinks + node.backLinks
                      const isCurrent = Boolean(currentFile)
                        && node.path.replace(/\\/g, '/').toLocaleLowerCase()
                          === currentFile!.replace(/\\/g, '/').toLocaleLowerCase()
                      const dimmed = Boolean(neighbours) && !neighbours!.has(node.path)
                      const labelVisible = showLabels || isCurrent || hovered === node.path
                      return (
                        <g
                          key={node.path}
                          className={`link-graph-node${isCurrent ? ' is-current' : ''}${dimmed ? ' is-dimmed' : ''}`}
                          transform={`translate(${point.x} ${point.y})`}
                          onPointerDown={(event) => startDrag(event, node.path)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          onPointerEnter={() => setHovered(node.path)}
                          onPointerLeave={() => setHovered(null)}
                          onClick={() => handleNodeClick(node.path)}
                        >
                          <title>{t('graph.nodeHint', { out: node.outLinks, back: node.backLinks })}</title>
                          <circle r={nodeRadius(degree)} />
                          {labelVisible && (
                            <text className="link-graph-label" y={nodeRadius(degree) + 13}>{node.name}</text>
                          )}
                        </g>
                      )
                    })}
                  </g>
                </svg>
                <div className="link-graph-stats">
                  {t('graph.stats', { notes: visibleGraph.nodes.length, links: linkCount })}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </>
  )
}
