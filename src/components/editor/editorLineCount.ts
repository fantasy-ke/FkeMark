import type { Editor as TiptapEditor } from '@tiptap/react'
import { countDocumentLines } from '../../utils/documentStats'

export function countEditorLines(editor: TiptapEditor): number {
  return countDocumentLines(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n'))
}
