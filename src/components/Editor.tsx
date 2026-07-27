import { getLanguageId } from '@blocknote/core'
import type { Editor as TiptapEditor } from '@tiptap/react'
import '@blocknote/mantine/style.css'
import {
  forwardRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { EditorModeEnum } from '../types'
import type { AiAssistantAction, AppSettings, EditorMode, FileTreeNode } from '../types'
import type { SlashCommand } from './SlashMenu'
import { useI18n } from '../i18n'
import { resolveKeymap } from '../utils/keymap'
import { openExternalUrl } from '../utils/updater'
import { useClampedPopupPosition } from '../utils/popupPosition'

import { getWikiTargetFromHref } from '../utils/markdown/wikiLinks'
import { EditorLayout } from './editor/EditorLayout'
import { useEditorSplitMode } from './editor/useEditorSplitMode'
import { useEditorImageUploads } from './editor/useEditorImageUploads'
import {
  useEditorContextMenu,
  type ImageContextTarget,
  type TableContextTarget,
} from './editor/useEditorContextMenu'
import { useEditorPopupDismissals } from './editor/useEditorPopupDismissals'
import { useDeferredMarkdownPreview } from './editor/useDeferredMarkdownPreview'
import type { EditorSerializationReason } from './editor/useEditorMarkdownPipeline'
import { useEditorPerformanceDiagnostics } from './editor/useEditorPerformanceDiagnostics'
import { fkeMarkCodeBlockOptions } from './editor/blockNoteSchema'
import { useBlockNoteEditorController } from './editor/useBlockNoteEditorController'
import type { AnyBlockNoteEditor } from './editor/blockNoteMarkdown'
import { useEditorAiAssistant } from './editor/useEditorAiAssistant'
import { useSlashMenuTrigger } from './editor/useSlashMenuTrigger'
import { useWikiLinkPicker } from './editor/useWikiLinkPicker'
import { isPerformanceSensitiveDocument } from '../utils/performance'

export interface EditorHandle {
  insertImageMarkdown: (url: string, alt?: string) => void
  /** Upload an image from a local path. */
  insertImageUploadFromPath: (srcPath: string) => void
  /** Upload an image from an in-memory Blob. */
  insertImageUploadFromBlob: (file: File) => void
  focusEditor: () => void
  getEditor: () => AnyBlockNoteEditor | null
  /** Return the current Markdown snapshot. */
  getContent: () => string
  getContentDeferred: (signal?: AbortSignal, reason?: EditorSerializationReason) => Promise<string>
  runAiAction: (action: AiAssistantAction) => void
}

interface EditorProps {
  content: string
  onChange: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
  settings: AppSettings
  systemDark?: boolean
  editorMode: EditorMode
  onEditorModeChange: (mode: EditorMode) => void
  onSlashCommand?: (cmd: string) => void
  scrollRef?: RefObject<HTMLDivElement | null>
  onToggleMinimap?: () => void
  findReplaceVisible: boolean
  findReplaceMode: 'find' | 'replace'
  onFindReplaceClose: () => void
  onFindReplaceModeChange: (mode: 'find' | 'replace') => void
  onOpenWikiLink?: (target: string) => void
  onAddAiContext?: (text: string) => void
  hideAiSelectionButton?: boolean
  filePath?: string | null
  fileTree?: FileTreeNode[]
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { content, onChange, onDirty, onLineCountChange, settings, systemDark = false, editorMode, onEditorModeChange: _onEditorModeChange, onSlashCommand, scrollRef, onToggleMinimap: _onToggleMinimap,
    findReplaceVisible, findReplaceMode, onFindReplaceClose, onFindReplaceModeChange, onOpenWikiLink, onAddAiContext, hideAiSelectionButton, filePath, fileTree = [] },
  ref
) {
  const { t, language } = useI18n()
  const largeDocument = isPerformanceSensitiveDocument(content)
  
  const [tableCtxMenu, setTableCtxMenu] = useState<TableContextTarget | null>(null)
  const [slashState, setSlashState] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  })
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; text: string; editing: boolean }>({
    open: false, url: '', text: '', editing: false,
  })
  const [imageCtxMenu, setImageCtxMenu] = useState<ImageContextTarget | null>(null)
  const [imageSizeDialog, setImageSizeDialog] = useState<{
    blockId: string
    width: string
    originalWidth: number | null
  } | null>(null)
  const [imageEditPopup, setImageEditPopup] = useState<{
    x: number
    y: number
    blockId: string
    src: string
    alt: string
  } | null>(null)
  const [syntaxHint, setSyntaxHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const [codeBlockLang, setCodeBlockLang] = useState<{ blockId: string; language: string; x: number; y: number } | null>(null)
  const [searchMatches, setSearchMatches] = useState<Array<{ index: number; length: number }>>([])
  const [searchCurrentIdx, setSearchCurrentIdx] = useState(-1)
  const [textareaScrollTop, setTextareaScrollTop] = useState(0)
  const [tablePicker, setTablePicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  const [olPicker, setOlPicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  const [headingPickerOpen, setHeadingPickerOpen] = useState(false)

  const editorRef = useRef<TiptapEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const linkRangeRef = useRef<{ from: number; to: number } | null>(null)
  const imageEditPopupRef = useClampedPopupPosition<HTMLDivElement>(
    imageEditPopup?.x ?? 0,
    imageEditPopup?.y ?? 0,
    { enabled: Boolean(imageEditPopup), containerRef, centerX: true },
  )
  function closeEditorOverlays() {
    linkRangeRef.current = null
    setTableCtxMenu(null)
    setSlashState((state) => state.open ? { ...state, open: false } : state)
    setLinkDialog((state) => state.open
      ? { open: false, url: '', text: '', editing: false }
      : state)
    setImageCtxMenu(null)
    setImageSizeDialog(null)
    setImageEditPopup(null)
    setSyntaxHint(null)
    setCodeBlockLang(null)
    setTablePicker((state) => state.open ? { ...state, open: false } : state)
    setOlPicker((state) => state.open ? { ...state, open: false } : state)
    setHeadingPickerOpen(false)
    wikiLinkPicker.close()
  }

  const filePathRef = useRef<string | null>(filePath ?? null)
  filePathRef.current = filePath ?? null
  const docDir = filePath ? filePath.replace(/[\\/][^\\/]+$/, '') : null
  const docDirRef = useRef<string | null>(docDir)
  docDirRef.current = docDir
  const keymapRef = useRef<Record<string, string>>(resolveKeymap(settings.keymap))
  useEffect(() => { keymapRef.current = resolveKeymap(settings.keymap) }, [settings.keymap])

  const {
    textareaRef,
    splitRef,
    previewScrollRef,
    editorModeRef,
    splitRatio,
    startSplitDrag,
    handleSplitScroll,
  } = useEditorSplitMode(editorMode)

  const {
    blockNoteEditor,
    editor,
    editorDocumentRef,
    getContentDeferred,
    getCurrentContent,
    handleBlockNoteChange,
    handleCompositionEnd,
    handleCompositionStart,
  } = useBlockNoteEditorController({
    content,
    docDir,
    editorMode,
    editorModeRef,
    filePath,
    largeDocument,
    onChange,
    onDirty,
    onLineCountChange,
    spellCheckEnabled: settings.spellCheckEnabled,
  })
  const blockNoteEditorRef = useRef<AnyBlockNoteEditor | null>(blockNoteEditor)
  blockNoteEditorRef.current = blockNoteEditor
  editorRef.current = editor
  const {
    handlePasteImage,
    handleDropImage,
    insertImageUploadFromPath,
    insertImageUploadFromBlob,
  } = useEditorImageUploads({ editorRef: blockNoteEditorRef, filePathRef, settings, t })
  useEditorPerformanceDiagnostics(editor, editorModeRef, editorDocumentRef, largeDocument)

  const wikiLinkPicker = useWikiLinkPicker({
    editor, editorMode, content, fileTree, currentFile: filePath, textareaRef, onChange,
    onBeforeOpen: closeEditorOverlays,
  })
  useSlashMenuTrigger(editor, setSlashState, closeEditorOverlays)

  const { previewHtml } = useDeferredMarkdownPreview({
    content,
    docDir,
    enabled: editorMode === EditorModeEnum.Split,
  })

  const aiAssistant = useEditorAiAssistant({
    editor,
    content,
    onChange,
    settings,
    editorMode,
    textareaRef,
    docDirRef,
    t,
    language,
    closeEditorOverlays,
  })

  // BlockNote image insertion
  const insertImageMarkdown = useCallback((url: string, alt?: string) => {
    const image = { type: 'image', props: { url, name: alt || '', caption: '' } }
    const reference = blockNoteEditor.getTextCursorPosition().block
    blockNoteEditor.insertBlocks([image] as never[], reference, 'after')
    blockNoteEditor.focus()
  }, [blockNoteEditor])

  useImperativeHandle(ref, () => ({
    insertImageMarkdown,
    insertImageUploadFromPath,
    insertImageUploadFromBlob,
    runAiAction: aiAssistant.runAction,
    focusEditor: () => blockNoteEditor.focus(),
    getEditor: () => blockNoteEditor,
    getContent: getCurrentContent,
    getContentDeferred,
  }), [
    aiAssistant.runAction, blockNoteEditor, getContentDeferred, getCurrentContent,
    insertImageMarkdown, insertImageUploadFromBlob, insertImageUploadFromPath,
  ])
  useEffect(() => {
    if (!editor || editorMode !== EditorModeEnum.Live) { setSyntaxHint(null); return }
    const handler = () => {
      const { selection, doc } = editor.state
      if (!selection.empty) { setSyntaxHint(null); return }
      const $from = doc.resolve(selection.from)
      if ($from.parentOffset !== 0) { setSyntaxHint(null); return }
      const parts: string[] = []
      const block = $from.parent
      if (block.type.name === 'heading') {
        parts.push('#'.repeat(block.attrs.level) + ' ')
      } else if (block.type.name === 'blockquote') {
        parts.push('> ')
      } else if (block.type.name === 'codeBlock') {
        parts.push('```')
      }
      let depth = $from.depth
      while (depth > 0) {
        const ancestor = $from.node(depth)
        if (ancestor.type.name === 'listItem') {
          const listType = $from.node(depth - 1).type.name
          if (listType === 'bulletList') {
            parts.push('- ')
          } else if (listType === 'orderedList') {
            parts.push(`${$from.index(depth - 1) + 1}. `)
          }
        } else if (ancestor.type.name === 'taskItem') {
          parts.push(ancestor.attrs.checked ? '- [x] ' : '- [ ] ')
        }
        depth--
      }
      const marks = $from.marks()
      if (marks.some((m) => m.type.name === 'bold')) parts.push('**')
      if (marks.some((m) => m.type.name === 'italic')) parts.push('*')
      if (marks.some((m) => m.type.name === 'strike')) parts.push('~~')
      if (marks.some((m) => m.type.name === 'code')) parts.push('`')

      const text = parts.join('').trim()
      if (!text) { setSyntaxHint(null); return }
      try {
        const coords = editor.view.coordsAtPos(selection.from)
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = Math.max(4, coords.left - rect.left - 4)
        const y = Math.max(4, coords.top - rect.top - 22)
        setSyntaxHint({ text, x, y })
      } catch { /* ignore */ }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, editorMode])

  useEffect(() => {
    if (!editor) { setCodeBlockLang(null); return }
    const handler = () => {
      try {
        const block = blockNoteEditor.getTextCursorPosition().block
        if (block.type !== 'codeBlock') { setCodeBlockLang(null); return }
        const blockElement = Array.from(
          blockNoteEditor.domElement?.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]') || [],
        ).find((element) => element.dataset.id === block.id)
        const blockRect = blockElement?.getBoundingClientRect()
        const containerRect = containerRef.current?.getBoundingClientRect()
        if (!blockRect || !containerRect) return
        setCodeBlockLang({
          blockId: block.id,
          language: typeof block.props.language === 'string' ? block.props.language : 'text',
          x: blockRect.right - containerRect.left - 120,
          y: blockRect.top - containerRect.top + 6,
        })
      } catch {
        setCodeBlockLang(null)
      }
    }
    handler()
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [blockNoteEditor, editor])

  useEffect(() => {
    if (!editor) return
    const el = scrollRef?.current || containerRef.current?.querySelector('.editor-scroll')
    if (!el) return
    const onScroll = () => setCodeBlockLang(null)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [editor, editorMode, scrollRef])

  function closeLinkDialog() {
    linkRangeRef.current = null
    setLinkDialog({ open: false, url: '', text: '', editing: false })
  }

  function openLinkDialog(prefill?: { url?: string; text?: string }) {
    closeEditorOverlays()
    const selectedText = blockNoteEditor.getSelectedText()
    const activeHref = blockNoteEditor.getSelectedLinkUrl()
    setLinkDialog({
      open: true,
      url: prefill?.url ?? activeHref ?? '',
      text: prefill?.text ?? selectedText,
      editing: Boolean(activeHref),
    })
  }

  function jumpToFootnote(link: HTMLAnchorElement, scope: HTMLElement): boolean {
    if (!link.hasAttribute('data-footnote-ref') && !link.hasAttribute('data-footnote-backref')) return false
    const href = link.getAttribute('href') || ''
    if (!href.startsWith('#')) return true
    const targetId = href.slice(1)
    const destination = Array.from(scope.querySelectorAll<HTMLElement>('[id]'))
      .find((element) => element.id === targetId)
    destination?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return true
  }

  function handlePreviewLinkClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    const link = target.closest('a[href]') as HTMLAnchorElement | null
    if (!link) return
    event.preventDefault()
    event.stopPropagation()
    if (jumpToFootnote(link, event.currentTarget)) return
    const href = link.getAttribute('href') || ''
    const wikiTarget = getWikiTargetFromHref(href)
    if (wikiTarget) return onOpenWikiLink?.(wikiTarget)
    if (href) void openExternalUrl(href)
  }
  function openExistingLinkDialog(_from: number, _to: number, url: string, text: string) {
    openLinkDialog({ url, text })
  }

  function applyLink() {
    const url = linkDialog.url.trim()
    if (!url) { closeLinkDialog(); return }
    const display = linkDialog.text.trim() || blockNoteEditor.getSelectedText() || url
    blockNoteEditor.focus()
    blockNoteEditor.createLink(url, display)
    closeLinkDialog()
  }

  function applyImageEdit() {
    if (!imageEditPopup) return
    const block = blockNoteEditor.getBlock(imageEditPopup.blockId)
    if (block?.type === 'image') {
      blockNoteEditor.updateBlock(block, {
        props: { url: imageEditPopup.src.trim(), name: imageEditPopup.alt.trim() },
      } as never)
    }
    setImageEditPopup(null)
  }


  function currentBlock() {
    try {
      return blockNoteEditor.getTextCursorPosition().block
    } catch {
      return blockNoteEditor.document[blockNoteEditor.document.length - 1]
    }
  }

  function updateCurrentBlock(type: string, props?: Record<string, unknown>) {
    const block = currentBlock()
    if (!block) return
    blockNoteEditor.updateBlock(block, { type, ...(props ? { props } : {}) } as never)
    blockNoteEditor.focus()
  }

  function insertBlockAfterCurrent(block: Record<string, unknown>) {
    const reference = currentBlock()
    if (!reference) return
    blockNoteEditor.insertBlocks([block] as never[], reference, 'after')
    blockNoteEditor.focus()
  }

  // BlockNote does not expose HTML-based mark commands, so apply supported inline styles directly.
  function insertInlineMark(markName: string, placeholder: string) {
    blockNoteEditor.focus()
    if (blockNoteEditor.getSelectedText()) {
      blockNoteEditor.toggleStyles({ [markName]: true } as never)
      return
    }
    blockNoteEditor.insertInlineContent([{
      type: 'text',
      text: placeholder,
      styles: { [markName]: true },
    }] as never, { updateSelection: true })
  }

  const applySlashCommand = useCallback((cmd: SlashCommand) => {
    const tiptap = blockNoteEditor._tiptapEditor as unknown as TiptapEditor
    const { selection } = tiptap.state
    const $from = selection.$from
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
    const slashIdx = textBefore.lastIndexOf('/')
    if (slashIdx >= 0) {
      const from = $from.start() + slashIdx
      tiptap.commands.deleteRange({ from, to: selection.from })
    }
    switch (cmd.id) {
      case 'h1': updateCurrentBlock('heading', { level: 1 }); break
      case 'h2': updateCurrentBlock('heading', { level: 2 }); break
      case 'h3': updateCurrentBlock('heading', { level: 3 }); break
      case 'h4': updateCurrentBlock('heading', { level: 4 }); break
      case 'bold': insertInlineMark('bold', t('editor.placeholder.bold')); break
      case 'italic': insertInlineMark('italic', t('editor.placeholder.italic')); break
      case 'strike': insertInlineMark('strike', t('editor.placeholder.strike')); break
      case 'quote': updateCurrentBlock('quote'); break
      case 'ul': updateCurrentBlock('bulletListItem'); break
      case 'ol': updateCurrentBlock('numberedListItem'); break
      case 'todo': updateCurrentBlock('checkListItem', { checked: false }); break
      case 'code': insertInlineMark('code', t('editor.placeholder.code')); break
      case 'codeblock': updateCurrentBlock('codeBlock', { language: 'text' }); break
      case 'table': insertTable(3, 3); break
      case 'hr': insertBlockAfterCurrent({ type: 'divider' }); break
      case 'image': openImagePicker(); break
      case 'link': openLinkDialog(); break
      case 'wikilink': wikiLinkPicker.openFromEditor(); break
      // Math nodes are not part of the default BlockNote schema; preserve them as Markdown text.
      case 'mathblock': blockNoteEditor.insertInlineContent('$$\nE = mc^2\n$$'); break
      case 'mathinline': blockNoteEditor.insertInlineContent('$a^2 + b^2 = c^2$'); break
    }
    setSlashState((state) => ({ ...state, open: false }))
  }, [blockNoteEditor, t, wikiLinkPicker.openFromEditor])

  function insertTable(rows: number, cols: number) {
    insertBlockAfterCurrent({
      type: 'table',
      content: {
        type: 'tableContent',
        headerRows: 1,
        rows: Array.from({ length: rows }, () => ({
          cells: Array.from({ length: cols }, () => ''),
        })),
      },
    })
  }

  function openTablePicker(e: React.MouseEvent) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    closeEditorOverlays()
    setTablePicker({ open: true, x: rect.left, y: rect.bottom + 4 })
  }

  function toggleOlPicker(e: React.MouseEvent) {
    e.preventDefault()
    if (olPicker.open) {
      closeEditorOverlays()
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      closeEditorOverlays()
      setOlPicker({ open: true, x: rect.left, y: rect.bottom + 4 })
    }
  }

  function applyOlStyle(_style: string) {
    updateCurrentBlock('numberedListItem')
    setOlPicker((state) => ({ ...state, open: false }))
  }

  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement
    const lhMap = { compact: '1.5', normal: '1.8', relaxed: '2.2' }
    el.style.lineHeight = lhMap[settings.lineHeight] || '1.8'
    const ewMap = { narrow: '680px', medium: '800px', wide: '960px' }
    document.documentElement.style.setProperty('--editor-max-w', ewMap[settings.editorWidth] || '800px')
    if (settings.showMarkers) document.body.classList.remove('hide-markers')
    else document.body.classList.add('hide-markers')
  }, [editor, settings.lineHeight, settings.editorWidth, settings.showMarkers])

  useEffect(() => {
    if (!editor || editorMode !== EditorModeEnum.Live) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      const target = e.target
      const targetIsEditor = target instanceof HTMLElement && editor.view.dom.contains(target)
      const activeElement = document.activeElement
      const activeIsEditor = activeElement instanceof HTMLElement && editor.view.dom.contains(activeElement)
      if (!editor.isFocused && !targetIsEditor && !activeIsEditor) return
      if (target instanceof HTMLElement && !targetIsEditor) return
      const { selection } = editor.state
      if (!selection.empty || selection.$from.parent.type.spec.code) return
      const $from = selection.$from
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
      const textAfter = $from.parent.textContent.slice($from.parentOffset)
      const match = textBefore.match(/^```([^`\s]*)$/)
      if (!match || (textAfter && !/^```\s*$/.test(textAfter))) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      const languageName = match[1].trim()
      const language = languageName
        ? getLanguageId(fkeMarkCodeBlockOptions, languageName) ?? languageName
        : 'text'
      const blockStart = $from.start()
      editor
        .chain()
        .focus()
        .deleteRange({ from: blockStart, to: blockStart + $from.parent.textContent.length })
        .run()
      const block = blockNoteEditor.getTextCursorPosition().block
      blockNoteEditor.updateBlock(block, { type: 'codeBlock', props: { language } } as never)
      blockNoteEditor.focus()
      setTimeout(() => {
        try {
          const block = blockNoteEditor.getTextCursorPosition().block
          if (block?.type === 'codeBlock') blockNoteEditor.setTextCursorPosition(block, 'start')
        } catch { /* Ignore stale cursor state. */ }
      }, 0)
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [blockNoteEditor, editor, editorMode])

  useEffect(() => {
    if (!editor || !settings.autoBracket) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!editor.isFocused) return
      const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
      const closing = pairs[e.key]
      if (closing) {
        e.preventDefault()
        editor.commands.insertContent(`${e.key}${closing}`)
        editor.commands.focus()
        setTimeout(() => {
          const { from } = editor.state.selection
          editor.commands.setTextSelection(from - 1)
        }, 0)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editor, settings.autoBracket])

  const execCmd = useCallback((cmd: string) => {
    switch (cmd) {
      case 'h1': updateCurrentBlock('heading', { level: 1 }); break
      case 'h2': updateCurrentBlock('heading', { level: 2 }); break
      case 'h3': updateCurrentBlock('heading', { level: 3 }); break
      case 'h4': updateCurrentBlock('heading', { level: 4 }); break
      case 'h5': updateCurrentBlock('heading', { level: 5 }); break
      case 'h6': updateCurrentBlock('heading', { level: 6 }); break
      case 'paragraph': updateCurrentBlock('paragraph'); break
      case 'bold': insertInlineMark('bold', t('editor.placeholder.bold')); break
      case 'italic': insertInlineMark('italic', t('editor.placeholder.italic')); break
      case 'strike': insertInlineMark('strike', t('editor.placeholder.strike')); break
      case 'code': insertInlineMark('code', t('editor.placeholder.code')); break
      case 'quote': updateCurrentBlock('quote'); break
      case 'list': updateCurrentBlock('bulletListItem'); break
      case 'ol': updateCurrentBlock('numberedListItem'); break
      case 'todo': updateCurrentBlock('checkListItem', { checked: false }); break
      case 'hr': insertBlockAfterCurrent({ type: 'divider' }); break
      case 'link': openLinkDialog(); break
      case 'wikilink': wikiLinkPicker.openFromEditor(); break
      case 'image': openImagePicker(); break
      case 'table': {
        const rect = blockNoteEditor.domElement?.getBoundingClientRect()
        closeEditorOverlays()
        setTablePicker({ open: true, x: (rect?.left ?? 0) + 40, y: (rect?.top ?? 0) + 40 })
        break
      }
      case 'codeblock': updateCurrentBlock('codeBlock', { language: 'text' }); break
      case 'slash': onSlashCommand?.('slash'); break
    }
  }, [blockNoteEditor, onSlashCommand, t, wikiLinkPicker.openFromEditor])

  function openImagePicker() {
    if (!editor) return
    closeEditorOverlays()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) insertImageUploadFromBlob(file)
    }
    input.click()
  }

  const {
    onScrollContextMenu,
    applyTableContextAction,
    setImagePreviewWidth,
    removeImage,
  } = useEditorContextMenu({
    blockNoteEditor,
    closeEditorOverlays,
    setImageCtxMenu,
    setTableCtxMenu,
  })
  useEditorPopupDismissals({
    containerRef,
    imageCtxMenu,
    tableCtxMenu,
    slashOpen: slashState.open,
    tablePickerOpen: tablePicker.open,
    olPickerOpen: olPicker.open,
    headingPickerOpen,
    setImageCtxMenu,
    setTableCtxMenu,
    setSlashState,
    setTablePicker,
    setOlPicker,
    setHeadingPickerOpen,
  })

  if (!editor) {
    return (
      <div className="editor-area">
        <div className="welcome-screen">
          <div className="welcome-tagline" style={{ fontSize: 14 }}>{t('editor.loading')}</div>
        </div>
      </div>
    )
  }

  const isReadMode = editorMode === EditorModeEnum.Read
  const isSourceMode = editorMode === EditorModeEnum.Source
  const isSplitMode = editorMode === EditorModeEnum.Split
  const hasEditorOverlay = slashState.open || wikiLinkPicker.state.open || tablePicker.open || olPicker.open || headingPickerOpen
    || linkDialog.open || tableCtxMenu !== null || imageCtxMenu !== null
    || imageSizeDialog !== null || imageEditPopup !== null || aiAssistant.panelOpen
  const minimapOnLeft = settings.showMinimap && settings.minimapSide === 'left'
  const minimapOnRight = settings.showMinimap && settings.minimapSide === 'right'
  const showToolbar = !isReadMode && !isSourceMode && !isSplitMode
  const toolbarPosition = settings.toolbarPosition ?? 'top'
  const toolbarLayoutClass = showToolbar
    ? `toolbar-${settings.toolbarFloating ? 'floating' : 'docked'} toolbar-${toolbarPosition}`
    : ''

  return (
    <EditorLayout
      {...{
      aiAssistant, applyImageEdit, applyLink, applyOlStyle, applyTableContextAction, blockNoteEditor,
      applySlashCommand, closeEditorOverlays, closeLinkDialog, codeBlockLang,
      containerRef, content, docDirRef, editor, filePath, getCurrentContent,
      editorMode, execCmd, findReplaceMode, findReplaceVisible, handleBlockNoteChange,
      handleCompositionEnd, handleCompositionStart, handleDropImage, handlePasteImage,
      handlePreviewLinkClick, handleSplitScroll, hasEditorOverlay, headingPickerOpen,
      imageCtxMenu, imageEditPopup, imageEditPopupRef, imageSizeDialog,
      insertTable, isReadMode, isSourceMode, isSplitMode, largeDocument,
      jumpToFootnote, linkDialog, minimapOnLeft, minimapOnRight,
      olPicker, onAddAiContext, onChange, onFindReplaceClose, onFindReplaceModeChange, onOpenWikiLink, hideAiSelectionButton,
      onScrollContextMenu, openExistingLinkDialog, openTablePicker, previewHtml, removeImage,
      previewScrollRef, scrollRef, searchCurrentIdx, searchMatches,
      setCodeBlockLang, setHeadingPickerOpen, setImageCtxMenu, setImageEditPopup,
      setImagePreviewWidth, setImageSizeDialog, setLinkDialog, setOlPicker, setSearchCurrentIdx,
      setSearchMatches, setSlashState, setTableCtxMenu, setTablePicker,
      setTextareaScrollTop, settings, showToolbar, slashState, wikiLinkPicker,
      language, systemDark,
      splitRatio, splitRef, startSplitDrag, syntaxHint,
      t, tableCtxMenu, tablePicker, textareaRef,
      textareaScrollTop, toggleOlPicker, toolbarLayoutClass, toolbarPosition,
      }}
    />
  )
})
