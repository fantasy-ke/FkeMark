import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorModeEnum, type EditorMode } from '../../types'
import { useResizeDrag } from '../../hooks/useResizeDrag'

export function useEditorSplitMode(editorMode: EditorMode, tabId: string | undefined) {
  // 分栏模式：源码文本域 ref + 宽度比例（持久化到 localStorage）
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const splitRef = useRef<HTMLDivElement>(null)
  // 分栏模式右侧预览滚动容器 ref（用于滚动同步）
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const syncRafRef = useRef<number | null>(null)
  const syncedScrollRef = useRef(new Map<HTMLElement, number>())
  const pendingScrollRef = useRef<HTMLElement | null>(null)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem('fkemark:splitRatio') || '')
      if (!Number.isNaN(v) && v > 0.1 && v < 0.9) return v
    } catch { /* ignore */ }
    return 0.5
  })
  // editorMode 的最新值（onUpdate 闭包无法感知最新 prop，用 ref 读取）
  const editorModeRef = useRef(editorMode)
  useEffect(() => { editorModeRef.current = editorMode }, [editorMode])

  // 拖拽分隔条调整分栏宽度
  const startSplitDrag = useResizeDrag(editorMode === EditorModeEnum.Split, (startX) => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0
    if (!width) return
    let ratio = splitRatio
    return {
      update(x) {
        ratio = x === startX ? splitRatio : Math.max(0.15, Math.min(0.85, splitRatio + (x - startX) / width))
        setSplitRatio(ratio)
      },
      commit() {
        if (ratio === splitRatio) return
        try { localStorage.setItem('fkemark:splitRatio', String(ratio)) } catch { /* 忽略持久化失败 */ }
      },
      cancel() { setSplitRatio(splitRatio) },
    }
  })

  useLayoutEffect(() => () => {
    if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current)
    syncRafRef.current = null
    syncedScrollRef.current.clear()
    pendingScrollRef.current = null
  }, [editorMode, tabId])

  const ignoreSplitScroll = useCallback((element: HTMLElement) => {
    syncedScrollRef.current.set(element, element.scrollTop)
  }, [])

  // 只同步每帧最后一次滚动；过滤写入目标面板后产生的回灌事件。
  const handleSplitScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget
    const expected = syncedScrollRef.current.get(element)
    syncedScrollRef.current.delete(element)
    if (element.scrollTop === expected) return
    pendingScrollRef.current = element
    if (syncRafRef.current !== null) return
    syncRafRef.current = requestAnimationFrame(() => {
      syncRafRef.current = null
      const src = pendingScrollRef.current
      pendingScrollRef.current = null
      if (!src) return
      const dst = src === textareaRef.current ? previewScrollRef.current : textareaRef.current
      if (!dst || !src.isConnected) return
      const srcMax = src.scrollHeight - src.clientHeight
      const dstMax = dst.scrollHeight - dst.clientHeight
      if (srcMax <= 0 || dstMax <= 0) return
      const previous = dst.scrollTop
      dst.scrollTop = (src.scrollTop / srcMax) * dstMax
      if (dst.scrollTop !== previous) ignoreSplitScroll(dst)
    })
  }, [ignoreSplitScroll])

  return {
    textareaRef,
    splitRef,
    previewScrollRef,
    editorModeRef,
    splitRatio,
    startSplitDrag,
    handleSplitScroll,
    ignoreSplitScroll,
  }
}
