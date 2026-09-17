const HEADING_LINE_RE = /^ {0,3}#{1,6}[ \t]+/
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
export const HEADING_COLLAPSE_MARKER = '<!--fk-collapsed-->'
export const HEADING_COLLAPSE_MARKER_RE = /\s*<!--\s*fk-collapsed\s*-->\s*$/

const sessionCollapsedIds = new Set<string>()
const sessionListeners = new Set<() => void>()

export function isHeadingCollapsed(props?: Record<string, unknown> | null): boolean {
  return props?.collapsed === true
}

export function isSessionCollapsedHeading(id: string): boolean {
  return Boolean(id) && sessionCollapsedIds.has(id)
}

export function getSessionCollapsedHeadingIds(): Set<string> {
  return new Set(sessionCollapsedIds)
}

export function setSessionCollapsedHeadingIds(ids: Iterable<string>) {
  sessionCollapsedIds.clear()
  for (const id of ids) sessionCollapsedIds.add(id)
  sessionListeners.forEach((listener) => listener())
}

export function subscribeSessionCollapsedHeadingIds(listener: () => void): () => void {
  sessionListeners.add(listener)
  return () => { sessionListeners.delete(listener) }
}

export function headingIdsAtIndexes(blocks: unknown, indexes: number[]): string[] {
  const wanted = new Set(indexes)
  const ids: string[] = []
  let index = 0
  const visit = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const block = item as { id?: unknown; type?: unknown; children?: unknown[] }
      if (block.type === 'heading') {
        if (wanted.has(index) && typeof block.id === 'string') ids.push(block.id)
        index += 1
      }
      if (Array.isArray(block.children)) visit(block.children)
    }
  }
  if (Array.isArray(blocks)) visit(blocks)
  return ids
}

export function extractHeadingCollapseMarkers(markdown: string): {
  markdown: string
  collapsedIndexes: number[]
} {
  const lines = markdown.split('\n')
  const collapsedIndexes: number[] = []
  let fenceChar = ''
  let fenceLength = 0
  let headingIndex = 0
  const next = lines.map((line) => {
    const fence = line.match(FENCE_RE)
    if (fenceChar) {
      if (
        fence
        && fence[1][0] === fenceChar
        && fence[1].length >= fenceLength
        && /^\s*$/.test(line.slice(fence[0].length))
      ) {
        fenceChar = ''
        fenceLength = 0
      }
      return line
    }
    if (fence) {
      fenceChar = fence[1][0]
      fenceLength = fence[1].length
      return line
    }
    if (!HEADING_LINE_RE.test(line)) return line
    if (HEADING_COLLAPSE_MARKER_RE.test(line)) collapsedIndexes.push(headingIndex)
    headingIndex += 1
    return line.replace(HEADING_COLLAPSE_MARKER_RE, '')
  })
  return { markdown: next.join('\n'), collapsedIndexes }
}
