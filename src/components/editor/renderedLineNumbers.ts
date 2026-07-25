export interface RenderedLineMarker {
  lineNumber: number
  top: number
}

export interface RenderedLineLayout {
  height: number
  markers: RenderedLineMarker[]
  top: number
}

const LINE_BLOCK_SELECTOR = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'pre', 'li', 'tr', 'hr',
  '.fk-math-block',
].join(',')

const DEFAULT_LINE_HEIGHT = 21.6

function numericStyle(element: Element, property: 'borderTopWidth' | 'fontSize' | 'lineHeight' | 'paddingTop'): number {
  const value = Number.parseFloat(getComputedStyle(element)[property])
  return Number.isFinite(value) ? value : 0
}

function lineHeightOf(element: Element): number {
  const lineHeight = numericStyle(element, 'lineHeight')
  if (lineHeight > 0) return lineHeight
  const fontSize = numericStyle(element, 'fontSize')
  return fontSize > 0 ? fontSize * 1.8 : DEFAULT_LINE_HEIGHT
}

function belongsToLineBlock(element: Element, block: Element): boolean {
  return element.closest(LINE_BLOCK_SELECTOR) === block
}

function isRenderedLineBlock(element: Element): boolean {
  if (element.matches('p') && element.closest('td, th')) return false
  if (element.closest('pre') && !element.matches('pre')) return false
  if (element.closest('tr') && !element.matches('tr')) return false

  if (element.matches('li')) {
    const nestedParagraph = Array.from(element.querySelectorAll('p'))
      .some((paragraph) => paragraph.closest('li') === element)
    if (nestedParagraph) return false
  }

  return true
}

function hasLayout(rect: DOMRect): boolean {
  return rect.top !== 0 || rect.bottom !== 0 || rect.width !== 0 || rect.height !== 0
}

function topAfterBreak(br: HTMLBRElement, block: Element, rootTop: number, fallbackTop: number): number {
  try {
    const range = document.createRange()
    range.selectNodeContents(block)
    range.setStartAfter(br)
    const rect = range.getClientRects()[0]
    if (rect && hasLayout(rect)) return rect.top - rootTop
  } catch {
    // 某些 WebView/测试环境不支持 Range 几何信息，回退到 br 自身位置。
  }

  const rect = br.getBoundingClientRect()
  const lineHeight = lineHeightOf(block)
  if (hasLayout(rect)) return rect.top - rootTop + (rect.height || lineHeight)
  return fallbackTop + lineHeight
}

function blockLineTops(block: Element, rootTop: number): number[] {
  const rect = block.getBoundingClientRect()
  const lineHeight = lineHeightOf(block)

  if (block.matches('pre')) {
    const contentTop = rect.top - rootTop
      + numericStyle(block, 'borderTopWidth')
      + numericStyle(block, 'paddingTop')
    const lineCount = Math.max(1, (block.textContent ?? '').split('\n').length)
    return Array.from({ length: lineCount }, (_, index) => contentTop + index * lineHeight)
  }

  const tops = [rect.top - rootTop]
  const breaks = block.querySelectorAll('br')
  if ((block.textContent ?? '').length === 0 && breaks.length === 1) return tops

  breaks.forEach((element) => {
    if (!belongsToLineBlock(element, block)) return
    tops.push(topAfterBreak(element as HTMLBRElement, block, rootTop, tops[tops.length - 1]))
  })
  return tops
}

function normalizeAnchorTops(rawTops: number[]): number[] {
  const hasMeasuredLayout = rawTops.some((top) => Math.abs(top) > 0.5)
  if (!hasMeasuredLayout) return rawTops.map((_, index) => index * DEFAULT_LINE_HEIGHT)

  let previousTop = Number.NEGATIVE_INFINITY
  return rawTops.map((rawTop) => {
    const safeTop = Number.isFinite(rawTop) ? rawTop : previousTop + DEFAULT_LINE_HEIGHT
    const top = safeTop > previousTop + 0.5 ? safeTop : previousTop + DEFAULT_LINE_HEIGHT
    previousTop = top
    return top
  })
}

export function createFallbackRenderedLineLayout(lineCount: number, top = 0): RenderedLineLayout {
  const safeLineCount = Math.max(1, lineCount)
  return {
    height: safeLineCount * DEFAULT_LINE_HEIGHT,
    markers: Array.from({ length: safeLineCount }, (_, index) => ({
      lineNumber: index + 1,
      top: index * DEFAULT_LINE_HEIGHT,
    })),
    top,
  }
}

function sourceLines(content: string, lineCount?: number): string[] {
  const lines = content.split('\n')
  if (lineCount === undefined || lineCount === lines.length) return lines
  if (lineCount < lines.length) return lines.slice(0, Math.max(1, lineCount))
  return lines.concat(Array.from({ length: lineCount - lines.length }, () => '__editor_line__'))
}

function mapAnchorsToSourceLines(lines: string[], anchorTops: number[]): RenderedLineMarker[] {
  const lineCount = Math.max(1, lines.length)
  const nonBlankLines = lines
    .map((line, index) => line.trim().length > 0 ? index : -1)
    .filter((index) => index >= 0)
  const candidateLines = anchorTops.length > nonBlankLines.length
    ? Array.from({ length: lineCount }, (_, index) => index)
    : nonBlankLines
  if (candidateLines.length === 0) candidateLines.push(0)

  const anchoredTops = new Map<number, number>()
  if (anchorTops.length <= candidateLines.length) {
    anchorTops.forEach((top, index) => {
      const ratio = anchorTops.length <= 1 ? 0 : index / (anchorTops.length - 1)
      const candidateIndex = Math.round(ratio * (candidateLines.length - 1))
      anchoredTops.set(candidateLines[candidateIndex], top)
    })
  } else {
    candidateLines.forEach((lineIndex, index) => {
      const ratio = candidateLines.length <= 1 ? 0 : index / (candidateLines.length - 1)
      const anchorIndex = Math.round(ratio * (anchorTops.length - 1))
      anchoredTops.set(lineIndex, anchorTops[anchorIndex])
    })
  }

  const previousAnchoredLines = new Array<number | undefined>(lineCount)
  const nextAnchoredLines = new Array<number | undefined>(lineCount)
  let previousLine: number | undefined
  let nextLine: number | undefined

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    if (anchoredTops.has(lineIndex)) previousLine = lineIndex
    previousAnchoredLines[lineIndex] = previousLine
  }
  for (let lineIndex = lineCount - 1; lineIndex >= 0; lineIndex -= 1) {
    if (anchoredTops.has(lineIndex)) nextLine = lineIndex
    nextAnchoredLines[lineIndex] = nextLine
  }

  return Array.from({ length: lineCount }, (_, lineIndex) => {
    const exactTop = anchoredTops.get(lineIndex)
    if (exactTop !== undefined) return { lineNumber: lineIndex + 1, top: exactTop }

    const previous = previousAnchoredLines[lineIndex]
    const next = nextAnchoredLines[lineIndex]
    if (previous !== undefined && next !== undefined) {
      const previousTop = anchoredTops.get(previous)!
      const nextTop = anchoredTops.get(next)!
      const progress = (lineIndex - previous) / (next - previous)
      return { lineNumber: lineIndex + 1, top: previousTop + (nextTop - previousTop) * progress }
    }
    if (previous !== undefined) {
      return {
        lineNumber: lineIndex + 1,
        top: anchoredTops.get(previous)! + (lineIndex - previous) * DEFAULT_LINE_HEIGHT,
      }
    }
    if (next !== undefined) {
      return {
        lineNumber: lineIndex + 1,
        top: anchoredTops.get(next)! - (next - lineIndex) * DEFAULT_LINE_HEIGHT,
      }
    }
    return { lineNumber: lineIndex + 1, top: lineIndex * DEFAULT_LINE_HEIGHT }
  })
}

/**
 * 按渲染后的真实 DOM 位置收集逻辑行，再映射回 Markdown 源码行。
 * 空行保留行号；标题、列表等块级高度不会再让后续行号提前出现。
 */
export function collectRenderedLineLayout(
  root: HTMLElement,
  content: string,
  lineCount?: number,
  scrollElement?: HTMLElement | null,
): RenderedLineLayout {
  const rootRect = root.getBoundingClientRect()
  const rawTops: number[] = []

  root.querySelectorAll(LINE_BLOCK_SELECTOR).forEach((block) => {
    if (!isRenderedLineBlock(block)) return
    rawTops.push(...blockLineTops(block, rootRect.top))
  })

  if (rawTops.length === 0) rawTops.push(0)
  const anchorTops = normalizeAnchorTops(rawTops)
  const markers = mapAnchorsToSourceLines(sourceLines(content, lineCount), anchorTops)
  const rootHeight = Math.max(root.scrollHeight, rootRect.height)
  const height = Math.max(rootHeight, (markers.at(-1)?.top ?? 0) + DEFAULT_LINE_HEIGHT)
  const scrollRect = scrollElement?.getBoundingClientRect()
  const top = scrollElement && scrollRect
    ? rootRect.top - scrollRect.top + scrollElement.scrollTop
    : 0
  return { height, markers, top }
}

export function getVisibleRenderedLineMarkers(
  markers: RenderedLineMarker[],
  scrollTop: number,
  viewportHeight: number,
  gutterTop: number,
  overscan = 240,
): RenderedLineMarker[] {
  if (viewportHeight <= 0) return markers.slice(0, 200)
  const firstTop = scrollTop - gutterTop - overscan
  const lastTop = scrollTop - gutterTop + viewportHeight + overscan
  let start = 0
  let end = markers.length

  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (markers[middle].top < firstTop) start = middle + 1
    else end = middle
  }
  const firstIndex = start
  end = markers.length

  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (markers[middle].top <= lastTop) start = middle + 1
    else end = middle
  }

  return markers.slice(firstIndex, start)
}
