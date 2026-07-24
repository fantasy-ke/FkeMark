import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'

interface LineNumbersProps {
  content: string
  className?: string
  scrollTop?: number
  topOffset?: number
  editor?: TiptapEditor | null
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

function countEditorLines(editor: TiptapEditor) {
  return countLines(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n'))
}

/**
 * Render line numbers as one text node to avoid thousands of React children in large documents.
 */
export const LineNumbers = memo(function LineNumbers({
  content,
  className = '',
  scrollTop = 0,
  topOffset = 40,
  editor,
}: LineNumbersProps) {
  const contentLineCount = useMemo(() => countLines(content), [content])
  const [editorLineCount, setEditorLineCount] = useState<number | null>(null)

  useEffect(() => {
    setEditorLineCount(null)
  }, [content])

  useEffect(() => {
    if (!editor) return
    const syncLineCount = () => {
      const nextLineCount = countEditorLines(editor)
      setEditorLineCount((current) => current === nextLineCount ? current : nextLineCount)
    }
    editor.on('update', syncLineCount)
    return () => { editor.off('update', syncLineCount) }
  }, [editor])

  const lineCount = editorLineCount ?? contentLineCount
  const numbers = useMemo(() => buildLineNumberText(lineCount), [lineCount])
  const style = {
    '--line-number-top': `${topOffset}px`,
    transform: scrollTop ? `translateY(-${scrollTop}px)` : undefined,
  } as CSSProperties

  return <pre className={`editor-line-numbers ${className}`.trim()} style={style} aria-hidden="true">{numbers}</pre>
})
