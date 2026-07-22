import { useMemo } from 'react'
import type { TextMatch } from '../FindReplaceBar'

interface SearchHighlightOverlayProps {
  /** 文本域内容 */
  text: string
  /** 所有匹配位置（来自 FindReplaceBar） */
  matches: TextMatch[]
  /** 当前高亮的匹配索引（-1 表示无当前） */
  currentIndex: number
  /** 文本域当前 scrollTop（用于同步滚动） */
  scrollTop: number
  /** 是否为分栏模式（分栏模式 textarea 无居中 max-width，overlay 需同步） */
  isSplit?: boolean
}

/** 将文本按匹配位置拆分为高亮/非高亮片段 */
function splitSegments(text: string, matches: TextMatch[]): Array<{ text: string; highlighted: boolean; matchIdx: number }> {
  if (matches.length === 0) return [{ text, highlighted: false, matchIdx: -1 }]
  const sorted = [...matches].sort((a, b) => a.index - b.index)
  const segments: Array<{ text: string; highlighted: boolean; matchIdx: number }> = []
  let lastEnd = 0
  sorted.forEach((m, mi) => {
    if (m.index > lastEnd) {
      segments.push({ text: text.slice(lastEnd, m.index), highlighted: false, matchIdx: -1 })
    }
    segments.push({ text: text.slice(m.index, m.index + m.length), highlighted: true, matchIdx: mi })
    lastEnd = m.index + m.length
  })
  if (lastEnd < text.length) {
    segments.push({ text: text.slice(lastEnd), highlighted: false, matchIdx: -1 })
  }
  return segments
}

export function SearchHighlightOverlay({ text, matches, currentIndex, scrollTop, isSplit }: SearchHighlightOverlayProps) {
  const segments = useMemo(() => splitSegments(text, matches), [text, matches])

  if (matches.length === 0) return null

  return (
    <div
      className={`search-highlight-overlay${isSplit ? ' search-highlight-overlay--split' : ''}`}
      aria-hidden="true"
    >
      <div
        className="search-highlight-content"
        style={{ transform: `translateY(${-scrollTop}px)` }}
      >
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <mark
              key={i}
              className={`search-highlight-mark${seg.matchIdx === currentIndex ? ' search-highlight-mark--current' : ''}`}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i} className="search-highlight-plain">{seg.text}</span>
          )
        )}
      </div>
    </div>
  )
}
