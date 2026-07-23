import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'

interface SlashMenuState {
  open: boolean
  query: string
  x: number
  y: number
}

export function useSlashMenuTrigger(
  editor: TiptapEditor | null,
  setSlashState: Dispatch<SetStateAction<SlashMenuState>>,
  onBeforeOpen: () => void,
) {
  const onBeforeOpenRef = useRef(onBeforeOpen)
  onBeforeOpenRef.current = onBeforeOpen

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { selection } = editor.state
      if (!selection.empty) {
        setSlashState((state) => state.open ? { ...state, open: false } : state)
        return
      }
      const $from = selection.$from
      if ($from.parent.type.name !== 'paragraph' && $from.parent.type.name !== 'heading') {
        setSlashState((state) => state.open ? { ...state, open: false } : state)
        return
      }
      const match = $from.parent.textContent.slice(0, $from.parentOffset).match(/(?:^|\s)\/(\w*)$/)
      if (!match) {
        setSlashState((state) => state.open ? { ...state, open: false } : state)
        return
      }

      try {
        const coords = editor.view.coordsAtPos(selection.from)
        onBeforeOpenRef.current()
        setSlashState({ open: true, query: match[1], x: coords.left, y: coords.bottom + 4 })
      } catch { /* Ignore unavailable coordinates while the editor view is updating. */ }
    }

    editor.on('transaction', update)
    return () => { editor.off('transaction', update) }
  }, [editor, setSlashState])
}
