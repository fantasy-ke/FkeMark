import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { countDocumentLines } from '../../utils/documentStats'
import { countEditorLines } from './editorLineCount'
import {
  collectRenderedLineLayout,
  createFallbackRenderedLineLayout,
  getVisibleRenderedLineMarkers,
  type RenderedLineLayout,
} from './renderedLineNumbers'

interface LineNumbersProps {
  content: string
  className?: string
  scrollTop?: number
  topOffset?: number
}

interface RenderedLineNumbersProps {
  className?: string
  contentElement?: HTMLElement | null
  contentRef?: RefObject<HTMLElement>
  deferMeasurements?: boolean
  editor?: TiptapEditor | null
  refreshKey?: unknown
  scrollRef?: RefObject<HTMLElement>
  sourceContent: string
  topOffset?: number
}

interface ViewportState {
  height: number
  scrollTop: number
}

function buildLineNumberText(lineCount: number) {
  const lines = new Array<string>(lineCount)
  for (let i = 0; i < lineCount; i += 1) lines[i] = String(i + 1)
  return lines.join('\n')
}

/**
 * 源码视图保持固定行高，并使用单个文本节点避免长文档产生大量 React 子节点。
 */
export const LineNumbers = memo(function LineNumbers({
  content,
  className = '',
  scrollTop = 0,
  topOffset = 40,
}: LineNumbersProps) {
  const lineCount = useMemo(() => countDocumentLines(content), [content])
  const numbers = useMemo(() => buildLineNumberText(lineCount), [lineCount])
  const style = {
    '--line-number-top': `${topOffset}px`,
    transform: scrollTop ? `translateY(-${scrollTop}px)` : undefined,
  } as CSSProperties

  return <pre className={`editor-line-numbers ${className}`.trim()} style={style} aria-hidden="true">{numbers}</pre>
})

/**
 * 渲染视图根据实际 DOM 几何位置显示行号，仅保留视口附近的节点以控制长文档开销。
 */
export const RenderedLineNumbers = memo(function RenderedLineNumbers({
  className = '',
  contentElement = null,
  contentRef,
  deferMeasurements = false,
  editor,
  refreshKey,
  scrollRef,
  sourceContent,
  topOffset = 40,
}: RenderedLineNumbersProps) {
  const [layout, setLayout] = useState<RenderedLineLayout>(() => {
    const sourceLineCount = countDocumentLines(sourceContent)
    const lineCount = editor && !deferMeasurements
      ? Math.max(sourceLineCount, countEditorLines(editor))
      : sourceLineCount
    return createFallbackRenderedLineLayout(lineCount, topOffset)
  })
  const [viewport, setViewport] = useState<ViewportState>({ height: 0, scrollTop: 0 })
  const measureFrameRef = useRef<number | null>(null)
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportFrameRef = useRef<number | null>(null)

  const resolveContentElement = useCallback(
    () => contentElement ?? contentRef?.current ?? null,
    [contentElement, contentRef],
  )

  const resolveScrollElement = useCallback(() => {
    if (scrollRef?.current) return scrollRef.current
    return resolveContentElement()?.closest<HTMLElement>('.editor-scroll, .split-preview') ?? null
  }, [resolveContentElement, scrollRef])

  const measure = useCallback(() => {
    const root = resolveContentElement()
    if (!root) return

    const sourceLineCount = countDocumentLines(sourceContent)
    const editorLineCount = editor ? countEditorLines(editor) : undefined
    const lineCount = editorLineCount === undefined
      ? sourceLineCount
      : Math.max(sourceLineCount, editorLineCount)
    setLayout(collectRenderedLineLayout(root, sourceContent, lineCount, resolveScrollElement()))
  }, [editor, resolveContentElement, resolveScrollElement, sourceContent])

  const cancelScheduledMeasure = useCallback(() => {
    if (measureTimerRef.current !== null) {
      clearTimeout(measureTimerRef.current)
      measureTimerRef.current = null
    }
    if (measureFrameRef.current !== null) {
      window.cancelAnimationFrame(measureFrameRef.current)
      measureFrameRef.current = null
    }
  }, [])

  const requestMeasureFrame = useCallback(() => {
    if (measureFrameRef.current !== null) return
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null
      measure()
    })
  }, [measure])

  const scheduleMeasure = useCallback(() => {
    if (!deferMeasurements) {
      requestMeasureFrame()
      return
    }

    if (measureTimerRef.current !== null) clearTimeout(measureTimerRef.current)
    measureTimerRef.current = setTimeout(() => {
      measureTimerRef.current = null
      requestMeasureFrame()
    }, 400)
  }, [deferMeasurements, requestMeasureFrame])

  useLayoutEffect(() => {
    const root = resolveContentElement()
    if (!root) {
      const sourceLineCount = countDocumentLines(sourceContent)
      const lineCount = editor && !deferMeasurements
        ? Math.max(sourceLineCount, countEditorLines(editor))
        : sourceLineCount
      setLayout(createFallbackRenderedLineLayout(lineCount, topOffset))
      scheduleMeasure()
      return cancelScheduledMeasure
    }

    if (deferMeasurements) {
      setLayout(createFallbackRenderedLineLayout(countDocumentLines(sourceContent), topOffset))
      scheduleMeasure()
    } else {
      measure()
    }

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure)
    resizeObserver?.observe(root)

    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(scheduleMeasure)
    mutationObserver?.observe(root, { attributes: true, childList: true, subtree: true })

    const syncEditorLayout = () => scheduleMeasure()
    editor?.on('update', syncEditorLayout)

    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      editor?.off('update', syncEditorLayout)
      cancelScheduledMeasure()
    }
  }, [
    cancelScheduledMeasure,
    deferMeasurements,
    editor,
    measure,
    refreshKey,
    resolveContentElement,
    scheduleMeasure,
    sourceContent,
    topOffset,
  ])

  useEffect(() => {
    const scrollElement = resolveScrollElement()
    if (!scrollElement) return

    const syncViewport = () => {
      setViewport({
        height: scrollElement.clientHeight,
        scrollTop: scrollElement.scrollTop,
      })
    }
    const scheduleViewportSync = () => {
      if (viewportFrameRef.current !== null) return
      viewportFrameRef.current = window.requestAnimationFrame(() => {
        viewportFrameRef.current = null
        syncViewport()
      })
    }

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleViewportSync)
    resizeObserver?.observe(scrollElement)

    syncViewport()
    scrollElement.addEventListener('scroll', scheduleViewportSync, { passive: true })
    return () => {
      resizeObserver?.disconnect()
      scrollElement.removeEventListener('scroll', scheduleViewportSync)
      if (viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current)
        viewportFrameRef.current = null
      }
    }
  }, [resolveScrollElement])

  const visibleMarkers = useMemo(
    () => getVisibleRenderedLineMarkers(layout.markers, viewport.scrollTop, viewport.height, layout.top),
    [layout.markers, layout.top, viewport.height, viewport.scrollTop],
  )
  const style = {
    '--line-number-top': `${layout.top}px`,
    height: `${layout.height}px`,
  } as CSSProperties

  return (
    <div
      className={`editor-rendered-line-numbers ${className}`.trim()}
      style={style}
      data-line-count={layout.markers.length}
      aria-hidden="true"
    >
      {visibleMarkers.map((marker) => (
        <span
          key={marker.lineNumber}
          className="editor-rendered-line-number"
          data-line-number={marker.lineNumber}
          style={{ top: `${marker.top}px` }}
        >
          {marker.lineNumber}
        </span>
      ))}
    </div>
  )
})
