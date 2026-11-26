import { useEffect, useState } from 'react'
import { isPerformanceSensitiveDocument } from '../../utils/performance'
import { markdownToHtml, renderPreviewHtml } from '../../utils/markdown/engine'
import { recordEditorPerformanceOperation } from './useEditorPerformanceDiagnostics'

interface PreviewSnapshot {
  tabId?: string
  content: string
  docDir: string | null
  previewHtml: string
}

interface DeferredMarkdownPreviewOptions {
  content: string
  docDir: string | null
  tabId?: string
  enabled: boolean
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export function useDeferredMarkdownPreview({
  content,
  docDir,
  tabId,
  enabled,
}: DeferredMarkdownPreviewOptions) {
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null)
  const visible = snapshot && snapshot.tabId === tabId ? snapshot : null
  const current = visible?.content === content && visible.docDir === docDir ? visible : null

  useEffect(() => {
    if (!enabled || current) return

    let cancelled = false
    const performanceSensitive = isPerformanceSensitiveDocument(content)
    const timer = window.setTimeout(() => {
      const totalStartedAt = now()
      const markdownStartedAt = now()
      const sourceHtml = markdownToHtml(content, docDir)
      recordEditorPerformanceOperation('preview.markdown-to-html', now() - markdownStartedAt, {
        sourceCharacters: content.length,
        performanceSensitive,
      })

      const decorateStartedAt = now()
      const previewHtml = renderPreviewHtml(sourceHtml)
      recordEditorPerformanceOperation('preview.decorate-html', now() - decorateStartedAt, {
        sourceCharacters: content.length,
        htmlCharacters: sourceHtml.length,
        performanceSensitive,
      })
      recordEditorPerformanceOperation('preview.total', now() - totalStartedAt, {
        sourceCharacters: content.length,
        htmlCharacters: sourceHtml.length,
        previewCharacters: previewHtml.length,
        performanceSensitive,
      })
      if (!cancelled) setSnapshot({ content, docDir, tabId, previewHtml })
    }, performanceSensitive ? 120 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [content, current, docDir, enabled, tabId])

  return { previewHtml: enabled ? visible?.previewHtml ?? '' : '', previewReady: enabled && visible !== null }
}
