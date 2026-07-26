/**
 * Markdown conversion entry point.
 *
 * The application now uses a single markdown-it + Turndown pipeline. Wiki-link
 * normalization stays at this boundary so every caller receives the same result.
 */

import katex from 'katex'
import {
  markdownToHtml as convertMarkdownToHtml,
  htmlToMarkdown as convertHtmlToMarkdown,
  htmlToMarkdownDeferred as convertHtmlToMarkdownDeferred,
} from './third'
import { prepareWikiLinksForRendering, restoreWikiLinksFromMarkdown } from './wikiLinks'

function applyKatexToHtml(html: string): string {
  if (!html.includes('fk-math')) return html
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll<HTMLElement>('.fk-math[data-tex]').forEach((el) => {
      const tex = el.getAttribute('data-tex') || ''
      const display = el.getAttribute('data-display') === 'true'
      let rendered: string
      try {
        rendered = katex.renderToString(tex, {
          displayMode: display,
          throwOnError: false,
          output: 'htmlAndMathml',
        })
      } catch {
        rendered = `<span class="math-render-error">${tex}</span>`
      }
      el.innerHTML = rendered
      el.classList.add('fk-math-rendered')
    })
    return doc.body.innerHTML
  } catch {
    return html
  }
}

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

export function renderPreviewHtml(html: string): string {
  return applyKatexToHtml(html)
}

export function markdownToPreviewHtml(markdown: string, docDir?: string | null): string {
  return renderPreviewHtml(markdownToHtml(markdown, docDir))
}

export { extractDocumentMetadata } from './metadata'
export type { DocumentMetadata } from './metadata'
