import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import type { EditorHandle } from '../components/Editor'
import type { EditorMode } from '../types'

interface CurrentEditorContentOptions {
  editorMode: EditorMode
  fileContent: string
  setFileContent: Dispatch<SetStateAction<string>>
  setEditorMode: Dispatch<SetStateAction<EditorMode>>
}

export function useCurrentEditorContent({
  editorMode,
  fileContent,
  setFileContent,
  setEditorMode,
}: CurrentEditorContentOptions) {
  const editorHandleRef = useRef<EditorHandle>(null)
  const getCurrentContent = useCallback(() => {
    const content = editorMode === 'live' ? (editorHandleRef.current?.getContent() ?? fileContent) : fileContent
    if (content !== fileContent) setFileContent(content)
    return content
  }, [editorMode, fileContent, setFileContent])
  const handleEditorModeChange = useCallback((mode: EditorMode) => {
    getCurrentContent()
    setEditorMode(mode)
  }, [getCurrentContent, setEditorMode])

  return { editorHandleRef, getCurrentContent, handleEditorModeChange }
}
