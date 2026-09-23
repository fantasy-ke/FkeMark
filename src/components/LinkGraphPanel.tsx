import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Network, RefreshCw, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { FileTreeNode } from '../types'
import { isTauri } from '../utils/tauri'
import {
  MAX_GRAPH_NODES,
  buildWikiLinkGraph,
  collectGraphNotePaths,
  countGraphLinks,
  type LinkGraphPoint,
  type WikiLinkGraph,
} from '../utils/markdown/linkGraph'
import {
  createLinkGraphSimulation,
  graphNodeRadius,
  type LinkGraphSimulation,
} from '../utils/markdown/linkGraphSimulation'

interface CachedMarkdownFile {
  path?: string
  content: string
}

interface LinkGraphPanelProps {
  currentFile: string | null
  fileTree: FileTreeNode[]
  cachedFiles?: ReadonlyMap<string, CachedMarkdownFile>
  onOpenFile: (path: string) => void | Promise<void>
  /** 递增后打开图谱，供侧栏活动栏调用 */
  openToken?: number
}

interface CanvasSize {
  width: number
  height: number
}

interface EdgeElement {
  element: SVGLineElement
  source: string
  target: string
}

interface NodeElement {
  group: SVGGElement
  circle: SVGCircleElement | null
  label: SVGTextElement | null
}

/** 画布视图变换：滚轮缩放、空白处拖动平移。 */
interface GraphView {
  scale: number
  x: number
  y: number
}

// 还没有测量到画布尺寸时的兜底（首帧与 jsdom 都没有布局信息）。
const FALLBACK_SIZE: CanvasSize = { width: 480, height: 420 }
const MIN_MEASURED_SIZE = 80
/** 拖动时把冷却系数抬到该值，让周围的圆点跟着弹性让位。 */
const DRAG_ALPHA = 0.65
const RELEASE_ALPHA = 0.45
const MIN_ZOOM = 0.4
const MAX_ZOOM = 4
const ZOOM_SENSITIVITY = 0.0016
const DEFAULT_VIEW: GraphView = { scale: 1, x: 0, y: 0 }

async function readMarkdownFile(path: string): Promise<string> {
  if (isTauri()) return invoke<string>('read_file_command', { path })
  const response = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  return response.text()
}

function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

export function LinkGraphPanel({ currentFile, fileTree, cachedFiles, onOpenFile, openToken = 0 }: LinkGraphPanelProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const seenOpenToken = useRef(openToken)
  const [refreshKey, setRefreshKey] = useState(0)
  const [graph, setGraph] = useState<WikiLinkGraph>({ nodes: [], edges: [], truncated: false })
  const [loading, setLoading] = useState(false)
  const [failedCount, setFailedCount] = useState(0)
  const [hovered, setHovered] = useState<string | null>(null)
  // 画布尺寸测量完成后才创建物理模型，保证同一尺寸下的初始坐标与最终布局稳定。
  const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null)
  const [view, setView] = useState<GraphView>(DEFAULT_VIEW)
  // 图谱稳定后动画循环会停下；拖动、刷新、尺寸变化时用它重新点火。
  const [runToken, setRunToken] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<LinkGraphSimulation | null>(null)
  const nodeElementsRef = useRef(new Map<string, NodeElement>())
  const edgeElementsRef = useRef<EdgeElement[]>([])
  const draggingRef = useRef<{ path: string; pointerId: number } | null>(null)
  const panningRef = useRef<{ pointerId: number; startX: number; startY: number; viewX: number; viewY: number } | null>(null)
  const draggedRef = useRef(false)
  const viewRef = useRef(view)
  viewRef.current = view
  // 与反向链接面板一致：没有打开的 Markdown 文档时不渲染入口，
  // 否则欢迎页（无标签页）上会浮着一个无意义的图谱按钮。
  const currentIsMarkdown = Boolean(currentFile && /\.(?:md|markdown)$/i.test(currentFile))

  const allNotePaths = useMemo(() => collectGraphNotePaths(fileTree, Number.MAX_SAFE_INTEGER), [fileTree])
  const notePaths = useMemo(() => allNotePaths.slice(0, MAX_GRAPH_NODES), [allNotePaths])

  useEffect(() => {
    if (!openToken || openToken === seenOpenToken.current) return
    seenOpenToken.current = openToken
    setOpen(true)
  }, [openToken])

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

  /** 画布尺寸按真实像素测量，图谱因此铺满面板而不是被塞进一个正方形。 */
  useLayoutEffect(() => {
    if (!open) return
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const rect = svg.getBoundingClientRect()
      const width = rect.width >= MIN_MEASURED_SIZE ? Math.round(rect.width) : FALLBACK_SIZE.width
      const height = rect.height >= MIN_MEASURED_SIZE ? Math.round(rect.height) : FALLBACK_SIZE.height
      setCanvasSize((current) => (current && current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [open, graph.nodes.length])

  // 物理模型在图谱或画布尺寸变化时同步；放在 layout 阶段，新节点不会先在角落闪一帧。
  useLayoutEffect(() => {
    if (!canvasSize) return
    const simulation = simulationRef.current
    if (!simulation) {
      simulationRef.current = createLinkGraphSimulation(graph, canvasSize)
      return
    }
    simulation.updateGraph(graph)
    simulation.resize(canvasSize.width, canvasSize.height)
  }, [canvasSize, graph])

  const applyPositions = useCallback(() => {
    const simulation = simulationRef.current
    if (!simulation) return
    for (const [path, node] of nodeElementsRef.current) {
      const point = simulation.positionOf(path)
      if (!point) continue
      const radius = simulation.radiusOf(path)
      node.group.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`)
      // 半径随「离中心多远」变化，所以圆点大小与标签位置每帧同步。
      node.circle?.setAttribute('r', radius.toFixed(2))
      node.label?.setAttribute('y', (radius + 13).toFixed(2))
    }
    for (const edge of edgeElementsRef.current) {
      const source = simulation.positionOf(edge.source)
      const target = simulation.positionOf(edge.target)
      if (!source || !target) continue
      edge.element.setAttribute('x1', source.x.toFixed(2))
      edge.element.setAttribute('y1', source.y.toFixed(2))
      edge.element.setAttribute('x2', target.x.toFixed(2))
      edge.element.setAttribute('y2', target.y.toFixed(2))
    }
  }, [])

  useLayoutEffect(() => {
    const svg = svgRef.current
    const nodes = new Map<string, NodeElement>()
    const edges: EdgeElement[] = []
    if (svg) {
      svg.querySelectorAll<SVGGElement>('g.link-graph-node').forEach((element) => {
        const path = element.dataset.path
        if (!path) return
        nodes.set(path, {
          group: element,
          circle: element.querySelector<SVGCircleElement>('circle'),
          label: element.querySelector<SVGTextElement>('text'),
        })
      })
      svg.querySelectorAll<SVGLineElement>('line.link-graph-edge').forEach((element) => {
        const source = element.dataset.source
        const target = element.dataset.target
        if (source && target) edges.push({ element, source, target })
      })
    }
    nodeElementsRef.current = nodes
    edgeElementsRef.current = edges
    applyPositions()
  }, [applyPositions, canvasSize, graph])

  // 滚轮缩放：React 的 onWheel 是被动监听，无法 preventDefault，因此这里挂原生非被动监听。
  useEffect(() => {
    const svg = svgRef.current
    if (!open || !svg) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      // viewBox 与像素 1:1，鼠标位置可直接当画布坐标使用。
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      setView((current) => {
        const scale = clampZoom(current.scale * Math.exp(-event.deltaY * ZOOM_SENSITIVITY))
        const ratio = scale / current.scale
        return {
          scale,
          // 以指针为锚点缩放：指针下的那个笔记保持不动。
          x: pointerX - (pointerX - current.x) * ratio,
          y: pointerY - (pointerY - current.y) * ratio,
        }
      })
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [open, graph.nodes.length])

  // 动画循环：每帧推进物理并把坐标直接写进 DOM，避免 60fps 触发 React 重渲染。
  useEffect(() => {
    if (!open || graph.nodes.length === 0) return
    const simulation = simulationRef.current
    if (!simulation) return
    let frame = window.requestAnimationFrame(function step() {
      const active = simulation.tick()
      applyPositions()
      frame = active ? window.requestAnimationFrame(step) : 0
    })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [applyPositions, canvasSize, graph, open, runToken])

  const neighbours = useMemo(() => {
    if (!hovered) return null
    const set = new Set<string>([hovered])
    for (const edge of graph.edges) {
      if (edge.source === hovered) set.add(edge.target)
      if (edge.target === hovered) set.add(edge.source)
    }
    return set
  }, [hovered, graph])

  function toLayoutPoint(clientX: number, clientY: number): LinkGraphPoint | null {
    const svg = svgRef.current
    if (!svg || typeof svg.getScreenCTM !== 'function') return null
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const local = point.matrixTransform(matrix.inverse())
    // 画布坐标还要反解视图变换，才能得到节点所在的图谱坐标。
    const current = viewRef.current
    return { x: (local.x - current.x) / current.scale, y: (local.y - current.y) / current.scale }
  }

  /** 空白处拖动平移整个画布。 */
  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    panningRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function movePan(event: ReactPointerEvent<SVGSVGElement>) {
    const panning = panningRef.current
    if (!panning || panning.pointerId !== event.pointerId) return
    // viewBox 与像素 1:1，屏幕位移可以直接当作画布位移。
    setView((current) => ({
      ...current,
      x: panning.viewX + (event.clientX - panning.startX),
      y: panning.viewY + (event.clientY - panning.startY),
    }))
  }

  function endPan(event: ReactPointerEvent<SVGSVGElement>) {
    const panning = panningRef.current
    if (!panning || panning.pointerId !== event.pointerId) return
    panningRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, path: string) {
    if (event.button !== 0) return
    event.stopPropagation()
    draggedRef.current = false
    draggingRef.current = { path, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = toLayoutPoint(event.clientX, event.clientY)
    if (point) simulationRef.current?.pin(path, point)
    simulationRef.current?.reheat(DRAG_ALPHA)
    setRunToken((token) => token + 1)
  }

  function moveDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragging = draggingRef.current
    if (!dragging || dragging.pointerId !== event.pointerId) return
    const point = toLayoutPoint(event.clientX, event.clientY)
    if (!point) return
    draggedRef.current = true
    // 拖动中节点被钉在指针上，其余节点靠弹簧与斥力弹性让位。
    simulationRef.current?.pin(dragging.path, point)
    setRunToken((token) => token + 1)
  }

  function endDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragging = draggingRef.current
    if (!dragging || dragging.pointerId !== event.pointerId) return
    draggingRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    // 松手后保留拖动速度，节点带着惯性滑一段再重新稳定。
    simulationRef.current?.unpin(dragging.path)
    simulationRef.current?.reheat(RELEASE_ALPHA)
    setRunToken((token) => token + 1)
  }

  function handleNodeClick(path: string) {
    // 拖动结束后触发的 click 不应打开笔记。
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    void onOpenFile(path)
  }

  if (!currentIsMarkdown) return null

  const linkCount = countGraphLinks(graph)
  const totalNotes = allNotePaths.length
  const showLabels = graph.nodes.length <= 60

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
              {!loading && <span className="link-graph-count">{graph.nodes.length}</span>}
            </div>
            <div className="link-graph-actions">
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
            ) : graph.nodes.length === 0 ? (
              <div className="link-graph-empty">{t('graph.empty')}</div>
            ) : (
              <>
                <svg
                  ref={svgRef}
                  className="link-graph-canvas"
                  viewBox={`0 0 ${(canvasSize ?? FALLBACK_SIZE).width} ${(canvasSize ?? FALLBACK_SIZE).height}`}
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label={t('graph.title')}
                  onPointerDown={startPan}
                  onPointerMove={movePan}
                  onPointerUp={endPan}
                  onPointerCancel={endPan}
                  onDoubleClick={() => setView(DEFAULT_VIEW)}
                >
                  <g
                    className="link-graph-viewport"
                    transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
                  >
                    <g className="link-graph-edges">
                      {graph.edges.map((edge) => {
                        const dimmed = Boolean(neighbours)
                          && !(neighbours!.has(edge.source) && neighbours!.has(edge.target))
                        return (
                          <line
                            key={`${edge.source}->${edge.target}`}
                            className={`link-graph-edge${dimmed ? ' is-dimmed' : ''}`}
                            data-source={edge.source}
                            data-target={edge.target}
                            strokeWidth={Math.min(3, 1 + edge.count * 0.4)}
                          />
                        )
                      })}
                    </g>
                    <g className="link-graph-nodes">
                      {graph.nodes.map((node) => {
                        const degree = node.outLinks + node.backLinks
                        const isCurrent = Boolean(currentFile)
                          && node.path.replace(/\\/g, '/').toLocaleLowerCase()
                            === currentFile!.replace(/\\/g, '/').toLocaleLowerCase()
                        const dimmed = Boolean(neighbours) && !neighbours!.has(node.path)
                        const labelVisible = showLabels || isCurrent || hovered === node.path
                        // 有双链的笔记用强调色，孤立笔记保持灰色。
                        const linked = degree > 0
                        return (
                          <g
                            key={node.path}
                            className={`link-graph-node${linked ? ' is-linked' : ''}${isCurrent ? ' is-current' : ''}${dimmed ? ' is-dimmed' : ''}`}
                            data-path={node.path}
                            onPointerDown={(event) => startDrag(event, node.path)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onPointerEnter={() => setHovered(node.path)}
                            onPointerLeave={() => setHovered(null)}
                            onClick={() => handleNodeClick(node.path)}
                          >
                            <title>{t('graph.nodeHint', { out: node.outLinks, back: node.backLinks })}</title>
                            <circle r={graphNodeRadius(degree)} />
                            {labelVisible && (
                              <text className="link-graph-label" y={graphNodeRadius(degree) + 13}>{node.name}</text>
                            )}
                          </g>
                        )
                      })}
                    </g>
                  </g>
                </svg>
                <div className="link-graph-stats">
                  {t('graph.stats', { notes: graph.nodes.length, links: linkCount })}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </>
  )
}
