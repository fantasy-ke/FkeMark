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

export function renderPreviewHtml(html: string, options?: { force?: boolean }): string {
  // 分栏预览保持占位，进入视口后再水合。导出和演示必须 force，不能只拿到视口里已画出来的公式。
  if (!options?.force) return html
  return applyKatexPlaceholders(html)
}

export function markdownToPreviewHtml(markdown: string, docDir?: string | null): string {
  return renderPreviewHtml(markdownToHtml(markdown, docDir), { force: true })
}

export { extractDocumentMetadata } from './metadata'
export type { DocumentMetadata } from './metadata'
