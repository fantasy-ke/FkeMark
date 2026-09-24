import { isMermaidLanguage } from './codeLanguage'
import { enqueueHeavyRender, rewriteSvgIds } from './heavyRender'
import { createRenderCache } from './renderCache'
import { noteRenderCost, nowMs } from './renderTiming'

export { isMermaidLanguage }

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => Promise<{ svg: string }>
}

let mermaidApi: MermaidApi | null = null
let initializedDark: boolean | null = null
let svgSerial = 0
const cache = createRenderCache<string>(32)
const inflight = new Map<string, Promise<string>>()

// 匹配围栏首行的图表类型，语言标记丢失时仍能识别
const MERMAID_DIAGRAM_START = /^(?:erDiagram|flowchart(?:-elk)?|graph\s+[TBLR][BLR]?|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|gantt|pie(?:\s|$)|gitGraph|mindmap|timeline|journey|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture)\b/i

export function clearMermaidRenderCache(): void {
  cache.clear()
  inflight.clear()
}

export function isMermaidSource(source: string): boolean {
  const text = source.replace(/\u00a0/g, ' ').trim()
  if (!text) return false
  const first = text.replace(/^%%\{[\s\S]*?\}%%\s*/, '').trimStart()
  return MERMAID_DIAGRAM_START.test(first)
}

export function shouldRenderMermaid(language: unknown, source: string): boolean {
  return isMermaidLanguage(language) || isMermaidSource(source)
}

async function loadMermaid(dark: boolean): Promise<MermaidApi> {
  if (!mermaidApi) {
    const mod = await import('mermaid')
    mermaidApi = (mod.default ?? mod) as MermaidApi
  }
  if (initializedDark !== dark) {
    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: 'inherit',
    })
    initializedDark = dark
  }
  return mermaidApi
}

async function renderUncached(text: string, dark: boolean): Promise<string> {
  const startedAt = nowMs()
  const mermaid = await loadMermaid(dark)
  const id = `fk-mermaid-${++svgSerial}`
  const { svg } = await mermaid.render(id, text)
  noteRenderCost('mermaid.render', startedAt, { characters: text.length, dark, cacheHit: false })
  return svg
}

function languageOf(element: Element): string {
  const token = `${element.className} ${element.querySelector('code')?.className ?? ''}`
    .split(/\s+/)
    .find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

/** 导出把 Mermaid 围栏换成 SVG。失败时不回写源码。 */
export async function embedRenderedMermaid(html: string, dark = false): Promise<string> {
  if ((!html.includes('mermaid') && !html.includes('language-mmd')) || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false
  for (const pre of Array.from(doc.querySelectorAll('pre'))) {
    const source = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
    if (!isMermaidLanguage(languageOf(pre)) && !isMermaidSource(source)) continue
    const holder = doc.createElement('div')
    holder.className = 'mermaid-export'
    try {
      const svg = await renderMermaidSvg(source, dark)
      holder.innerHTML = svg || 'Mermaid'
    } catch {
      holder.textContent = 'Mermaid'
    }
    pre.replaceWith(holder)
    changed = true
  }
  return changed ? doc.body.innerHTML : html
}

export async function renderMermaidSvg(source: string, dark: boolean): Promise<string> {
  const text = source.replace(/\u00a0/g, ' ').trim()
  if (!text) return ''
  const key = `mermaid\0${dark ? 1 : 0}\0${text}`
  const cached = cache.get(key)
  if (cached !== undefined) return rewriteSvgIds(cached)
  let pending = inflight.get(key)
  if (!pending) {
    pending = enqueueHeavyRender(async () => {
      const svg = await renderUncached(text, dark)
      cache.set(key, svg)
      return svg
    }, 'visible')
    inflight.set(key, pending)
    void pending.finally(() => inflight.delete(key))
  }
  return rewriteSvgIds(await pending)
}
