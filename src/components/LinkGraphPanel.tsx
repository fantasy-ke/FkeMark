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
import { REDUCED_MOTION_QUERY } from '../utils/motion'
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
const LAYOUT_FRAME_MS = 1000 / 60
const GRAPH_READ_CONCURRENCY = 4

async function readMarkdownFile(path: string, signal: AbortSignal): Promise<string> {
  if (isTauri()) return invoke<string>('read_file_command', { path })
  const response = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`, { signal })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  return response.text()
}

function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

/** WebView2 有时按“行”而不是像素上报滚轮，不换算的话缩放几乎看不出来。 */
function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight
  return event.deltaY
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
  const requestLayoutRef = useRef<((redraw?: boolean) => void) | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const simulationRef = useRef<LinkGraphSimulation | null>(null)
  const nodeElementsRef = useRef(new Map<string, NodeElement>())
  const edgeElementsRef = useRef<EdgeElement[]>([])
  const draggingRef = useRef<{ path: string; pointerId: number; target: SVGGElement } | null>(null)
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null)
  const panningRef = useRef<{ pointerId: number; target: SVGSVGElement; startX: number; startY: number; viewX: number; viewY: number } | null>(null)
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null)
  const wheelQueueRef = useRef<{ x: number; y: number; delta: number }[]>([])
  const draggedRef = useRef(false)
  const viewRef = useRef(view)
  viewRef.current = view
  const activeReadsRef = useRef<Array<Promise<void> | undefined>>([])
  // 与反向链接面板一致：没有打开的 Markdown 文档时不渲染入口，
  // 否则欢迎页（无标签页）上会浮着一个无意义的图谱按钮。
  const currentIsMarkdown = Boolean(currentFile && /\.(?:md|markdown)$/i.test(currentFile))
  const showGraph = open && currentIsMarkdown
  const hasCanvas = showGraph && !loading && graph.nodes.length > 0

  const allNotePaths = useMemo(() => collectGraphNotePaths(fileTree, Number.MAX_SAFE_INTEGER), [fileTree])
  const notePaths = useMemo(() => allNotePaths.slice(0, MAX_GRAPH_NODES), [allNotePaths])

  useEffect(() => {
    if (!openToken || openToken === seenOpenToken.current) return
    seenOpenToken.current = openToken
    setOpen(true)
  }, [openToken])

  useEffect(() => {
    if (!showGraph) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showGraph])

  useEffect(() => {
    if (!showGraph) return
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    setFailedCount(0)

    const cachedContent = new Map<string, string>()
    for (const file of cachedFiles?.values() ?? []) {
      if (file.path) cachedContent.set(file.path.replace(/\\/g, '/').toLocaleLowerCase(), file.content)
    }

    const results: ({ path: string; content: string } | null)[] = []
    const slots = activeReadsRef.current
    let nextIndex = 0
    async function readSlot(slot: number) {
      // 已发出的 Tauri 读取无法取消，等它结束再使用同一个并发槽。
      if (slots[slot]) await slots[slot]
      while (!signal.aborted && nextIndex < notePaths.length) {
        const index = nextIndex++
        const path = notePaths[index]
        const cached = cachedContent.get(path.replace(/\\/g, '/').toLocaleLowerCase())
        if (cached !== undefined) {
          results[index] = { path, content: cached }
          continue
        }
        const read = readMarkdownFile(path, signal).then((content) => {
          if (!signal.aborted) results[index] = { path, content }
        }, (error: unknown) => {
          if (signal.aborted) return
          console.warn('Failed to read note for link graph:', path, error)
          results[index] = null
        }).finally(() => { slots[slot] = undefined })
        slots[slot] = read
        await read
      }
    }

    void Promise.all(Array.from({ length: Math.min(GRAPH_READ_CONCURRENCY, notePaths.length) }, (_, slot) => readSlot(slot)))
      .then(() => {
        if (signal.aborted) return
        const readable = results.filter((item): item is { path: string; content: string } => item !== null)
        setFailedCount(results.length - readable.length)
        setGraph(buildWikiLinkGraph(readable))
      }).finally(() => {
        if (!signal.aborted) setLoading(false)
        results.length = 0
        cachedContent.clear()
      })

    return () => {
      controller.abort()
      results.length = 0
      cachedContent.clear()
    }
  }, [cachedFiles, notePaths, refreshKey, showGraph])

  /** 画布尺寸按真实像素测量，图谱因此铺满面板而不是被塞进一个正方形。 */
  useLayoutEffect(() => {
    if (!hasCanvas) return
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
  }, [hasCanvas])

  // 物理模型在图谱或画布尺寸变化时同步；放在 layout 阶段，新节点不会先在角落闪一帧。
  useLayoutEffect(() => {
    if (!canvasSize || !showGraph) return
    const simulation = simulationRef.current
    if (!simulation) {
      simulationRef.current = createLinkGraphSimulation(graph, canvasSize)
      return
    }
    simulation.updateGraph(graph)
    simulation.resize(canvasSize.width, canvasSize.height)
  }, [canvasSize, graph, showGraph])

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
    return () => {
      nodeElementsRef.current.clear()
      edgeElementsRef.current = []
    }
  }, [applyPositions, canvasSize, currentFile, graph, hasCanvas, hovered])

  // 滚轮缩放挂在整个面板上。SVG 空白处默认不接事件，滚轮会穿透到编辑器，看起来就像不能缩放。
  useEffect(() => {
    const panel = panelRef.current
    if (!hasCanvas || !panel) return
    const handleWheel = (event: WheelEvent) => {
      if (document.hidden || !svgRef.current) return
      event.preventDefault()
      event.stopPropagation()
      wheelQueueRef.current.push({ x: event.clientX, y: event.clientY, delta: wheelPixels(event) })
      requestLayoutRef.current?.()
    }
    panel.addEventListener('wheel', handleWheel, { passive: false })
    return () => panel.removeEventListener('wheel', handleWheel)
  }, [hasCanvas])

  const toLayoutPoint = useCallback((clientX: number, clientY: number): LinkGraphPoint | null => {
    const svg = svgRef.current
    if (!svg || typeof svg.getScreenCTM !== 'function') return null
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const local = point.matrixTransform(matrix.inverse())
    // 画布坐标反解视图变换后得到布局坐标。
    const current = viewRef.current
    return { x: (local.x - current.x) / current.scale, y: (local.y - current.y) / current.scale }
  }, [])

  const cancelGestures = useCallback(() => {
    const dragging = draggingRef.current
    const panning = panningRef.current
    draggingRef.current = null
    panningRef.current = null
    pendingDragRef.current = null
    pendingPanRef.current = null
    wheelQueueRef.current.length = 0
    if (dragging) simulationRef.current?.unpin(dragging.path)
    for (const gesture of [dragging, panning]) {
      if (gesture?.target.hasPointerCapture?.(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId)
    }
  }, [])

  useLayoutEffect(() => {
    if (!hasCanvas) return
    window.addEventListener('blur', cancelGestures)
    return () => {
      window.removeEventListener('blur', cancelGestures)
      cancelGestures()
    }
  }, [cancelGestures, hasCanvas])

  // 图谱只在可见且未冷却时连续排布，不让高刷新率屏幕加快物理模拟。
  useLayoutEffect(() => {
    const simulation = simulationRef.current
    if (!hasCanvas || !canvasSize || !simulation) return
    const motion = window.matchMedia(REDUCED_MOTION_QUERY)
    let frame: number | null = null
    let lastTick: number | null = null
    let active = true
    let redraw = false
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      lastTick = null
    }
    const step = (now: number) => {
      frame = null
      if (document.hidden) return
      if (lastTick !== null && now - lastTick < LAYOUT_FRAME_MS - 0.5) {
        schedule()
        return
      }
      lastTick = lastTick === null ? now : Math.max(now - LAYOUT_FRAME_MS, Math.min(now, lastTick + LAYOUT_FRAME_MS))
      const pan = pendingPanRef.current
      pendingPanRef.current = null
      const wheelQueue = wheelQueueRef.current
      if (pan || wheelQueue.length) {
        const current = viewRef.current
        let viewX = pan?.x ?? current.x
        let viewY = pan?.y ?? current.y
        let scale = current.scale
        const rect = wheelQueue.length ? svgRef.current?.getBoundingClientRect() : null
        if (rect) {
          for (const { x, y, delta } of wheelQueue) {
            const nextScale = clampZoom(scale * Math.exp(-delta * ZOOM_SENSITIVITY))
            const ratio = nextScale / scale
            const pointerX = x - rect.left
            const pointerY = y - rect.top
            viewX = pointerX - (pointerX - viewX) * ratio
            viewY = pointerY - (pointerY - viewY) * ratio
            scale = nextScale
          }
        }
        wheelQueue.length = 0
        if (viewX !== current.x || viewY !== current.y || scale !== current.scale) {
          const nextView = { x: viewX, y: viewY, scale }
          viewRef.current = nextView
          setView(nextView)
        }
      }
      const pending = pendingDragRef.current
      const dragging = draggingRef.current
      if (pending && dragging) {
        pendingDragRef.current = null
        const point = toLayoutPoint(pending.x, pending.y)
        if (point) {
          simulation.pin(dragging.path, point)
          simulation.reheat(DRAG_ALPHA)
          active = true
          redraw = true
        }
      }
      if (!motion.matches && active) {
        active = simulation.tick()
        redraw = true
      }
      if (redraw) {
        redraw = false
        applyPositions()
      }
      if (!motion.matches && active) schedule()
      else lastTick = null
    }
    const schedule = () => {
      if (frame === null && !document.hidden) frame = requestAnimationFrame(step)
    }
    const resume = () => {
      stop()
      if (document.hidden) cancelGestures()
      else if (redraw || pendingDragRef.current || pendingPanRef.current || wheelQueueRef.current.length || (!motion.matches && active)) schedule()
    }
    requestLayoutRef.current = (forceRedraw) => {
      if (forceRedraw) active = redraw = true
      schedule()
    }
    document.addEventListener('visibilitychange', resume)
    motion.addEventListener('change', resume)
    resume()
    return () => {
      stop()
      requestLayoutRef.current = null
      document.removeEventListener('visibilitychange', resume)
      motion.removeEventListener('change', resume)
    }
  }, [applyPositions, cancelGestures, canvasSize, graph, hasCanvas, toLayoutPoint])

  const neighbours = useMemo(() => {
    if (!hovered) return null
    const set = new Set<string>([hovered])
    for (const edge of graph.edges) {
      if (edge.source === hovered) set.add(edge.target)
      if (edge.target === hovered) set.add(edge.source)
    }
    return set
  }, [hovered, graph])

  /** 空白处拖动平移整个画布。 */
  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || panningRef.current || draggingRef.current) return
    panningRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
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
    pendingPanRef.current = { x: panning.viewX + event.clientX - panning.startX, y: panning.viewY + event.clientY - panning.startY }
    requestLayoutRef.current?.()
  }

  function endPan(event: ReactPointerEvent<SVGSVGElement>) {
    const panning = panningRef.current
    if (!panning || panning.pointerId !== event.pointerId) return
    if (event.type === 'pointerup' && (event.clientX !== panning.startX || event.clientY !== panning.startY || pendingPanRef.current)) movePan(event)
    else pendingPanRef.current = null
    panningRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, path: string) {
    if (event.button !== 0 || draggingRef.current || panningRef.current) return
    event.stopPropagation()
    draggedRef.current = false
    draggingRef.current = { path, pointerId: event.pointerId, target: event.currentTarget }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pendingDragRef.current = { x: event.clientX, y: event.clientY }
    requestLayoutRef.current?.()
  }

  function moveDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragging = draggingRef.current
    if (!dragging || dragging.pointerId !== event.pointerId) return
    draggedRef.current = true
    pendingDragRef.current = { x: event.clientX, y: event.clientY }
    requestLayoutRef.current?.()
  }

  function endDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragging = draggingRef.current
    if (!dragging || dragging.pointerId !== event.pointerId) return
    draggingRef.current = null
    pendingDragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const simulation = simulationRef.current
    if (!simulation) return
    if (draggedRef.current && event.type === 'pointerup') {
      const point = toLayoutPoint(event.clientX, event.clientY)
      if (point) {
        const current = simulation.positionOf(dragging.path)
        if (!current || current.x !== point.x || current.y !== point.y) simulation.pin(dragging.path, point)
      }
    }
    simulation.unpin(dragging.path)
    simulation.reheat(RELEASE_ALPHA)
    requestLayoutRef.current?.(true)
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
        <aside ref={panelRef} className="link-graph-panel" aria-label={t('graph.title')}>
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
                  onLostPointerCapture={endPan}
                  onDoubleClick={() => {
                    pendingPanRef.current = null
                    wheelQueueRef.current.length = 0
                    setView(DEFAULT_VIEW)
                  }}
                >
                  <rect className="link-graph-hit" x="0" y="0" width="100%" height="100%" />
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
                            onLostPointerCapture={endDrag}
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
