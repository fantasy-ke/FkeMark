import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { EditorMode } from '../../types'
import { htmlToMarkdown } from '../../utils/markdown/engine'
import { isLargeDocument } from '../../utils/performance'

const LONG_DOCUMENT_CHANGE_DELAY_MS = 300

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
}

export function useDeferredEditorChange({
  docDirRef,
  editorDocumentRef,
  editorModeRef,
  hasUserEditedRef,
  isSettingContentRef,
  onChange,
  onDirty,
}: DeferredEditorChangeOptions) {
  const pendingEditorRef = useRef<TiptapEditor | null>(null)
  const timerRef = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)
  const onDirtyRef = useRef(onDirty)
  onChangeRef.current = onChange
  onDirtyRef.current = onDirty

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const serializeEditor = useCallback((editor: TiptapEditor, notify: boolean) => {
    clearTimer()
    pendingEditorRef.current = null
    const md = htmlToMarkdown(editor.getHTML(), docDirRef.current)
    editorDocumentRef.current = { content: md, docDir: docDirRef.current }
    if (notify) onChangeRef.current(md)
    return md
  }, [clearTimer, docDirRef, editorDocumentRef])

  const handleEditorUpdate = useCallback(({ editor, transaction }: EditorUpdateEvent) => {
    if (!transaction.docChanged) return
    if (isSettingContentRef.current || editorModeRef.current !== 'live') return

    hasUserEditedRef.current = true
    if (!isLargeDocument(editorDocumentRef.current.content)) {
      serializeEditor(editor, true)
      return
    }

    const alreadyPending = pendingEditorRef.current !== null
    pendingEditorRef.current = editor
    if (!alreadyPending) onDirtyRef.current?.()
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const pendingEditor = pendingEditorRef.current
      if (pendingEditor) serializeEditor(pendingEditor, true)
    }, LONG_DOCUMENT_CHANGE_DELAY_MS)
  }, [clearTimer, editorDocumentRef, editorModeRef, hasUserEditedRef, isSettingContentRef, serializeEditor])

  const flushPendingChange = useCallback(() => {
    const pendingEditor = pendingEditorRef.current
    return pendingEditor ? serializeEditor(pendingEditor, false) : null
  }, [serializeEditor])

  const cancelPendingChange = useCallback(() => {
    clearTimer()
    pendingEditorRef.current = null
  }, [clearTimer])

  useEffect(() => cancelPendingChange, [cancelPendingChange])

  return { cancelPendingChange, flushPendingChange, handleEditorUpdate }
}
