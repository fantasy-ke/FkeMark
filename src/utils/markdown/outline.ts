export type TocLevel = 1 | 2 | 3

export interface TocItemData {
  level: TocLevel
  text: string
  index: number
}

const headingPattern = /^(#{1,3})\s+(.+)$/

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

export function extractTocItems(markdown: string): TocItemData[] {
  const items: TocItemData[] = []
  const counts: Record<TocLevel, number> = { 1: 0, 2: 0, 3: 0 }

  for (const line of markdown.split('\n')) {
    const heading = line.match(headingPattern)
    if (!heading) continue

    const level = heading[1].length as TocLevel
    const text = normalizeHeadingText(heading[2])
    items.push({ level, text, index: counts[level] })
    counts[level] += 1
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
