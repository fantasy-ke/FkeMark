import { useEffect, useState } from 'react'
import { isLargeDocument } from '../../utils/performance'
import { markdownToHtml, renderPreviewHtml } from '../../utils/markdown/engine'

interface PreviewSnapshot {
  content: string
  docDir: string | null
  sourceHtml: string
  previewHtml: string
}

interface DeferredMarkdownPreviewOptions {
  content: string
  docDir: string | null
  enabled: boolean
  getReusableHtml: () => string | null
}

export function useDeferredMarkdownPreview({
  content,
  docDir,
  enabled,
  getReusableHtml,
}: DeferredMarkdownPreviewOptions) {
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null)
  const current = snapshot?.content === content && snapshot.docDir === docDir ? snapshot : null

  useEffect(() => {
    if (!enabled || current) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      const sourceHtml = getReusableHtml() ?? markdownToHtml(content, docDir)
      const previewHtml = renderPreviewHtml(sourceHtml)
      if (!cancelled) setSnapshot({ content, docDir, sourceHtml, previewHtml })
    }, isLargeDocument(content) ? 120 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [content, current, docDir, enabled, getReusableHtml])

  return {
    previewHtml: current?.previewHtml ?? '',
    previewSourceHtml: current?.sourceHtml ?? null,
  }
}
