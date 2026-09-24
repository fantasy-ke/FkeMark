/**
 * Excalidraw 手绘白板的文档约定。
 *
 * 文档里只保存一段 ```excalidraw 围栏，内容是 Excalidraw 场景 JSON。
 * 实时编辑提升为独立块；分栏、阅读和演示把同一围栏水合成预览。
 */

import { rewriteSvgIds } from './heavyRender'
import { createRenderCache } from './renderCache'
import { noteRenderCost, nowMs } from './renderTiming'

export const EXCALIDRAW_LANGUAGE = 'excalidraw'

const previewCache = createRenderCache<string>(16)

export const EMPTY_EXCALIDRAW_SCENE = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
}

export function isExcalidrawLanguage(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === EXCALIDRAW_LANGUAGE
}

export function createEmptyExcalidrawScene(): string {
  return JSON.stringify(EMPTY_EXCALIDRAW_SCENE)
}

export function parseExcalidrawScene(source: string): Record<string, unknown> | null {
  const text = source.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const scene = parsed as Record<string, unknown>
    if (!Array.isArray(scene.elements)) return null
    return scene
  } catch {
    return null
  }
}

export function isExcalidrawSource(source: string): boolean {
  return parseExcalidrawScene(source) !== null
}

export function isExcalidrawFilePath(value: string): boolean {
  return /\.excalidraw$/i.test(value.trim().replace(/\\/g, '/').split(/[?#]/)[0])
}

/** 围栏内容是文件路径，而不是内嵌 JSON。 */
export function isExcalidrawFileRef(source: string): boolean {
  const text = source.trim()
  return Boolean(text) && !text.startsWith('{') && !/[\r\n]/u.test(text) && isExcalidrawFilePath(text)
}

export function resolveExcalidrawPath(source: string, docDir: string | null): string | null {
  const text = source.trim()
  if (!isExcalidrawFileRef(text)) return null
  const normalized = text.replace(/\\/g, '/')
  if (/^[a-z]:\//iu.test(normalized) || normalized.startsWith('/') || text.startsWith('\\\\')) return text
  if (!docDir) return null
  const separator = docDir.includes('\\') && !docDir.includes('/') ? '\\' : '/'
  return `${docDir.replace(/[\\/]+$/u, '')}${separator}${normalized.replace(/^\.\//u, '').replace(/\//g, separator)}`
}

export function toExcalidrawRelativePath(docDir: string | null, filePath: string): string {
  if (!docDir) return filePath
  const separator = docDir.includes('\\') && !docDir.includes('/') ? '\\' : '/'
  const dir = docDir.replace(/[\\/]+$/u, '').replace(/\\/g, separator).replace(/\//g, separator)
  const full = filePath.replace(/\\/g, separator).replace(/\//g, separator)
  const prefix = `${dir}${separator}`
  if (full.toLowerCase().startsWith(prefix.toLowerCase())) {
    return `./${full.slice(prefix.length).replace(/\\/g, '/')}`
  }
  return filePath.replace(/\\/g, '/')
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

interface SketchElement {
  type?: unknown
  x?: unknown
  y?: unknown
  width?: unknown
  height?: unknown
  text?: unknown
  strokeColor?: unknown
  backgroundColor?: unknown
  points?: unknown
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function colorOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/iu.test(value) ? value : fallback
}

function pointsOf(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return []
  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return []
    return [[numberOf(point[0]), numberOf(point[1])] as [number, number]]
  })
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

/**
 * 把场景画成静态 SVG。这是阅读、分栏和演示用的预览，不是编辑器。
 * 手绘抖动交给 CSS，避免在这里重写一套渲染器。
 */
function languageOf(element: Element): string {
  const token = `${element.className} ${element.querySelector('code')?.className ?? ''}`
    .split(/\s+/)
    .find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

/** 导出和演示把围栏里的场景换成静态 SVG，避免把 JSON 源码写进 HTML。 */
export function embedRenderedExcalidraw(html: string): string {
  if (!html.includes('excalidraw') || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false
  doc.querySelectorAll('pre').forEach((pre) => {
    if (!isExcalidrawLanguage(languageOf(pre))) return
    const source = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
    if (isExcalidrawFileRef(source)) return
    const svg = renderExcalidrawPreview(source)
    if (!svg) return
    const holder = doc.createElement('div')
    holder.className = 'excalidraw-export'
    holder.innerHTML = svg
    pre.replaceWith(holder)
    changed = true
  })
  return changed ? doc.body.innerHTML : html
}

/** 导出时读取外部 .excalidraw 引用并换成 SVG。读不到文件时只留标记，不展开源码。 */
export async function embedExcalidrawFileRefs(
  html: string,
  docDir: string | null,
  readFile: (path: string) => Promise<string>,
): Promise<string> {
  if (!html.includes('excalidraw') || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false
  for (const pre of Array.from(doc.querySelectorAll('pre'))) {
    if (!isExcalidrawLanguage(languageOf(pre))) continue
    const source = (pre.querySelector('code')?.textContent ?? pre.textContent ?? '').trim()
    if (!isExcalidrawFileRef(source)) continue
    const path = resolveExcalidrawPath(source, docDir)
    const holder = doc.createElement('div')
    holder.className = 'excalidraw-export'
    try {
      const scene = path ? await readFile(path) : ''
      const svg = renderExcalidrawPreview(scene)
      holder.innerHTML = svg || 'Excalidraw'
    } catch {
      holder.textContent = 'Excalidraw'
    }
    pre.replaceWith(holder)
    changed = true
  }
  return changed ? doc.body.innerHTML : html
}

export function renderExcalidrawPreview(source: string): string | null {
  const cached = previewCache.get(source)
  if (cached !== undefined) return cached === '' ? '' : rewriteSvgIds(cached)
  const startedAt = nowMs()
  const svg = renderExcalidrawScene(source)
  if (svg === null) return null
  noteRenderCost('excalidraw.preview', startedAt, { characters: source.length, cacheHit: false })
  previewCache.set(source, svg)
  return svg === '' ? '' : rewriteSvgIds(svg)
}

function renderExcalidrawScene(source: string): string | null {
  const scene = parseExcalidrawScene(source)
  if (!scene) return null
  const elements = (scene.elements as SketchElement[]).filter((item) => item && typeof item === 'object')
  if (elements.length === 0) return ''

  const boxes = elements.map((element) => {
    const points = pointsOf(element.points)
    const x = numberOf(element.x)
    const y = numberOf(element.y)
    const width = Math.max(0, numberOf(element.width))
    const height = Math.max(0, numberOf(element.height))
    const xs = [x, x + width, ...points.map(([px]) => x + px)]
    const ys = [y, y + height, ...points.map(([, py]) => y + py)]
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    }
  })
  const minX = Math.min(...boxes.map((box) => box.minX)) - 24
  const minY = Math.min(...boxes.map((box) => box.minY)) - 24
  const maxX = Math.max(...boxes.map((box) => box.maxX)) + 24
  const maxY = Math.max(...boxes.map((box) => box.maxY)) + 24
  const width = Math.max(160, maxX - minX)
  const height = Math.max(96, maxY - minY)
  const background = colorOf((scene.appState as { viewBackgroundColor?: unknown } | undefined)?.viewBackgroundColor, '#fffdf8')

  const shapes = elements.map((element) => {
    const type = textOf(element.type)
    const x = numberOf(element.x) - minX
    const y = numberOf(element.y) - minY
    const shapeWidth = Math.max(1, numberOf(element.width))
    const shapeHeight = Math.max(1, numberOf(element.height))
    const stroke = colorOf(element.strokeColor, '#1e1e1e')
    const fill = colorOf(element.backgroundColor, 'none')
    if (type === 'text') {
      return `<text x="${x}" y="${y + 16}" fill="${stroke}" font-size="16" font-family="Segoe Print, Segoe Script, cursive">${escapeXml(textOf(element.text))}</text>`
    }
    if (type === 'arrow' || type === 'line') {
      const points = pointsOf(element.points)
      const path = points.map(([px, py], index) => `${index === 0 ? 'M' : 'L'} ${x + px} ${y + py}`).join(' ')
      const marker = type === 'arrow' ? ' marker-end="url(#excalidraw-arrow)"' : ''
      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6"${marker} />`
    }
    if (type === 'ellipse') {
      return `<ellipse cx="${x + shapeWidth / 2}" cy="${y + shapeHeight / 2}" rx="${shapeWidth / 2}" ry="${shapeHeight / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" />`
    }
    if (type === 'diamond') {
      const path = `M ${x + shapeWidth / 2} ${y} L ${x + shapeWidth} ${y + shapeHeight / 2} L ${x + shapeWidth / 2} ${y + shapeHeight} L ${x} ${y + shapeHeight / 2} Z`
      return `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" />`
    }
    return `<rect x="${x}" y="${y}" width="${shapeWidth}" height="${shapeHeight}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.6" />`
  }).join('')

  return `<svg class="excalidraw-preview-svg" viewBox="0 0 ${width} ${height}" role="img">
    <defs><marker id="excalidraw-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#1e1e1e" /></marker></defs>
    <rect width="100%" height="100%" fill="${background}" />
    ${shapes}
  </svg>`
}
