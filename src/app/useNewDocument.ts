import { useState } from 'react'
import type { Lang } from '../i18n'
import { translate } from '../i18n'
import type { EditorMode } from '../types'

type CreateTab = (
  name: string,
  path: string | null,
  content: string,
  mode?: EditorMode,
  savedAt?: number | null,
  initiallyModified?: boolean,
) => string

interface UseNewDocumentParams {
  language: Lang
  createTab: CreateTab
}

export function useNewDocument({ language, createTab }: UseNewDocumentParams) {
  const [quickStartOpen, setQuickStartOpen] = useState(false)

  function handleNewFile() {
    setQuickStartOpen(true)
  }

  function handleCloseQuickStart() {
    setQuickStartOpen(false)
  }

  function handleCreateFromTemplate(content: string) {
    createTab(
      translate(language, 'document.untitledFileName'),
      null,
      content,
      undefined,
      null,
      true,
    )
    setQuickStartOpen(false)
  }

  return { quickStartOpen, handleNewFile, handleCloseQuickStart, handleCreateFromTemplate }
}
