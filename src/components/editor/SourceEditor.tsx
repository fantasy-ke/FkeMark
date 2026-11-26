import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ChangeEvent, type CSSProperties, type RefObject, type UIEvent } from 'react'
import type { TextMatch } from '../FindReplaceBar'
import { countDocumentLines } from '../../utils/documentStats'
import { MarkdownSyntaxHighlightOverlay } from './MarkdownSyntaxHighlightOverlay'
import { SearchHighlightOverlay } from './SearchHighlightOverlay'

interface SourceEditorProps {
  content: string
  textareaRef: RefObject<HTMLTextAreaElement>
  syncScrollRef: RefObject<() => void>
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onScroll?: (event: UIEvent<HTMLTextAreaElement>) => void
  placeholder: string
  spellCheck: boolean
  lang: string
  isSplit?: boolean
  matches: TextMatch[]
  currentIndex: number
}

export function SourceEditor({
  content,
  textareaRef,
  syncScrollRef,
  onChange,
  onScroll,
  placeholder,
  spellCheck,
  lang,
  isSplit = false,
  matches,
  currentIndex,
}: SourceEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const syntaxRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const { lineCount, lineNumbers } = useMemo(() => {
    const count = countDocumentLines(content)
    return { lineCount: count, lineNumbers: Array.from({ length: count }, (_, i) => i + 1).join('\n') }
  }, [content])

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const left = -textarea.scrollLeft
    const top = -textarea.scrollTop
    const transform = `translate(${left}px, ${top}px)`
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${top}px)`
    if (syntaxRef.current) syntaxRef.current.style.transform = transform
    if (searchRef.current) searchRef.current.style.transform = transform
  }, [textareaRef])
  useImperativeHandle(syncScrollRef, () => syncScroll, [syncScroll])
  // 搜索层可能在已滚动的位置首次挂载，需要在绘制前对齐。
  const hasMatches = matches.length > 0
  useLayoutEffect(syncScroll, [syncScroll, content, hasMatches])
  useLayoutEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const textareaStyle: CSSProperties | undefined = isSplit
    ? { width: '100%', maxWidth: 'none', margin: 0 }
    : undefined

  return (
    <div className={`source-editor${isSplit ? ' source-editor--split' : ''}`}>
      <div
        className="source-line-numbers"
        aria-hidden="true"
        style={{ minWidth: `${Math.max(2, String(lineCount).length)}ch` }}
      >
        <div ref={gutterRef} className="source-line-numbers-content">
          {lineNumbers}
        </div>
      </div>
      <div className="source-textarea-wrapper">
        <textarea
          ref={textareaRef}
          className={isSplit ? 'source-textarea split-source-textarea' : 'source-textarea'}
          value={content}
          onChange={onChange}
          onScroll={(event) => {
            if (frameRef.current === null) {
              frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null
                syncScroll()
              })
            }
            onScroll?.(event)
          }}
          placeholder={placeholder}
          spellCheck={spellCheck}
          lang={lang}
          wrap="off"
          style={textareaStyle}
        />
        <MarkdownSyntaxHighlightOverlay
          text={content}
          contentRef={syntaxRef}
          isSplit={isSplit}
        />
        <SearchHighlightOverlay
          text={content}
          matches={matches}
          currentIndex={currentIndex}
          contentRef={searchRef}
          isSplit={isSplit}
        />
      </div>
    </div>
  )
}
