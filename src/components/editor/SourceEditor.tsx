import type { ChangeEvent, CSSProperties, Ref, UIEvent } from 'react'
import type { TextMatch } from '../FindReplaceBar'
import { MarkdownSyntaxHighlightOverlay } from './MarkdownSyntaxHighlightOverlay'
import { SearchHighlightOverlay } from './SearchHighlightOverlay'

interface SourceEditorProps {
  content: string
  textareaRef: Ref<HTMLTextAreaElement>
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onScroll?: (event: UIEvent<HTMLTextAreaElement>) => void
  scrollLeft: number
  scrollTop: number
  onScrollPosition: (scrollLeft: number, scrollTop: number) => void
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
  onChange,
  onScroll,
  scrollLeft,
  scrollTop,
  onScrollPosition,
  placeholder,
  spellCheck,
  lang,
  isSplit = false,
  matches,
  currentIndex,
}: SourceEditorProps) {
  const lineCount = Math.max(1, content.split('\n').length)
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')
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
        <div className="source-line-numbers-content" style={{ transform: `translateY(${-scrollTop}px)` }}>
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
            const textarea = event.currentTarget
            onScrollPosition(textarea.scrollLeft, textarea.scrollTop)
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
          scrollLeft={scrollLeft}
          scrollTop={scrollTop}
          isSplit={isSplit}
        />
        <SearchHighlightOverlay
          text={content}
          matches={matches}
          currentIndex={currentIndex}
          scrollLeft={scrollLeft}
          scrollTop={scrollTop}
          isSplit={isSplit}
        />
      </div>
    </div>
  )
}
