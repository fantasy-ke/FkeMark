import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { markdownToHtml, escapeHtml } from '../../utils/markdown/engine'
import { isPerformanceSensitiveDocument } from '../../utils/performance'
import { EditorModeEnum } from '../../types'
import type { EditorMode } from '../../types'
import { useI18n } from '../../i18n'
import { useClampedPopupPosition } from '../../utils/popupPosition'

const MINIMAP_BAR_LIMIT = 480

type MinimapSide = 'left' | 'right'

function sampleLines(lines: string[], limit: number): string[] {
  if (lines.length <= limit) return lines
  const step = lines.length / limit
  return Array.from({ length: limit }, (_, index) => lines[Math.min(lines.length - 1, Math.floor(index * step))] ?? '')
}

function lineBarStyle(line: string): { color: string; fontWeight: 'normal' | 'bold' } {
  const trimmed = line.trim()
  if (trimmed.startsWith('# ')) return { color: 'var(--fg)', fontWeight: 'bold' }
  if (trimmed.startsWith('## ')) return { color: 'var(--accent)', fontWeight: 'bold' }
  if (trimmed.startsWith('### ')) return { color: 'var(--muted)', fontWeight: 'bold' }
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return { color: 'var(--marker)', fontWeight: 'normal' }
  if (trimmed.startsWith('> ')) return { color: 'var(--quote-bar)', fontWeight: 'normal' }
  if (trimmed.startsWith('```')) return { color: 'var(--code-bg)', fontWeight: 'normal' }
  if (/^\|/.test(trimmed)) return { color: 'var(--quote-bar)', fontWeight: 'normal' }
  if (/^- \[[ x]\]/.test(trimmed)) return { color: 'var(--accent)', fontWeight: 'normal' }
  return { color: 'var(--muted)', fontWeight: 'normal' }
}
type Translate = (key: string, params?: Record<string, string | number>) => string

function MinimapContextMenu({
  x,
  y,
  side,
  onChangeSide,
  onHide,
  onClose,
  t,
}: {
  x: number
  y: number
  side: MinimapSide
  onChangeSide?: (side: MinimapSide) => void
  onHide?: () => void
  onClose: () => void
  t: Translate
}) {
  const popupRef = useClampedPopupPosition<HTMLDivElement>(x, y)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (popupRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, popupRef])

  return createPortal(
    <div
      ref={popupRef}
      className="app-menu-dropdown open minimap-ctx-menu"
      style={{ position: 'fixed', top: y, left: x, right: 'auto', zIndex: 400 }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <button
        type="button"
        role="menuitemradio"
        className={`app-menu-item${side === 'left' ? ' is-active' : ''}`}
        aria-checked={side === 'left'}
        onClick={() => {
          onChangeSide?.('left')
          onClose()
        }}
      >
        <span className="menu-label">{t('settings.side.left')}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        className={`app-menu-item${side === 'right' ? ' is-active' : ''}`}
        aria-checked={side === 'right'}
        onClick={() => {
          onChangeSide?.('right')
          onClose()
        }}
      >
        <span className="menu-label">{t('settings.side.right')}</span>
      </button>
      <div className="app-menu-divider" />
      <button
        type="button"
        role="menuitem"
        className="app-menu-item"
        onClick={() => {
          onHide?.()
          onClose()
        }}
      >
        <span className="menu-label">{t('ctx.minimap.close')}</span>
      </button>
    </div>,
    document.body,
  )
}

/**
 * 小地图组件 — 支持滑动查看 + 悬浮预览，带箭头指向
 *
 * @param content - Markdown 内容
 * @param scrollRef - 编辑器滚动容器引用（源码模式为 textarea，其余为滚动 div）
 * @param side - 显示位置 ('left' | 'right')
 * @param editorMode - 当前编辑模式
 */
export function Minimap({
  content,
  scrollRef,
  side,
  editorMode,
  docDir,
  renderedHtml,
  onHide,
  onChangeSide,
}: {
  content: string
  scrollRef?: RefObject<HTMLElement | null>
  side: MinimapSide
  editorMode: Exclude<EditorMode, typeof EditorModeEnum.Split>
  docDir?: string | null
  renderedHtml?: string
  onHide?: () => void
  onChangeSide?: (side: MinimapSide) => void
}) {
  const { t } = useI18n()
  const lines = useMemo(() => content.split('\n'), [content])
  const isSourceView = editorMode === EditorModeEnum.Source
  const largeDocument = isPerformanceSensitiveDocument(content)
  const useLineBars = isSourceView || largeDocument
  const barLines = useMemo(() => useLineBars
    ? sampleLines(lines, largeDocument ? MINIMAP_BAR_LIMIT : lines.length)
    : [], [largeDocument, lines, useLineBars])
  const bars = useMemo(() => barLines.map((line, i) => {
    const style = lineBarStyle(line)
    return (
      <div key={i} style={{ color: style.color, fontWeight: style.fontWeight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {line.trim().slice(0, 20) || ' '}
      </div>
    )
  }), [barLines])
  const minimapHtml = useMemo(() => {
    if (useLineBars) return null
    return renderedHtml && renderedHtml.trim() ? renderedHtml : markdownToHtml(content, docDir)
  }, [content, docDir, renderedHtml, useLineBars])
  const [hover, setHover] = useState<{ html: string; y: number; left: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const hoverFragmentRef = useRef<{ line: number; html: string } | null>(null)
  const draggingRef = useRef(false)
  const hoverFrameRef = useRef<number | null>(null)
  const pendingHoverY = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const cancelHoverFrame = useCallback(() => {
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current)
    hoverFrameRef.current = null
    pendingHoverY.current = null
  }, [])

  useLayoutEffect(() => {
    hoverFragmentRef.current = null
    setHover(null)
    return cancelHoverFrame
  }, [cancelHoverFrame, docDir, editorMode, lines, side])

  useLayoutEffect(() => {
    const scroller = scrollRef?.current
    const indicator = viewportRef.current
    if (!scroller || !indicator) return
    let frame: number | null = null
    let previousHeight = -1
    const update = () => {
      frame = null
      const { scrollHeight, scrollTop, clientHeight } = scroller
      const height = scrollHeight > 0 ? Math.min(1, Math.max(0.02, clientHeight / scrollHeight)) : 1
      const top = scrollHeight > 0 ? Math.min(1 - height, Math.max(0, scrollTop / scrollHeight)) : 0
      if (height !== previousHeight) {
        previousHeight = height
        indicator.style.height = `${height * 100}%`
      }
      indicator.style.transform = `translateY(${(top / height) * 100}%)`
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update)
    }
    update()
    scroller.addEventListener('scroll', schedule, { passive: true })
    scroller.addEventListener('load', schedule, true)
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(scroller)
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      scroller.removeEventListener('scroll', schedule)
      scroller.removeEventListener('load', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [scrollRef, editorMode, content, renderedHtml])

  function scrollToRatio(ratio: number) {
    const scroller = scrollRef?.current
    if (scroller) scroller.scrollTop = ratio * scroller.scrollHeight
  }

  function resetHover() {
    draggingRef.current = false
    cancelHoverFrame()
    setHover(null)
  }

  const updateHover = (clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect?.height) return
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    if (draggingRef.current) scrollToRatio(ratio)
    const line = Math.min(lines.length - 1, Math.floor(ratio * lines.length))
    let cached = hoverFragmentRef.current
    if (cached?.line !== line) {
      const fragment = lines.slice(Math.max(0, line - 2), line + 3).join('\n').trim()
      const html = !fragment ? '' : isSourceView
        ? `<pre class="minimap-tip-pre">${escapeHtml(fragment)}</pre>`
        : markdownToHtml(fragment, docDir)
      hoverFragmentRef.current = cached = { line, html }
    }
    if (!cached.html) { setHover(null); return }

    // tooltip 垂直居中跟随鼠标，水平位置根据 side 计算（绝对视口坐标，用 Portal 渲染到 body）
    const TOOLTIP_W = 280
    // 小地图在左边 → tooltip 显示在右边（panel 右侧 + 14px 间距）
    // 小地图在右边 → tooltip 显示在左边（panel 左侧 - 14px - 280px 宽度）
    // 边界钳制：避免悬浮框溢出视口
    const rawLeft = side === 'left' ? rect.right + 14 : rect.left - 14 - TOOLTIP_W
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - 8))
    // 垂直居中跟随鼠标，但钳制在视口内（tooltip 约 160px 高）
    const y = Math.max(80, Math.min(clientY, window.innerHeight - 80))
    setHover({ html: cached.html, y, left })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    pendingHoverY.current = e.clientY
    if (hoverFrameRef.current !== null) return
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = null
      const clientY = pendingHoverY.current
      pendingHoverY.current = null
      if (clientY !== null) updateHover(clientY)
    })
  }

  return (
    <div
      ref={panelRef}
      className={`minimap-panel minimap-${side} minimap-panel--${useLineBars ? 'source' : 'rendered'}`}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        const rect = e.currentTarget.getBoundingClientRect()
        if (!rect.height) return
        draggingRef.current = true
        scrollToRatio(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)))
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={(e) => {
        if (e.button !== 0 || !draggingRef.current) return
        if (pendingHoverY.current !== null) updateHover(e.clientY)
        cancelHoverFrame()
        draggingRef.current = false
      }}
      onMouseLeave={resetHover}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        resetHover()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {onHide && (
        <button
          type="button"
          className="minimap-fold"
          title={t('ctx.hideMinimap')}
          aria-label={t('ctx.hideMinimap')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onHide()
          }}
        >
          {side === 'right' ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronLeft size={12} aria-hidden="true" />}
        </button>
      )}
      {useLineBars ? bars : (
        <div className="minimap-rendered-content" dangerouslySetInnerHTML={{ __html: minimapHtml ?? '' }} />
      )}
      {/* 视口指示器：高亮当前可视区域在文档中的位置范围 */}
      <div ref={viewportRef} className="minimap-viewport" />
      {hover && createPortal(
        <div
          className={`minimap-tooltip minimap-tooltip-${side}`}
          style={{ top: hover.y, left: hover.left }}
        >
          <div className="minimap-tooltip-arrow" />
          <div className="minimap-tooltip-content" dangerouslySetInnerHTML={{ __html: hover.html }} />
        </div>,
        document.body
      )}
      {menu && (
        <MinimapContextMenu
          x={menu.x}
          y={menu.y}
          side={side}
          onChangeSide={onChangeSide}
          onHide={onHide}
          onClose={closeMenu}
          t={t}
        />
      )}
    </div>
  )
}
