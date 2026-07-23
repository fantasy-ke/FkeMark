import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { markdownToHtml, escapeHtml } from '../../utils/markdown/engine'

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
}: {
  content: string
  scrollRef?: RefObject<HTMLElement | null>
  side: 'left' | 'right'
  editorMode: 'source' | 'live' | 'read'
  docDir?: string | null
}) {
  const lines = content.split('\n')
  const [hover, setHover] = useState<{ html: string; y: number; left: number } | null>(null)
  // 视口指示器：当前可视区域在文档中的比例范围（top/height 均为 0~1）
  const [viewport, setViewport] = useState<{ top: number; height: number }>({ top: 0, height: 1 })
  const draggingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // 实时计算视口指示器位置：监听绑定容器的滚动（捕获阶段，兼容 textarea/div）+ 窗口缩放
  useEffect(() => {
    const recompute = () => {
      const el = scrollRef?.current
      if (!el) return
      const sh = el.scrollHeight
      if (sh <= 0) { setViewport({ top: 0, height: 1 }); return }
      const top = el.scrollTop / sh
      const height = el.clientHeight / sh
      setViewport({ top: Math.min(1, Math.max(0, top)), height: Math.min(1, Math.max(0.02, height)) })
    }
    recompute()
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [scrollRef, content])

  const scrollToPos = useCallback((clientY: number) => {
    const el = panelRef.current
    if (!el || !scrollRef?.current) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    scrollRef.current.scrollTo({ top: ratio * scrollRef.current.scrollHeight, behavior: 'auto' })
  }, [scrollRef])

  const handleMouseMove = (e: React.MouseEvent) => {
    // 拖动中实时滚动
    if (draggingRef.current) {
      scrollToPos(e.clientY)
    }
    // 悬浮预览：计算对应行范围，提取片段，按模式渲染
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    const lineIdx = Math.floor(ratio * lines.length)
    // 提取以该行为中心的 5 行片段
    const start = Math.max(0, lineIdx - 2)
    const end = Math.min(lines.length, lineIdx + 3)
    const fragment = lines.slice(start, end).join('\n').trim()
    if (!fragment) { setHover(null); return }

    // 根据编辑模式决定预览内容
    let html: string
    if (editorMode === 'source') {
      // 源码模式：纯文本预览（转义 HTML）
      html = `<pre class="minimap-tip-pre">${escapeHtml(fragment)}</pre>`
    } else {
      // live / read 模式：markdown 渲染为 HTML（传 docDir 以正确转换图片相对路径为 asset URL）
      html = markdownToHtml(fragment, docDir)
    }

    // tooltip 垂直居中跟随鼠标，水平位置根据 side 计算（绝对视口坐标，用 Portal 渲染到 body）
    const TOOLTIP_W = 280
    // 小地图在左边 → tooltip 显示在右边（panel 右侧 + 14px 间距）
    // 小地图在右边 → tooltip 显示在左边（panel 左侧 - 14px - 280px 宽度）
    // 边界钳制：避免悬浮框溢出视口
    const rawLeft = side === 'left' ? rect.right + 14 : rect.left - 14 - TOOLTIP_W
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - 8))
    // 垂直居中跟随鼠标，但钳制在视口内（tooltip 约 160px 高）
    const y = Math.max(80, Math.min(e.clientY, window.innerHeight - 80))
    setHover({ html, y, left })
  }

  return (
    <div
      ref={panelRef}
      className={`minimap-panel minimap-${side}`}
      onMouseDown={(e) => { draggingRef.current = true; scrollToPos(e.clientY) }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => { draggingRef.current = false }}
      onMouseLeave={() => { draggingRef.current = false; setHover(null) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {lines.map((line, i) => {
        const trimmed = line.trim()
        let color = 'var(--muted)'
        let weight: 'normal' | 'bold' = 'normal'
        if (trimmed.startsWith('# ')) { color = 'var(--fg)'; weight = 'bold' }
        else if (trimmed.startsWith('## ')) { color = 'var(--accent)'; weight = 'bold' }
        else if (trimmed.startsWith('### ')) { color = 'var(--muted)'; weight = 'bold' }
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) { color = 'var(--marker)' }
        else if (trimmed.startsWith('> ')) { color = 'var(--quote-bar)' }
        else if (trimmed.startsWith('```')) { color = 'var(--code-bg)' }
        else if (/^\|/.test(trimmed)) { color = 'var(--quote-bar)' }
        else if (/^- \[[ x]\]/.test(trimmed)) { color = 'var(--accent)' }
        const display = trimmed.slice(0, 20) || ' '
        return (
          <div key={i} style={{ color, fontWeight: weight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {display}
          </div>
        )
      })}
      {/* 视口指示器：高亮当前可视区域在文档中的位置范围 */}
      <div
        className="minimap-viewport"
        style={{ top: `${viewport.top * 100}%`, height: `${viewport.height * 100}%` }}
      />
      {hover && createPortal(
        <div
          ref={tooltipRef}
          className={`minimap-tooltip minimap-tooltip-${side}`}
          style={{ top: hover.y, left: hover.left }}
        >
          <div className="minimap-tooltip-arrow" />
          <div className="minimap-tooltip-content" dangerouslySetInnerHTML={{ __html: hover.html }} />
        </div>,
        document.body
      )}
    </div>
  )
}
