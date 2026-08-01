export type TocLevel = 1 | 2 | 3

export interface TocItemData {
  level: TocLevel
  text: string
  index: number
}

const atxHeadingPattern = /^\s{0,3}(#{1,3})\s+(.+)$/
const setextHeadingPattern = /^\s{0,3}(=+|-+)\s*$/
const fencedCodePattern = /^\s{0,3}(`{3,}|~{3,})/
const frontMatterBoundaryPattern = /^\s*(---|\.\.\.)\s*$/

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*?)`{1,3}/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/==([^=]*?)==/g, '$1')
}

function normalizeHeadingText(value: string): string {
  return stripInlineMarkdown(value).trim()
}

function stripClosingAtxMarker(text: string): string {
  return text.replace(/\s+#+\s*$/, '')
}

function addTocItem(
  items: TocItemData[],
  counts: Record<TocLevel, number>,
  level: TocLevel,
  value: string,
) {
  const text = normalizeHeadingText(value)
  if (!text) return
  items.push({ level, text, index: counts[level] })
  counts[level] += 1
}

function readBlockInlineText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(readBlockInlineText).join('')
  if (!value || typeof value !== 'object') return ''

  const node = value as { text?: unknown; content?: unknown }
  if (typeof node.text === 'string') return node.text
  return readBlockInlineText(node.content)
}

export function extractTocItemsFromBlocks(blocks: unknown[]): TocItemData[] {
  const items: TocItemData[] = []
  const counts: Record<TocLevel, number> = { 1: 0, 2: 0, 3: 0 }

  const visit = (entries: unknown[]) => {
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const block = entry as { type?: unknown; props?: { level?: unknown }; content?: unknown; children?: unknown }
      const level = Number(block.props?.level)
      if (block.type === 'heading' && (level === 1 || level === 2 || level === 3)) {
        const text = readBlockInlineText(block.content).trim()
        if (text) {
          items.push({ level, text, index: counts[level] })
          counts[level] += 1
        }
      }
      if (Array.isArray(block.children)) visit(block.children)
    }
  }

  visit(blocks)
  return items
}

export function extractTocItems(markdown: string): TocItemData[] {
  const items: TocItemData[] = []
  const counts: Record<TocLevel, number> = { 1: 0, 2: 0, 3: 0 }
  let previousTextLine = ''
  let inFence = false
  let inFrontMatter = false

  for (const [lineIndex, line] of markdown.split('\n').entries()) {
    if (lineIndex === 0 && frontMatterBoundaryPattern.test(line)) {
      inFrontMatter = true
      previousTextLine = ''
      continue
    }
    if (inFrontMatter) {
      if (frontMatterBoundaryPattern.test(line)) inFrontMatter = false
      previousTextLine = ''
      continue
    }

    if (fencedCodePattern.test(line)) {
      inFence = !inFence
      previousTextLine = ''
      continue
    }
    if (inFence) continue

    const heading = line.match(atxHeadingPattern)
    if (heading) {
      const level = heading[1].length as TocLevel
      addTocItem(items, counts, level, stripClosingAtxMarker(heading[2]))
      previousTextLine = ''
      continue
    }

    const setextHeading = line.match(setextHeadingPattern)
    if (setextHeading && previousTextLine.trim()) {
      const level = setextHeading[1].startsWith('=') ? 1 : 2
      addTocItem(items, counts, level, previousTextLine)
      previousTextLine = ''
      continue
    }

    previousTextLine = line.trim() ? line : ''
  }

  return items
}

export function findTocHeadingElement(
  root: ParentNode,
  item: Pick<TocItemData, 'level' | 'text'> & { index?: number },
): HTMLElement | null {
  const headings = Array.from(root.querySelectorAll<HTMLElement>(`h${item.level}`))
  if (typeof item.index === 'number' && item.index >= 0) {
    const indexed = headings[item.index]
    if (indexed) return indexed
  }

  const text = normalizeHeadingText(item.text)
  for (const heading of headings) {
    if (normalizeHeadingText(heading.textContent ?? '') === text) return heading
  }

  return null
}
