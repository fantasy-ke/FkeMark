import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { EditorModeEnum } from '../../types'
import type { EditorMode } from '../../types'
import { toAssetUrl } from '../../utils/asset'
import { fkeMarkBlockNoteSchema } from './blockNoteSchema'
import { extractTocItemsFromBlocks, type TocItemData } from '../../utils/markdown/outline'
import { markdownMarkerExtension } from './markdownMarkerExtension'
import { aiGhostTextExtension } from './aiGhostTextExtension'
import { cacheBlockNoteDocument, readCachedBlockNoteDocument } from './blockNoteDocumentCache'
import { applyBlockNoteDocument } from './blockNoteContentSwap'
import {
  installFkeMarkBlockNoteSerializer,
  parseBlockNoteDocument,
  splitBlockNoteFrontMatter,
  type AnyBlockNoteEditor,
} from './blockNoteMarkdown'
import { promoteMermaidCodeBlocks } from './mermaidBlock'
import { promoteExcalidrawCodeBlocks } from './excalidrawBlock'
import { setExcalidrawDocDir } from './excalidrawSession'
import { extractHeadingCollapseMarkers, headingIdsAtIndexes, setSessionCollapsedHeadingIds } from '../../utils/markdown/headingCollapse'
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
  tabId?: string
  filePath: string | null | undefined
  largeDocument: boolean
  onChange: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
  onOutlineChange?: (sourceContent: string, items: TocItemData[]) => void
  spellCheckEnabled: boolean
}

export function useBlockNoteEditorController(options: BlockNoteEditorControllerOptions) {
  const {
    content, docDir, editorMode, editorModeRef, filePath, tabId, largeDocument,
    onChange, onDirty, onLineCountChange, onOutlineChange, spellCheckEnabled,
  } = options
  const docDirRef = useRef<string | null>(docDir)
  docDirRef.current = docDir
  setExcalidrawDocDir(docDir)
  const originalContentRef = useRef(content)
  const hasUserEditedRef = useRef(false)
  const editorDocumentRef = useRef<EditorDocumentSnapshot>({ content, docDir, revision: 0 })
  const suppressChangeRef = useRef(false)
  const promotingMermaidRef = useRef(false)
  const composingRef = useRef(false)

  const pendingCompositionChangeRef = useRef(false)
  const applySequenceRef = useRef(0)
  const suppressApplyIdRef = useRef(0)
  const [appliedTarget, setAppliedTarget] = useState<{ content: string; docDir: string | null; key: string } | null>(null)
  const appliedTargetRef = useRef(appliedTarget)
  const [failedTarget, setFailedTarget] = useState<{ key: string; content: string; docDir: string | null; detail: string } | null>(null)
  const targetKey = tabId ?? filePath ?? '__untitled__'
  const documentReady = appliedTarget?.key === targetKey && appliedTarget.docDir === docDir && (
    appliedTarget.content === content || (hasUserEditedRef.current && editorDocumentRef.current.content === content)
  )
  const documentError = failedTarget?.key === targetKey && failedTarget.content === content && failedTarget.docDir === docDir
    ? failedTarget.detail : null
  const onOutlineChangeRef = useRef(onOutlineChange)
  onOutlineChangeRef.current = onOutlineChange

  const blockNoteEditor = useCreateBlockNote({
    animations: false,
    defaultStyles: false,
    disableExtensions: ['previousBlockType'],
    domAttributes: {
      editor: {
        class: `editor-inner${largeDocument ? ' editor-inner--large-document' : ''}`,
        spellcheck: String(spellCheckEnabled && !largeDocument),
      },
    },
    extensions: [markdownMarkerExtension, aiGhostTextExtension],
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


  const syncEditorDomAttributes = useCallback(() => {
    const dom = blockNoteEditor.domElement
    if (!dom) return
    dom.classList.add('editor-inner')
    dom.classList.toggle('editor-inner--large-document', largeDocument)
    dom.setAttribute('spellcheck', String(spellCheckEnabled && !largeDocument))
  }, [blockNoteEditor, largeDocument, spellCheckEnabled])

  useLayoutEffect(() => {
    // BlockNoteView 的 editable 属性变化会重新挂载视图。只更新已挂载编辑器的可编辑状态。
    const editable = documentReady && editorMode === EditorModeEnum.Live
    if (blockNoteEditor.isEditable !== editable) blockNoteEditor._tiptapEditor.setEditable(editable, false)
    syncEditorDomAttributes()
  }, [blockNoteEditor, documentReady, editorMode, syncEditorDomAttributes])

  useEffect(() => {
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(syncEditorDomAttributes)
      : null
    return () => {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    }
  }, [syncEditorDomAttributes])


  useEffect(() => {
    if (editorMode === EditorModeEnum.Source || editorMode === EditorModeEnum.Split) return
    const key = targetKey
    const applied = appliedTargetRef.current
    if (applied?.key === key && applied.content === content && applied.docDir === docDir) return

    const synced = editorDocumentRef.current
    // 已灌入的文档若只改了路径（重命名），不要重灌，否则块 id 失效、无法删除。
    const sameDocument = applied?.key === key || !tabId
    const sameApplied = Boolean(sameDocument && applied && applied.content === content && applied.docDir === docDir)
    const sameDirty = Boolean(sameDocument && applied && hasUserEditedRef.current && content === synced.content && docDir === synced.docDir)
    if (sameApplied || sameDirty) {
      originalContentRef.current = content
      appliedTargetRef.current = { content, docDir, key }
      setAppliedTarget(appliedTargetRef.current)
      cacheBlockNoteDocument(key, content, blockNoteEditor.document)
      return
    }

    const sequence = ++applySequenceRef.current
    pendingCompositionChangeRef.current = false
    composingRef.current = false
    setFailedTarget(null)
    const sourceLines = content ? content.split(/\r?\n/u).length : 1
    cancelPendingChange()
    originalContentRef.current = content
    hasUserEditedRef.current = false
    editorDocumentRef.current = { content, docDir, revision: synced.revision + 1 }

    void (async () => {
      try {
        const cached = readCachedBlockNoteDocument(key, content)
        const blocks = cached ?? (await parseBlockNoteDocument(blockNoteEditor, content)).blocks
        if (sequence !== applySequenceRef.current) return
        const suppressApplyId = ++suppressApplyIdRef.current
        const applyDocument = applyBlockNoteDocument({
          blocks,
          editor: blockNoteEditor,
          ownsSuppression: () => suppressApplyId === suppressApplyIdRef.current,
          shouldAbort: () => sequence !== applySequenceRef.current,
          sourceCharacters: content.length,
          sourceLines,
          suppressChangeRef,
        })
        syncEditorDomAttributes()
        const appliedSuccessfully = await applyDocument
        if (!appliedSuccessfully || sequence !== applySequenceRef.current) return
        cacheBlockNoteDocument(key, content, blockNoteEditor.document)
        appliedTargetRef.current = { content, docDir, key }
        setAppliedTarget(appliedTargetRef.current)
        onOutlineChangeRef.current?.(content, extractTocItemsFromBlocks(blockNoteEditor.document))
        const { body } = splitBlockNoteFrontMatter(content)
        const { collapsedIndexes } = extractHeadingCollapseMarkers(body)
        setSessionCollapsedHeadingIds(headingIdsAtIndexes(blockNoteEditor.document, collapsedIndexes))
        syncEditorDomAttributes()
        onLineCountChange?.(sourceLines)
      } catch (error) {
        if (sequence !== applySequenceRef.current) return
        setFailedTarget({ key, content, docDir, detail: String(error) })
        console.error('[editor] BlockNote document apply failed', {
          error,
          filePath: key,
          sourceCharacters: content.length,
        })
        suppressChangeRef.current = false
        blockNoteEditor.isEditable = false
        syncEditorDomAttributes()
      }
    })()

    return () => { applySequenceRef.current += 1 }
  }, [
    blockNoteEditor, cancelPendingChange, content, docDir, editorMode,
    tabId, targetKey, onLineCountChange, syncEditorDomAttributes,
  ])

  const handleBlockNoteChange = useCallback((editor: AnyBlockNoteEditor) => {
    if (suppressChangeRef.current || promotingMermaidRef.current) return
    if (composingRef.current) {
      pendingCompositionChangeRef.current = true
      return
    }
    promotingMermaidRef.current = true
    try {
      promoteExcalidrawCodeBlocks(editor)
      promoteMermaidCodeBlocks(editor)
    } finally {
      promotingMermaidRef.current = false
    }
    handleEditorChange(editor)
  }, [handleEditorChange])


  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    if (!pendingCompositionChangeRef.current) return
    pendingCompositionChangeRef.current = false
    const sequence = applySequenceRef.current
    Promise.resolve().then(() => {
      if (sequence === applySequenceRef.current) handleEditorChange(blockNoteEditor)
    })
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
    documentReady,
    documentError,
    blockNoteEditor,
    editor: blockNoteEditor._tiptapEditor,
    editorDocumentRef,
    getContentDeferred,
    getCurrentContent,
    handleBlockNoteChange,
    handleCompositionEnd,
    handleCompositionStart,
  }
}
