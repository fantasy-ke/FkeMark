import { useCallback, useRef, type MutableRefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { EditorMode } from '../../types'
import { htmlToMarkdown } from '../../utils/markdown/engine'
import { isLargeDocument } from '../../utils/performance'
import { countEditorLines } from './editorLineCount'

interface EditorUpdateEvent {
  editor: TiptapEditor
  transaction: { docChanged: boolean }
}

interface EditorDocumentSnapshot {
  content: string
  docDir: string | null
}

interface DeferredEditorChangeOptions {
  docDirRef: MutableRefObject<string | null>
  editorDocumentRef: MutableRefObject<EditorDocumentSnapshot>
  editorModeRef: MutableRefObject<EditorMode>
  hasUserEditedRef: MutableRefObject<boolean>
  isSettingContentRef: MutableRefObject<boolean>
  onChange: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
}

export function useDeferredEditorChange({
  docDirRef,
  editorDocumentRef,
  editorModeRef,
  hasUserEditedRef,
  isSettingContentRef,
  onChange,
  onDirty,
  onLineCountChange,
}: DeferredEditorChangeOptions) {
  const pendingEditorRef = useRef<TiptapEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onDirtyRef = useRef(onDirty)
  const onLineCountChangeRef = useRef(onLineCountChange)
  onChangeRef.current = onChange
  onDirtyRef.current = onDirty
  onLineCountChangeRef.current = onLineCountChange

  const serializeEditor = useCallback((editor: TiptapEditor, notify: boolean) => {
    pendingEditorRef.current = null
    const md = htmlToMarkdown(editor.getHTML(), docDirRef.current)
    editorDocumentRef.current = { content: md, docDir: docDirRef.current }
    if (notify) onChangeRef.current(md)
    return md
  }, [docDirRef, editorDocumentRef])

  const handleEditorUpdate = useCallback(({ editor, transaction }: EditorUpdateEvent) => {
    if (!transaction.docChanged) return
    if (isSettingContentRef.current || editorModeRef.current !== 'live') return

    hasUserEditedRef.current = true
    onLineCountChangeRef.current?.(countEditorLines(editor))
    if (!isLargeDocument(editorDocumentRef.current.content)) {
      serializeEditor(editor, true)
      return
    }

    const alreadyPending = pendingEditorRef.current !== null
    pendingEditorRef.current = editor
    if (!alreadyPending) onDirtyRef.current?.()
  }, [editorDocumentRef, editorModeRef, hasUserEditedRef, isSettingContentRef, serializeEditor])

  const flushPendingChange = useCallback(() => {
    const pendingEditor = pendingEditorRef.current
    return pendingEditor ? serializeEditor(pendingEditor, false) : null
  }, [serializeEditor])

  const cancelPendingChange = useCallback(() => {
    pendingEditorRef.current = null
  }, [])

  return { cancelPendingChange, flushPendingChange, handleEditorUpdate }
}
