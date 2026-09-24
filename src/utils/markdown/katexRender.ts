import katex from 'katex'
import { escapeHtml } from './escapeHtml'
import { createRenderCache } from './renderCache'
import { noteRenderCost, nowMs } from './renderTiming'

const cache = createRenderCache<string>(512)
const PLACEHOLDER = /<(div|span) class="fk-math fk-math-(?:block|inline)" data-tex="([^"]*)" data-display="(true|false)">[\s\S]*?<\/\1>/g

export function clearKatexRenderCache(): void {
  cache.clear()
}

export function unescapeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function renderKatexHtml(tex: string, display: boolean): string {
  const key = `html\0${display ? 1 : 0}\0${tex}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const startedAt = nowMs()
  let html: string
  try {
    html = katex.renderToString(tex || '', {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    })
  } catch {
    html = `<span class="math-render-error">${escapeHtml(tex)}</span>`
  }
  noteRenderCost('math.render', startedAt, { display, characters: tex.length, cacheHit: false })
  cache.set(key, html)
  return html
}

/** 导出用字符串替换，不把整篇 HTML 再解析成 DOM。 */
export function applyKatexPlaceholders(html: string): string {
  if (!html.includes('fk-math')) return html
  return html.replace(PLACEHOLDER, (_match, tag: string, texAttr: string, display: string) => {
    const tex = unescapeHtmlAttr(texAttr)
    const rendered = renderKatexHtml(tex, display === 'true')
    const block = display === 'true'
    const className = block ? 'fk-math fk-math-block fk-math-rendered' : 'fk-math fk-math-inline fk-math-rendered'
    return `<${tag} class="${className}" data-tex="${texAttr}" data-display="${display}" aria-label="${texAttr}">${rendered}</${tag}>`
  })
}

export function hydrateMathElement(element: HTMLElement): void {
  if (element.classList.contains('fk-math-rendered')) return
  const tex = unescapeHtmlAttr(element.getAttribute('data-tex') || '')
  const display = element.getAttribute('data-display') === 'true'
  const startedAt = nowMs()
  element.innerHTML = renderKatexHtml(tex, display)
  element.classList.add('fk-math-rendered')
  if (tex) element.setAttribute('aria-label', tex)
  noteRenderCost('preview.hydrate', startedAt, { kind: 'math', characters: tex.length })
}
