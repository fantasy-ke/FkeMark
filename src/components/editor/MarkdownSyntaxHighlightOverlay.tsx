import { useMemo } from 'react'

export type MarkdownSyntaxToken = 'heading' | 'block' | 'delimiter' | 'link' | 'fence' | 'meta'

export interface MarkdownSyntaxSegment {
  text: string
  token?: MarkdownSyntaxToken
}

const INLINE_MARKER_PATTERN = /```+|~~~+|!\[|\]\(|\*\*|__|~~|==|`|\*|_/g

function overlaps(start: number, end: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => start < range.end && end > range.start)
}

function tokenizeLine(line: string, inFence: boolean): { segments: MarkdownSyntaxSegment[]; closesFence: boolean } {
  const segments: MarkdownSyntaxSegment[] = []
  const ranges: Array<{ start: number; end: number }> = []
  const matches: Array<{ start: number; end: number; token: MarkdownSyntaxToken }> = []
  const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)

  if (fence) {
    const start = fence.index + fence[0].lastIndexOf(fence[1])
    matches.push({ start, end: start + fence[1].length, token: 'fence' })
    ranges.push({ start, end: start + fence[1].length })
    if (inFence) return { segments: buildSegments(line, matches), closesFence: true }
    return { segments: buildSegments(line, matches), closesFence: false }
  }

  if (inFence) return { segments: [{ text: line }], closesFence: false }

  const blockPrefix = /^( {0,3}(?:#{1,6}(?=\s|$)|>\s?|(?:[-+*]|\d+[.)])(?=\s)|\[[ xX]\](?=\s)))/.exec(line)
  if (blockPrefix) {
    const token: MarkdownSyntaxToken = /^\s{0,3}#{1,6}/.test(blockPrefix[1]) ? 'heading' : 'block'
    matches.push({ start: 0, end: blockPrefix[1].length, token })
    ranges.push({ start: 0, end: blockPrefix[1].length })
  } else if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
    matches.push({ start: 0, end: line.length, token: 'block' })
    ranges.push({ start: 0, end: line.length })
  }

  let match: RegExpExecArray | null
  while ((match = INLINE_MARKER_PATTERN.exec(line))) {
    const start = match.index
    const end = start + match[0].length
    if (overlaps(start, end, ranges)) continue
    const token: MarkdownSyntaxToken = match[0] === '![' || match[0] === ']('
      ? 'link'
      : match[0] === '`' || match[0] === '```' || match[0] === '~~~'
        ? 'delimiter'
        : 'delimiter'
    matches.push({ start, end, token })
  }
  INLINE_MARKER_PATTERN.lastIndex = 0
  matches.sort((a, b) => a.start - b.start)
  segments.push(...buildSegments(line, matches))
  return { segments, closesFence: false }
}

function buildSegments(line: string, matches: Array<{ start: number; end: number; token: MarkdownSyntaxToken }>) {
  const segments: MarkdownSyntaxSegment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) segments.push({ text: line.slice(cursor, match.start) })
    segments.push({ text: line.slice(match.start, match.end), token: match.token })
    cursor = match.end
  }
  if (cursor < line.length) segments.push({ text: line.slice(cursor) })
  return segments.length > 0 ? segments : [{ text: line }]
}

export function tokenizeMarkdownSyntax(text: string): MarkdownSyntaxSegment[] {
  if (!text) return []
  const lines = text.split('\n')
  const segments: MarkdownSyntaxSegment[] = []
  let inFence = false
  lines.forEach((line, index) => {
    const lineResult = tokenizeLine(line, inFence)
    segments.push(...lineResult.segments)
    if (lineResult.segments.some((segment) => segment.token === 'fence')) inFence = !inFence
    if (index < lines.length - 1) segments.push({ text: '\n' })
  })
  return segments
}

interface MarkdownSyntaxHighlightOverlayProps {
  text: string
  scrollLeft?: number
  scrollTop: number
  isSplit?: boolean
}

export function MarkdownSyntaxHighlightOverlay({ text, scrollLeft = 0, scrollTop, isSplit = false }: MarkdownSyntaxHighlightOverlayProps) {
  const segments = useMemo(() => tokenizeMarkdownSyntax(text), [text])
  if (segments.length === 0) return null

  return (
    <div className={`markdown-syntax-highlight-overlay${isSplit ? ' markdown-syntax-highlight-overlay--split' : ''}`} aria-hidden="true">
      <div
        className="markdown-syntax-highlight-content"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        {segments.map((segment, index) => (
          segment.token
            ? <span key={index} className={`markdown-syntax-token markdown-syntax-token--${segment.token}`}>{segment.text}</span>
            : <span key={index}>{segment.text}</span>
        ))}
      </div>
    </div>
  )
}
