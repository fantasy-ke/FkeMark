/**
 * Markdown conversion entry point.
 *
 * The application now uses a single markdown-it + Turndown pipeline. Wiki-link
 * normalization stays at this boundary so every caller receives the same result.
 */

import {
  markdownToHtml as convertMarkdownToHtml,
  htmlToMarkdown as convertHtmlToMarkdown,
  htmlToMarkdownDeferred as convertHtmlToMarkdownDeferred,
} from './third'
import { embedExcalidrawFileRefs, embedRenderedExcalidraw } from './excalidraw'
import { embedRenderedMermaid } from './mermaid'
import { applyKatexPlaceholders } from './katexRender'
import { prepareWikiLinksForRendering, restoreWikiLinksFromMarkdown } from './wikiLinks'

export function markdownToHtml(markdown: string, docDir?: string | null): string {
  return convertMarkdownToHtml(prepareWikiLinksForRendering(markdown), docDir)
}

export function htmlToMarkdown(html: string, docDir?: string | null): string {
  return restoreWikiLinksFromMarkdown(convertHtmlToMarkdown(html, docDir))
}

export async function htmlToMarkdownDeferred(
  html: string,
  docDir?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const markdown = await convertHtmlToMarkdownDeferred(html, docDir, signal)
  return restoreWikiLinksFromMarkdown(markdown)
}

export { escapeHtml } from './escapeHtml'

export async function markdownToPreviewHtml(markdown: string, docDir?: string | null): Promise<string> {
  return embedRenderedExcalidraw(await applyKatexPlaceholders(markdownToHtml(markdown, docDir)))
}

/** 导出等待完整公式、白板和 Mermaid，不依赖当前视口。 */
export async function renderExportHtml(
  markdown: string,
  docDir?: string | null,
  readFile?: (path: string) => Promise<string>,
): Promise<string> {
  let html = await markdownToPreviewHtml(markdown, docDir)
  if (readFile) html = await embedExcalidrawFileRefs(html, docDir ?? null, readFile)
  return embedRenderedMermaid(html)
}

export { extractDocumentMetadata } from './metadata'
export type { DocumentMetadata } from './metadata'
