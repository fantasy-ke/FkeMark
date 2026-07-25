import { useEffect, type MutableRefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { Transaction } from 'prosemirror-state'
import type { EditorMode } from '../../types'

const STORAGE_KEY = 'fkemark.editor-performance.v1'
const MAX_ENTRIES = 100
const SLOW_OPERATION_THRESHOLD_MS = 50
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export type EditorPerformanceDetails = Record<string, unknown>

interface EditorPerformanceEntry {
  timestamp: string
  sessionId: string
  kind: 'operation' | 'browser' | 'state'
  stage: string
  durationMs: number
  details?: EditorPerformanceDetails
}

interface EditorDocumentSnapshot {
  content: string
  docDir: string | null
}

interface LongAnimationFrameEntry extends PerformanceEntry {
  blockingDuration?: number
  firstUIEventTimestamp?: number
  renderStart?: number
  styleAndLayoutStart?: number
  scripts?: Array<{
    duration?: number
    forcedStyleAndLayoutDuration?: number
    invoker?: string
    invokerType?: string
    sourceFunctionName?: string
    sourceURL?: string
  }>
}

type DiagnosticsWindow = Window & {
  __FKEMARK_EDITOR_PERFORMANCE__?: {
    clear: () => void
    copy: () => Promise<string>
    export: () => string
  }
}

function currentWindow(): DiagnosticsWindow | null {
  return typeof window === 'undefined' ? null : window as DiagnosticsWindow
}

function loadEntries(): EditorPerformanceEntry[] {
  try {
    const stored = currentWindow()?.localStorage.getItem(STORAGE_KEY)
    const parsed = JSON.parse(stored ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : []
  } catch {
    return []
  }
}

let entries = loadEntries()
let browserObserver: PerformanceObserver | null = null

function saveEntries() {
  try {
    currentWindow()?.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // 本地存储不可用时仍保留控制台日志。
  }
}

function exportEntries(): string {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    sessionId: SESSION_ID,
    userAgent: currentWindow()?.navigator.userAgent ?? 'unknown',
    entries,
  }, null, 2)
}

function installGlobalApi() {
  const target = currentWindow()
  if (!target || target.__FKEMARK_EDITOR_PERFORMANCE__) return
  target.__FKEMARK_EDITOR_PERFORMANCE__ = {
    clear: () => {
      entries = []
      saveEntries()
    },
    copy: async () => {
      const text = exportEntries()
      if (target.navigator.clipboard?.writeText) await target.navigator.clipboard.writeText(text)
      else console.info(text)
      return text
    },
    export: exportEntries,
  }
}

function recordPerformance(
  kind: EditorPerformanceEntry['kind'],
  stage: string,
  durationMs: number,
  details?: EditorPerformanceDetails,
) {
  installGlobalApi()
  const entry: EditorPerformanceEntry = {
    timestamp: new Date().toISOString(),
    sessionId: SESSION_ID,
    kind,
    stage,
    durationMs: Math.round(durationMs * 10) / 10,
    details,
  }
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry]
  saveEntries()
  if (kind !== 'state') console.warn('[editor-performance]', entry)
}

export function measureEditorPerformance<T>(
  stage: string,
  details: EditorPerformanceDetails,
  operation: () => T,
  thresholdMs = SLOW_OPERATION_THRESHOLD_MS,
): T {
  if (typeof performance === 'undefined') return operation()
  const startedAt = performance.now()
  try {
    return operation()
  } finally {
    const durationMs = performance.now() - startedAt
    if (durationMs >= thresholdMs) recordPerformance('operation', stage, durationMs, details)
  }
}

function editorDetails(
  editor: TiptapEditor,
  editorModeRef: MutableRefObject<EditorMode>,
  editorDocumentRef: MutableRefObject<EditorDocumentSnapshot>,
  performanceSensitive: boolean,
  extra: EditorPerformanceDetails = {},
): EditorPerformanceDetails {
  return {
    mode: editorModeRef.current,
    sourceCharacters: editorDocumentRef.current.content.length,
    documentSize: editor.state.doc.content.size,
    topLevelBlocks: editor.state.doc.childCount,
    performanceSensitive,
    ...extra,
  }
}

function installBrowserObserver() {
  installGlobalApi()
  if (browserObserver || typeof PerformanceObserver === 'undefined') return
  const supported = (PerformanceObserver as unknown as {
    supportedEntryTypes?: readonly string[]
  }).supportedEntryTypes ?? []
  const entryType = supported.includes('long-animation-frame')
    ? 'long-animation-frame'
    : supported.includes('longtask') ? 'longtask' : null
  if (!entryType) return

  browserObserver = new PerformanceObserver((list) => {
    list.getEntries().forEach((performanceEntry) => {
      if (performanceEntry.duration < SLOW_OPERATION_THRESHOLD_MS) return
      const entry = performanceEntry as LongAnimationFrameEntry
      const scripts = entry.scripts
        ?.slice()
        .sort((left, right) => (right.duration ?? 0) - (left.duration ?? 0))
        .slice(0, 5)
        .map((script) => ({
          durationMs: Math.round((script.duration ?? 0) * 10) / 10,
          forcedStyleAndLayoutMs: Math.round(
            (script.forcedStyleAndLayoutDuration ?? 0) * 10,
          ) / 10,
          functionName: script.sourceFunctionName || null,
          invoker: script.invoker || null,
          invokerType: script.invokerType || null,
          sourceURL: script.sourceURL || null,
        }))
      recordPerformance('browser', `browser.${entryType}`, entry.duration, {
        blockingDurationMs: entry.blockingDuration ?? null,
        firstUIEventTimestamp: entry.firstUIEventTimestamp ?? null,
        renderStart: entry.renderStart ?? null,
        styleAndLayoutStart: entry.styleAndLayoutStart ?? null,
        scripts: scripts?.length ? scripts : undefined,
      })
    })
  })
  browserObserver.observe({ type: entryType, buffered: true })
}

export function useEditorPerformanceDiagnostics(
  editor: TiptapEditor | null,
  editorModeRef: MutableRefObject<EditorMode>,
  editorDocumentRef: MutableRefObject<EditorDocumentSnapshot>,
  performanceSensitive: boolean,
) {
  useEffect(() => {
    installBrowserObserver()
    if (!editor) return

    const view = editor.view
    const originalDispatch = view.dispatch
    const monitoredDispatch = (transaction: Transaction) => measureEditorPerformance(
      'prosemirror.dispatch',
      editorDetails(editor, editorModeRef, editorDocumentRef, performanceSensitive, {
        docChanged: transaction.docChanged,
        stepCount: transaction.steps.length,
      }),
      () => originalDispatch.call(view, transaction),
    )
    view.dispatch = monitoredDispatch

    return () => {
      if (view.dispatch === monitoredDispatch) view.dispatch = originalDispatch
    }
  }, [editor, editorDocumentRef, editorModeRef, performanceSensitive])

  useEffect(() => {
    if (!editor || !performanceSensitive) return
    recordPerformance(
      'state',
      'editor.performance-mode.enabled',
      0,
      editorDetails(editor, editorModeRef, editorDocumentRef, performanceSensitive),
    )
  }, [editor, editorDocumentRef, editorModeRef, performanceSensitive])
}

