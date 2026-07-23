import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { useI18n } from '../../i18n'
import { MAX_AI_CONTEXT_CHARS } from '../../utils/aiAssistant'

interface AiSelectionButtonProps {
  editor: Editor
  visible: boolean
  onAdd?: (text: string) => void
}

interface SelectionButtonState {
  text: string
  x: number
  y: number
}

export function AiSelectionButton({ editor, visible, onAdd }: AiSelectionButtonProps) {
  const { t } = useI18n()
  const [selection, setSelection] = useState<SelectionButtonState | null>(null)

  useEffect(() => {
    if (!visible || !onAdd) {
      setSelection(null)
      return
    }

    const update = () => {
      const { from, to, empty } = editor.state.selection
      if (empty) return setSelection(null)
      const text = editor.state.doc.textBetween(from, to, '\n').trim().slice(0, MAX_AI_CONTEXT_CHARS)
      if (!text) return setSelection(null)
      try {
        const coords = editor.view.coordsAtPos(to)
        setSelection({
          text,
          x: Math.max(24, Math.min(window.innerWidth - 24, coords.left)),
          y: Math.max(48, coords.top - 8),
        })
      } catch {
        setSelection(null)
      }
    }
    const hide = () => setSelection(null)

    editor.on('selectionUpdate', update)
    editor.on('blur', hide)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    update()
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', hide)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [editor, onAdd, visible])

  if (!selection || !onAdd) return null

  return createPortal(
    <button
      type="button"
      className="ai-selection-button"
      style={{ left: selection.x, top: selection.y }}
      title={t('ai.chat.addSelection')}
      aria-label={t('ai.chat.addSelection')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onAdd(selection.text)
        setSelection(null)
      }}
    >
      <svg viewBox="0 0 24 24"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></svg>
      <span>AI</span>
    </button>,
    document.body,
  )
}
