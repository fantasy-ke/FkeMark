import katex from 'katex'
import 'katex/dist/katex.min.css'
import { escapeHtml } from './escapeHtml'
import { createRenderCache } from './renderCache'
import { noteRenderCost, nowMs } from './renderTiming'

const cache = createRenderCache<string>(512)

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
