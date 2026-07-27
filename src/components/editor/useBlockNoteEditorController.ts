import { useCallback, useEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { EditorModeEnum } from '../../types'
import type { EditorMode } from '../../types'
import { toAssetUrl } from '../../utils/asset'
import { fkeMarkBlockNoteSchema } from './blockNoteSchema'
import { cacheBlockNoteDocument, readCachedBlockNoteDocument } from './blockNoteDocumentCache'
import { applyBlockNoteDocument } from './blockNoteContentSwap'
import {
  installFkeMarkBlockNoteSerializer,
  parseBlockNoteDocument,
  type AnyBlockNoteEditor,
} from './blockNoteMarkdown'
import {
  useEditorMarkdownPipeline,
  type EditorDocumentSnapshot,
  type EditorSerializationReason,
} from './useEditorMarkdownPipeline'

interface BlockNoteEditorControllerOptions {
  content: string
  docDir: string | null
  editorMode: EditorMode
  editorModeRef: { current: EditorMode }
  filePath: string | null | undefined
  largeDocument: boolean
  onChange: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
  spellCheckEnabled: boolean
}

export function useBlockNoteEditorController(options: BlockNoteEditorControllerOptions) {
  const {
    content, docDir, editorMode, editorModeRef, filePath, largeDocument,
    onChange, onDirty, onLineCountChange, spellCheckEnabled,
  } = options
  const docDirRef = useRef<string | null>(docDir)
  docDirRef.current = docDir
  const originalContentRef = useRef(content)
  const hasUserEditedRef = useRef(false)
  const editorDocumentRef = useRef<EditorDocumentSnapshot>({ content, docDir, revision: 0 })
  const suppressChangeRef = useRef(false)
  const composingRef = useRef(false)
  const pendingCompositionChangeRef = useRef(false)
  const applySequenceRef = useRef(0)
  const suppressApplyIdRef = useRef(0)
  const ignoreNextAppliedChangeRef = useRef(false)
  const userInputSinceApplyRef = useRef(false)
  const ignoreAppliedChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appliedTargetRef = useRef<{ content: string; docDir: string | null; key: string } | null>(null)

  const blockNoteEditor = useCreateBlockNote({
    animations: false,
    defaultStyles: false,
    disableExtensions: ['previousBlockType'],
    domAttributes: {
      editor: {
        class: 'editor-inner',
        spellcheck: String(spellCheckEnabled && !largeDocument),
      },
    },
    resolveFileUrl: async (url) => toAssetUrl(url, docDirRef.current),
    schema: fkeMarkBlockNoteSchema,
    tabBehavior: 'prefer-indent',
  }) as AnyBlockNoteEditor
  installFkeMarkBlockNoteSerializer(blockNoteEditor)

  const {
    cancelPendingChange,
    flushPendingChange,
    flushPendingChangeDeferred,
    handleEditorChange,
  } = useEditorMarkdownPipeline({
    docDirRef,
    editorDocumentRef,
    editorModeRef,
    hasUserEditedRef,
    isSettingContentRef: suppressChangeRef,
    onChange,
    onDirty,
    onLineCountChange,
  })

  const clearIgnoredAppliedChange = useCallback(() => {
    ignoreNextAppliedChangeRef.current = false
    userInputSinceApplyRef.current = false
    if (ignoreAppliedChangeTimerRef.current === null) return
    clearTimeout(ignoreAppliedChangeTimerRef.current)
    ignoreAppliedChangeTimerRef.current = null
  }, [])

  const armIgnoredAppliedChange = useCallback(() => {
    clearIgnoredAppliedChange()
    ignoreNextAppliedChangeRef.current = true
    ignoreAppliedChangeTimerRef.current = setTimeout(() => {
      clearIgnoredAppliedChange()
    }, 250)
  }, [clearIgnoredAppliedChange])

  const markBlockNoteUserInput = useCallback(() => {
    userInputSinceApplyRef.current = true
  }, [])

  const syncEditorDomAttributes = useCallback(() => {
    const dom = blockNoteEditor.domElement
    if (!dom) return
    dom.classList.add('editor-inner')
    dom.classList.toggle('editor-inner--large-document', largeDocument)
    dom.setAttribute('spellcheck', String(spellCheckEnabled && !largeDocument))
  }, [blockNoteEditor, largeDocument, spellCheckEnabled])

  useEffect(() => {
    syncEditorDomAttributes()
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(syncEditorDomAttributes)
      : null
    return () => {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    }
  }, [editorMode, syncEditorDomAttributes])

  useEffect(() => {
    const eventNames = ['beforeinput', 'keydown', 'paste', 'drop', 'compositionend'] as const
    const attachedCleanups: Array<() => void> = []
    let frame: number | null = null
    const attach = () => {
      const dom = blockNoteEditor.domElement
      if (!dom || attachedCleanups.length) return
      eventNames.forEach((eventName) => dom.addEventListener(eventName, markBlockNoteUserInput, true))
      attachedCleanups.push(() => {
        eventNames.forEach((eventName) => dom.removeEventListener(eventName, markBlockNoteUserInput, true))
      })
    }
    attach()
    if (!attachedCleanups.length && typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(attach)
    }
    return () => {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      attachedCleanups.forEach((cleanup) => cleanup())
    }
  }, [blockNoteEditor, markBlockNoteUserInput])

  useEffect(() => () => clearIgnoredAppliedChange(), [clearIgnoredAppliedChange])

  useEffect(() => {
    if (!suppressChangeRef.current) blockNoteEditor.isEditable = editorMode === EditorModeEnum.Live
  }, [blockNoteEditor, editorMode])

  useEffect(() => {
    if (editorMode === EditorModeEnum.Source || editorMode === EditorModeEnum.Split) return
    const key = filePath ?? '__untitled__'
    const applied = appliedTargetRef.current
    if (applied?.key === key && applied.content === content && applied.docDir === docDir) return

    const synced = editorDocumentRef.current
    if (hasUserEditedRef.current && content === synced.content && docDir === synced.docDir) {
      originalContentRef.current = content
      appliedTargetRef.current = { content, docDir, key }
      cacheBlockNoteDocument(key, content, blockNoteEditor.document)
      return
    }

    const sequence = ++applySequenceRef.current
    const sourceLines = content ? content.split(/\r?\n/u).length : 1
    cancelPendingChange()
    clearIgnoredAppliedChange()
    originalContentRef.current = content
    hasUserEditedRef.current = false
    editorDocumentRef.current = { content, docDir, revision: synced.revision + 1 }

    void (async () => {
      try {
        const cached = readCachedBlockNoteDocument(key, content)
        const blocks = cached ?? (await parseBlockNoteDocument(blockNoteEditor, content)).blocks
        if (sequence !== applySequenceRef.current) return
        const suppressApplyId = ++suppressApplyIdRef.current
        const appliedSuccessfully = await applyBlockNoteDocument({
          blocks,
          editor: blockNoteEditor,
          editable: editorMode === EditorModeEnum.Live,
          onBeforeUnsuppress: () => {
            if (editorMode === EditorModeEnum.Live) armIgnoredAppliedChange()
          },
          ownsSuppression: () => suppressApplyId === suppressApplyIdRef.current,
          shouldAbort: () => sequence !== applySequenceRef.current,
          sourceCharacters: content.length,
          sourceLines,
          suppressChangeRef,
        })
        if (!appliedSuccessfully || sequence !== applySequenceRef.current) return
        cacheBlockNoteDocument(key, content, blockNoteEditor.document)
        appliedTargetRef.current = { content, docDir, key }
        syncEditorDomAttributes()
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncEditorDomAttributes)
        onLineCountChange?.(sourceLines)
      } catch (error) {
        console.error('[editor] BlockNote document apply failed', {
          error,
          filePath: key,
          sourceCharacters: content.length,
        })
        clearIgnoredAppliedChange()
        suppressChangeRef.current = false
        blockNoteEditor.isEditable = editorMode === EditorModeEnum.Live
        syncEditorDomAttributes()
      }
    })()

    return () => { applySequenceRef.current += 1 }
  }, [
    armIgnoredAppliedChange, blockNoteEditor, cancelPendingChange, clearIgnoredAppliedChange, content, docDir, editorMode,
    filePath, onLineCountChange, syncEditorDomAttributes,
  ])

  const handleBlockNoteChange = useCallback((editor: AnyBlockNoteEditor) => {
    if (suppressChangeRef.current) return
    if (ignoreNextAppliedChangeRef.current && !userInputSinceApplyRef.current) {
      clearIgnoredAppliedChange()
      return
    }
    clearIgnoredAppliedChange()
    if (composingRef.current) {
      pendingCompositionChangeRef.current = true
      return
    }
    handleEditorChange(editor)
  }, [clearIgnoredAppliedChange, handleEditorChange])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    if (!pendingCompositionChangeRef.current) return
    pendingCompositionChangeRef.current = false
    Promise.resolve().then(() => handleEditorChange(blockNoteEditor))
  }, [blockNoteEditor, handleEditorChange])

  const getCurrentContent = useCallback(() => {
    const pendingContent = flushPendingChange('sync-read')
    if (pendingContent !== null) return pendingContent
    if (!hasUserEditedRef.current) return originalContentRef.current
    return editorDocumentRef.current.content
  }, [flushPendingChange])

  const getContentDeferred = useCallback(async (
    signal?: AbortSignal,
    reason: EditorSerializationReason = 'save',
  ) => (await flushPendingChangeDeferred(signal, reason)) ?? getCurrentContent(), [
    flushPendingChangeDeferred,
    getCurrentContent,
  ])

  return {
    blockNoteEditor,
    editor: blockNoteEditor._tiptapEditor as unknown as TiptapEditor,
    editorDocumentRef,
    getContentDeferred,
    getCurrentContent,
    handleBlockNoteChange,
    handleCompositionEnd,
    handleCompositionStart,
  }
}
