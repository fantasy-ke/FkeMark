import { noteRenderCost, nowMs } from './renderTiming'
import type { renderKatexHtml as renderKatexHtmlType } from './katexRuntime'

const PLACEHOLDER = /<(div|span) class="fk-math fk-math-(?:block|inline)" data-tex="([^"]*)" data-display="(true|false)">[\s\S]*?<\/\1>/g

type KatexRenderer = typeof renderKatexHtmlType
let renderer: Promise<KatexRenderer> | undefined

export function loadKatexRenderer(): Promise<KatexRenderer> {
  return renderer ??= import('./katexRuntime').then(({ renderKatexHtml }) => renderKatexHtml)
}

function unescapeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** 导出用字符串替换，不把整篇 HTML 再解析成 DOM。 */
export async function applyKatexPlaceholders(html: string): Promise<string> {
  if (!html.includes('class="fk-math fk-math-') || html.search(PLACEHOLDER) === -1) return html
  const renderKatexHtml = await loadKatexRenderer()
  return html.replace(PLACEHOLDER, (_match, tag: string, texAttr: string, display: string) => {
    const tex = unescapeHtmlAttr(texAttr)
    const rendered = renderKatexHtml(tex, display === 'true')
    const block = display === 'true'
    const className = block ? 'fk-math fk-math-block fk-math-rendered' : 'fk-math fk-math-inline fk-math-rendered'
    return `<${tag} class="${className}" data-tex="${texAttr}" data-display="${display}" aria-label="${texAttr}">${rendered}</${tag}>`
  })
}

export function hydrateMathElement(element: HTMLElement, renderKatexHtml: KatexRenderer): void {
  if (element.classList.contains('fk-math-rendered')) return
  const tex = unescapeHtmlAttr(element.getAttribute('data-tex') || '')
  const display = element.getAttribute('data-display') === 'true'
  const startedAt = nowMs()
  element.innerHTML = renderKatexHtml(tex, display)
  element.classList.add('fk-math-rendered')
  if (tex) element.setAttribute('aria-label', tex)
  noteRenderCost('preview.hydrate', startedAt, { kind: 'math', characters: tex.length })
}
