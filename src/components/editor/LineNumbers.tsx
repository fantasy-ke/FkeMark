import { memo, useMemo, type CSSProperties } from 'react'

interface LineNumbersProps {
  content: string
  className?: string
  scrollTop?: number
  topOffset?: number
}

function countLines(content: string) {
  let count = 1
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) count += 1
  }
  return count
}

function buildLineNumberText(lineCount: number) {
  const lines = new Array<string>(lineCount)
  for (let i = 0; i < lineCount; i += 1) lines[i] = String(i + 1)
  return lines.join('\n')
}

/**
 * Render line numbers as one text node to avoid thousands of React children in large documents.
 */
export const LineNumbers = memo(function LineNumbers({
  content,
  className = '',
  scrollTop = 0,
  topOffset = 40,
}: LineNumbersProps) {
  const lineCount = useMemo(() => countLines(content), [content])
  const numbers = useMemo(() => buildLineNumberText(lineCount), [lineCount])
  const style = {
    '--line-number-top': `${topOffset}px`,
    transform: scrollTop ? `translateY(-${scrollTop}px)` : undefined,
  } as CSSProperties

  return <pre className={`editor-line-numbers ${className}`.trim()} style={style} aria-hidden="true">{numbers}</pre>
})
