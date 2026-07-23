import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorMode } from '../../types'

export function useEditorSplitMode(editorMode: EditorMode) {
  // 分栏模式：源码文本域 ref + 宽度比例（持久化到 localStorage）
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const splitRef = useRef<HTMLDivElement>(null)
  // 分栏模式右侧预览滚动容器 ref（用于滚动同步）
  const previewScrollRef = useRef<HTMLDivElement>(null)
  // 滚动同步守卫：记录当前正在滚动的面板，避免 A→B 同步后 B 的 scroll 事件回灌到 A 形成回路；
  // 同时配合 requestAnimationFrame 在快速滚动时保证流畅、不丢事件。
  const activeScrollRef = useRef<Element | null>(null)
  const syncRafRef = useRef<number | null>(null)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem('fkemark:splitRatio') || '')
      if (!Number.isNaN(v) && v > 0.1 && v < 0.9) return v
    } catch { /* ignore */ }
    return 0.5
  })
  const splitRatioRef = useRef(splitRatio)
  // editorMode 的最新值（onUpdate 闭包无法感知最新 prop，用 ref 读取）
  const editorModeRef = useRef(editorMode)
  useEffect(() => { editorModeRef.current = editorMode }, [editorMode])

  // 拖拽分隔条调整分栏宽度
  const startSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = splitRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      let r = (ev.clientX - rect.left) / rect.width
      r = Math.max(0.15, Math.min(0.85, r))
      splitRatioRef.current = r
      setSplitRatio(r)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('fkemark:splitRatio', String(splitRatioRef.current)) } catch { /* ignore */ }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // 分栏滚动同步：源码文本域 ↔ 右侧预览，按 scrollTop 比例联动。
  // activeScrollRef 记录"正在被用户滚动"的面板，避免 A→B 同步后 B 的 scroll 事件回灌形成回路；
  // 这样同一面板连续快速滚动不会被自身守卫挡住，而对面板的回灌会被忽略。
  const handleSplitScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const src = e.currentTarget
    if (activeScrollRef.current && activeScrollRef.current !== src) return
    const dst = (src === textareaRef.current
      ? previewScrollRef.current
      : textareaRef.current) as HTMLElement | null
    if (!dst) return
    const srcMax = src.scrollHeight - src.clientHeight
    const dstMax = dst.scrollHeight - dst.clientHeight
    if (srcMax <= 0 || dstMax <= 0) return
    activeScrollRef.current = src
    // 按比例映射，避免整数抖动；直接赋值开销极小，快速滚动依旧流畅
    dst.scrollTop = (src.scrollTop / srcMax) * dstMax
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
    syncRafRef.current = requestAnimationFrame(() => {
      activeScrollRef.current = null
    })
  }, [])

  return {
    textareaRef,
    splitRef,
    previewScrollRef,
    editorModeRef,
    splitRatio,
    startSplitDrag,
    handleSplitScroll,
  }
}
