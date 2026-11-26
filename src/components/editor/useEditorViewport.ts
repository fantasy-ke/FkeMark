import { useLayoutEffect, useRef, type RefObject, type MutableRefObject } from 'react'
import { EditorModeEnum, type EditorMode } from '../../types'
import type { DocumentSearchJump } from '../../app/useDocumentOpen'

interface Position {
  left: number
  top: number
  selection?: [number, number, HTMLTextAreaElement['selectionDirection']]
}

interface Viewport {
  primary?: Position
  preview?: Position
}

interface EditorViewportOptions {
  tabId?: string
  openTabIds?: string[]
  mode: EditorMode
  documentReady: boolean
  previewReady: boolean
  searchJump?: DocumentSearchJump | null
  captureRef?: MutableRefObject<(() => void) | null>
  liveRef?: RefObject<HTMLDivElement | null>
  syncSourceScrollRef: RefObject<() => void>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  previewRef: RefObject<HTMLDivElement | null>
  ignoreSplitScroll: (element: HTMLElement) => void
}

function readPosition(element: HTMLElement): Position {
  return { left: element.scrollLeft, top: element.scrollTop, selection: element instanceof HTMLTextAreaElement
    ? [element.selectionStart, element.selectionEnd, element.selectionDirection ?? 'none'] : undefined }
}

function restorePosition(element: HTMLElement, position: Position | undefined) {
  if (element instanceof HTMLTextAreaElement) element.setSelectionRange(...(position?.selection ?? [0, 0, 'none'] as const))
  element.scrollLeft = position?.left ?? 0
  element.scrollTop = position?.top ?? 0
}

function jumpToMatch(element: HTMLElement, match: DocumentSearchJump['match']) {
  const { lineNumber, lineText, matchStart, matchEnd } = match
  if (lineNumber < 1) return
  if (element instanceof HTMLTextAreaElement) {
    let start = 0
    for (let line = 1; line < lineNumber; line++) {
      const next = element.value.indexOf('\n', start)
      if (next === -1) return
      start = next + 1
    }
    const next = element.value.indexOf('\n', start)
    const line = element.value.slice(start, next === -1 ? undefined : next).replace(/\r$/, '')
    const from = line === lineText && matchEnd > matchStart ? start + matchStart : start
    const to = line === lineText && matchEnd > matchStart ? start + matchEnd : start + line.length
    element.focus({ preventScroll: true })
    element.setSelectionRange(from, to)
    const style = getComputedStyle(element)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 0
    element.scrollTop = Math.max(0, (lineNumber - 1) * lineHeight - element.clientHeight / 2)
    return
  }

  const needle = (lineText.slice(matchStart, matchEnd).trim() || lineText.trim()).toLowerCase()
  let currentLine = 0
  let best: HTMLElement | undefined
  let distance = Infinity
  let fallback: HTMLElement | undefined
  for (const target of element.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, pre, tr, blockquote, li')) {
    if (target.querySelector('p, h1, h2, h3, h4, h5, h6, pre, tr, blockquote, li')) continue
    const text = target.textContent ?? ''
    currentLine += text.split('\n').length
    if (!fallback && currentLine >= lineNumber) fallback = target
    const delta = Math.abs(currentLine - lineNumber)
    if (needle && delta < distance && text.toLowerCase().includes(needle)) {
      best = target
      distance = delta
    }
  }
  const target = best ?? fallback
  target?.scrollIntoView?.({ behavior: 'instant', block: 'center' })
}

export function useEditorViewport({
  tabId, openTabIds, mode, documentReady, previewReady, searchJump, captureRef,
  liveRef, textareaRef, previewRef, ignoreSplitScroll, syncSourceScrollRef,
}: EditorViewportOptions) {
  const cache = useRef(new Map<string | undefined, Map<EditorMode, Viewport>>())
  const capturePrimary = useRef<(() => void) | null>(null)
  const capturePreview = useRef<(() => void) | null>(null)
  const appliedJump = useRef<DocumentSearchJump | null>(null)
  const source = mode === EditorModeEnum.Source || mode === EditorModeEnum.Split
  const primaryReady = source || documentReady
  const splitReady = mode === EditorModeEnum.Split && previewReady

  function viewport() {
    let modes = cache.current.get(tabId)
    if (!modes) cache.current.set(tabId, modes = new Map())
    let snapshot = modes.get(mode)
    if (!snapshot) modes.set(mode, snapshot = {})
    return snapshot
  }

  useLayoutEffect(() => {
    if (!primaryReady) return
    const element = source ? textareaRef.current : liveRef?.current
    if (!element) return
    const snapshot = viewport()
    restorePosition(element, snapshot.primary)
    if (source) syncSourceScrollRef.current?.()
    if (mode === EditorModeEnum.Split) ignoreSplitScroll(element)
    let captured = false
    capturePrimary.current = () => { snapshot.primary = readPosition(element); captured = true }
    return () => {
      if (!captured) snapshot.primary = readPosition(element)
      capturePrimary.current = null
    }
  }, [primaryReady, tabId, mode, source, liveRef, textareaRef, ignoreSplitScroll, syncSourceScrollRef])

  useLayoutEffect(() => {
    const element = previewRef.current
    if (!splitReady || !element) return
    const snapshot = viewport()
    restorePosition(element, snapshot.preview)
    ignoreSplitScroll(element)
    let captured = false
    capturePreview.current = () => { snapshot.preview = readPosition(element); captured = true }
    return () => {
      if (!captured) snapshot.preview = readPosition(element)
      capturePreview.current = null
    }
  }, [splitReady, tabId, mode, previewRef, ignoreSplitScroll])

  useLayoutEffect(() => {
    if (!captureRef) return
    captureRef.current = () => { capturePrimary.current?.(); capturePreview.current?.() }
    return () => { captureRef.current = null }
  }, [captureRef])

  useLayoutEffect(() => {
    if (!openTabIds) return
    for (const id of cache.current.keys()) if (id !== undefined && !openTabIds.includes(id)) cache.current.delete(id)
  }, [openTabIds])

  useLayoutEffect(() => {
    if (!primaryReady || !searchJump || tabId !== searchJump.tabId || appliedJump.current === searchJump) return
    const element = source ? textareaRef.current : liveRef?.current
    if (!element) return
    appliedJump.current = searchJump
    jumpToMatch(element, searchJump.match)
    if (source) syncSourceScrollRef.current?.()
  }, [searchJump, primaryReady, tabId, mode, source, textareaRef, liveRef, syncSourceScrollRef])
}
