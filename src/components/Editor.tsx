import { useEditor, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './plugins/ResizableImage'
import TextStyle from '@tiptap/extension-text-style'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import {
  forwardRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { AiAssistantAction, AppSettings, EditorMode, FileTreeNode } from '../types'
import { TyporaRender } from './plugins/TyporaRender'
import { MathInline, MathBlock } from './extensions/MathNode'
import { ImageUpload } from './extensions/ImageUploadNode'
import { FootnoteMetadata } from './extensions/FootnoteMetadata'
import { DocumentTag } from './extensions/DocumentTag'
import type { SlashCommand } from './SlashMenu'
import { useI18n } from '../i18n'
import { resolveKeymap } from '../utils/keymap'
import { openExternalUrl } from '../utils/updater'
import { lowlight } from '../lib/lowlight'
import { useClampedPopupPosition } from '../utils/popupPosition'

// 导入拆分出的模块
import { markdownToHtml } from '../utils/markdown/engine'
import { getWikiTargetFromHref } from '../utils/markdown/wikiLinks'
import { EditorLayout } from './editor/EditorLayout'
import { useEditorSplitMode } from './editor/useEditorSplitMode'
import { useEditorImageUploads } from './editor/useEditorImageUploads'
import { handleEditorShortcut } from './editor/editorShortcuts'
import { useEditorContextMenu } from './editor/useEditorContextMenu'
import { useEditorPopupDismissals } from './editor/useEditorPopupDismissals'
import { useDeferredMarkdownPreview } from './editor/useDeferredMarkdownPreview'
import { useDeferredEditorChange } from './editor/useDeferredEditorChange'
import { useEditorAiAssistant } from './editor/useEditorAiAssistant'
import { useSlashMenuTrigger } from './editor/useSlashMenuTrigger'
import { useWikiLinkPicker } from './editor/useWikiLinkPicker'

import { StyledOrderedList, CustomBulletList, CustomTable, MarkdownCodeBlock } from './editor/editorExtensions'
export interface EditorHandle {
  insertImageMarkdown: (url: string, alt?: string) => void
  /** 从磁盘路径上传图片（拖拽到窗口）：占位 + 真实上传进度 */
  insertImageUploadFromPath: (srcPath: string) => void
  /** 从内存 Blob 上传图片（粘贴 / 编辑器内拖入）：占位 + 快速落盘 */
  insertImageUploadFromBlob: (file: File) => void
  focusEditor: () => void
  getEditor: () => TiptapEditor | null
  /** 获取当前 Markdown 内容（优先返回原始内容，避免往返转换损失） */
  getContent: () => string
  runAiAction: (action: AiAssistantAction) => void
}

interface EditorProps {
  content: string
  onChange: (content: string) => void
  onDirty?: () => void
  settings: AppSettings
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
  { content, onChange, onDirty, settings, editorMode, onEditorModeChange: _onEditorModeChange, onSlashCommand, scrollRef, onToggleMinimap: _onToggleMinimap,
    findReplaceVisible, findReplaceMode, onFindReplaceClose, onFindReplaceModeChange, onOpenWikiLink, onAddAiContext, hideAiSelectionButton, filePath, fileTree = [] },
  ref
) {
  const { t, language } = useI18n()
  
  // ── 状态管理 ──
  const [tableCtxMenu, setTableCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [slashState, setSlashState] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  })
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; text: string; editing: boolean }>({
    open: false, url: '', text: '', editing: false,
  })
  // 图片右键菜单
  const [imageCtxMenu, setImageCtxMenu] = useState<{
    x: number; y: number; pos: number;
    width: number | null; height: number | null;
    widthUnit: string; heightUnit: string; src: string
  } | null>(null)
  // 图片尺寸调整弹窗
  const [imageSizeDialog, setImageSizeDialog] = useState<{
    pos: number; width: string; height: string; widthUnit: string; heightUnit: string
  } | null>(null)
  // 图片单击编辑弹窗（src + alt）
  const [imageEditPopup, setImageEditPopup] = useState<{
    x: number; y: number; pos: number; src: string; alt: string
  } | null>(null)
  // 浮动语法提示（焦点左上方）
  const [syntaxHint, setSyntaxHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const [codeBlockLang, setCodeBlockLang] = useState<{ pos: number; language: string; x: number; y: number } | null>(null)
  // 源码/分栏模式搜索高亮状态
  const [searchMatches, setSearchMatches] = useState<Array<{ index: number; length: number }>>([])
  const [searchCurrentIdx, setSearchCurrentIdx] = useState(-1)
  const [textareaScrollTop, setTextareaScrollTop] = useState(0)
  // 表格网格选择器
  const [tablePicker, setTablePicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  // 有序列表样式选择器
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
  // 打开新的编辑器交互层前，统一关闭已有菜单和弹窗。
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

  // 路径 ref 在渲染期同步，首次解析即可正确处理相对图片地址。
  const filePathRef = useRef<string | null>(filePath ?? null)
  filePathRef.current = filePath ?? null
  const docDir = filePath ? filePath.replace(/[\\/][^\\/]+$/, '') : null
  const docDirRef = useRef<string | null>(docDir)
  docDirRef.current = docDir
  // 快捷键 keymap 的 ref，确保 handleShortcut 始终读取最新配置
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
    handlePasteImage,
    handleDropImage,
    insertImageUploadFromPath,
    insertImageUploadFromBlob,
  } = useEditorImageUploads({ editorRef, filePathRef, docDirRef, settings, t })

  // ?? ????????? MD?HTML?MD ???????? ??
  // ????????? Markdown??????????? htmlToMarkdown ????
  const originalContentRef = useRef(content)
  const hasUserEditedRef = useRef(false)
  const editorDocumentRef = useRef({ content, docDir })
  const initialEditorHtmlRef = useRef<string | null>(null)
  const initialEditorHtml = initialEditorHtmlRef.current ?? markdownToHtml(content || '', docDir)
  initialEditorHtmlRef.current = initialEditorHtml
  // 程序化 setContent 时跳过 onUpdate，避免内容同步反馈回路。
  const isSettingContentRef = useRef(false)
  const { cancelPendingChange, flushPendingChange, handleEditorUpdate } = useDeferredEditorChange({
    docDirRef, editorDocumentRef, editorModeRef, hasUserEditedRef, isSettingContentRef, onChange, onDirty,
  })
  // ── 编辑器初始化 ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // 用 CodeBlockLowlight 替代
        orderedList: false, // 用带 listStyle 属性的 StyledOrderedList 替代
        bulletList: false, // 用带 marker 属性的 CustomBulletList 替代
      }),
      Underline,
      Highlight,
      FootnoteMetadata,
      DocumentTag,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'md-link' },
      }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
      StyledOrderedList,
      CustomBulletList,
      MarkdownCodeBlock.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      CustomTable.configure({
        resizable: true,
        HTMLAttributes: { class: 'editor-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TyporaRender,
      MathInline,
      MathBlock,
      ImageUpload,
    ],
    // 初始化时即把 markdown 转为 HTML，避免首次渲染显示无格式的原始文本
    content: initialEditorHtml,
    onUpdate: handleEditorUpdate,
    editorProps: {
      attributes: { class: 'editor-inner' },
      handleKeyDown: (view, event) => {
        const ed = editorRef.current
        if (!ed) return false
        return handleEditorShortcut(ed, event, view, keymapRef.current, openLinkDialog)
      },
      handlePaste: (view, event) => {
        return handlePasteImage(view, event)
      },
      handleDrop: (view, event) => {
        return handleDropImage(view, event)
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const wikiLinkPicker = useWikiLinkPicker({
    editor, editorMode, content, fileTree, currentFile: filePath, textareaRef, onChange,
    onBeforeOpen: closeEditorOverlays,
  })
  useSlashMenuTrigger(editor, setSlashState, closeEditorOverlays)

  const getReusablePreviewHtml = useCallback(() => {
    const synced = editorDocumentRef.current
    return editor && synced.content === content && synced.docDir === docDir
      ? editor.getHTML()
      : null
  }, [content, docDir, editor])
  const { previewHtml, previewSourceHtml } = useDeferredMarkdownPreview({
    content,
    docDir,
    enabled: editorMode === 'split',
    getReusableHtml: getReusablePreviewHtml,
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

  // ── 对外暴露插入图片能力 ──
  const insertImageMarkdown = useCallback((url: string, alt?: string) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent({ type: 'image', attrs: { src: url, alt: alt || '', title: null } })
      .run()
  }, [editor])

  const getCurrentContent = useCallback(() => {
    const pendingContent = flushPendingChange()
    if (pendingContent !== null) return pendingContent
    if (!hasUserEditedRef.current) return originalContentRef.current
    return editorDocumentRef.current.content
  }, [flushPendingChange])

  useImperativeHandle(ref, () => ({
    insertImageMarkdown,
    insertImageUploadFromPath,
    insertImageUploadFromBlob,
    runAiAction: aiAssistant.runAction,
    focusEditor: () => editor?.commands.focus(),
    getEditor: () => editor,
    getContent: getCurrentContent,
  }), [aiAssistant.runAction, editor, getCurrentContent, insertImageMarkdown, insertImageUploadFromBlob, insertImageUploadFromPath])

  // ── 视图模式：控制可编辑性 ──
  useEffect(() => {
    if (!editor) return
    editor.setEditable(editorMode !== 'read')
  }, [editorMode, editor])

  // ── 内容同步（源码/分栏模式跳过，避免每键触发 setContent）──
  useEffect(() => {
    if (!editor || editorMode === 'source' || editorMode === 'split') return
    const synced = editorDocumentRef.current
    if (content === synced.content && docDir === synced.docDir) return

    // 外部内容变化（如切换标签、打开新文件）：更新原始内容并重置编辑标记。
    cancelPendingChange()
    originalContentRef.current = content
    hasUserEditedRef.current = false
    editorDocumentRef.current = { content, docDir }
    isSettingContentRef.current = true
    editor.commands.setContent(previewSourceHtml ?? markdownToHtml(content, docDir))
    setTimeout(() => { isSettingContentRef.current = false }, 0)
  }, [cancelPendingChange, content, docDir, editor, editorMode, previewSourceHtml])

  // ── 浮动语法提示：跟踪光标位置，在焦点左上方显示块级前缀 ──
  useEffect(() => {
    if (!editor || editorMode !== 'live') { setSyntaxHint(null); return }
    const handler = () => {
      const { selection, doc } = editor.state
      if (!selection.empty) { setSyntaxHint(null); return }
      const $from = doc.resolve(selection.from)
      // 只有光标在块的最前方（offset=0）时才显示语法提示，避免在文本中间也悬浮显示
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

  // ── 代码块语言选择器：跟踪光标是否在 codeBlock 内 ──
  useEffect(() => {
    if (!editor) { setCodeBlockLang(null); return }
    const handler = () => {
      const { selection, doc } = editor.state
      const $from = doc.resolve(selection.from)
      const block = $from.parent
      if (block.type.name !== 'codeBlock') { setCodeBlockLang(null); return }
      try {
        const blockStart = $from.before($from.depth)
        const coords = editor.view.coordsAtPos(blockStart)
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setCodeBlockLang({
          pos: blockStart,
          language: block.attrs.language || 'plaintext',
          x: coords.right - rect.left - 120,
          y: coords.top - rect.top + 6,
        })
      } catch { /* ignore */ }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

  // ── 滚动时隐藏代码块语言选择器（避免下拉框与代码块位置不同步）──
  useEffect(() => {
    if (!editor) return
    const el = scrollRef?.current || containerRef.current?.querySelector('.editor-scroll')
    if (!el) return
    const onScroll = () => setCodeBlockLang(null)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [editor, editorMode, scrollRef])

  // ── 链接弹窗 ──
  function closeLinkDialog() {
    linkRangeRef.current = null
    setLinkDialog({ open: false, url: '', text: '', editing: false })
  }

  function openLinkDialog(prefill?: { url?: string; text?: string }) {
    const ed = editorRef.current
    if (!ed) return

    closeEditorOverlays()
    let { from, to, empty } = ed.state.selection
    let url = prefill?.url ?? ''
    let editing = false
    const activeHref = ed.getAttributes('link').href as string | undefined
    if (!prefill && activeHref) {
      ed.commands.extendMarkRange('link')
      ;({ from, to, empty } = ed.state.selection)
      url = activeHref
      editing = true
    }

    const selectedText = empty ? (prefill?.text ?? '') : ed.state.doc.textBetween(from, to, ' ')
    linkRangeRef.current = { from, to }
    setLinkDialog({ open: true, url, text: selectedText, editing })
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
  function openExistingLinkDialog(from: number, to: number, url: string, text: string) {
    const ed = editorRef.current
    if (!ed) return
    const safeTo = Math.min(to, ed.state.doc.content.size)
    closeEditorOverlays()
    linkRangeRef.current = { from, to: safeTo }
    setLinkDialog({ open: true, url, text, editing: true })
  }

  function applyLink() {
    if (!editor) return
    const url = linkDialog.url.trim()
    if (!url) { closeLinkDialog(); return }

    const range = linkRangeRef.current ?? editor.state.selection
    const from = Math.max(0, Math.min(range.from, editor.state.doc.content.size))
    const to = Math.max(from, Math.min(range.to, editor.state.doc.content.size))
    const currentText = from < to ? editor.state.doc.textBetween(from, to, ' ') : ''
    const display = linkDialog.text.trim() || currentText || url
    const $from = editor.state.doc.resolve(from)
    const sourceMarks = from < to ? ($from.nodeAfter?.marks ?? $from.marks()) : $from.marks()
    const marks = sourceMarks
      .filter((mark) => mark.type.name !== 'link')
      .map((mark) => mark.toJSON())
    marks.push({ type: 'link', attrs: { href: url } })

    editor.chain().focus()
      .insertContentAt({ from, to }, { type: 'text', text: display, marks })
      .setTextSelection({ from, to: from + display.length })
      .run()
    closeLinkDialog()
  }

  function applyImageEdit() {
    if (!editor || !imageEditPopup) return
    const { pos, src, alt } = imageEditPopup
    editor.commands.updateImageSize({ src: src.trim(), alt: alt.trim() } as any)
    // 同时通过 setNodeMarkup 更新 src 和 alt
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
      ...editor.state.doc.nodeAt(pos)?.attrs,
      src: src.trim(),
      alt: alt.trim(),
    })
    editor.view.dispatch(tr)
    setImageEditPopup(null)
  }


  const applySlashCommand = useCallback((cmd: SlashCommand) => {
    if (!editor) return
    const { selection } = editor.state
    const $from = selection.$from
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
    const slashIdx = textBefore.lastIndexOf('/')
    if (slashIdx >= 0) {
      const from = $from.start() + slashIdx
      editor.chain().focus().deleteRange({ from, to: selection.from }).run()
    }
    switch (cmd.id) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'h4': editor.chain().focus().toggleHeading({ level: 4 }).run(); break
      case 'bold': insertInlineMark('bold', t('editor.placeholder.bold')); break
      case 'italic': insertInlineMark('italic', t('editor.placeholder.italic')); break
      case 'strike': insertInlineMark('strike', t('editor.placeholder.strike')); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'ul': editor.chain().focus().toggleBulletList().run(); break
      case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'code': insertInlineMark('code', t('editor.placeholder.code')); break
      case 'codeblock': editor.chain().focus().setCodeBlock({ language: 'plaintext' }).run(); break
      case 'table':
        insertTable(3, 3)
        break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'image': openImagePicker(); break
      case 'link': openLinkDialog(); break
      case 'wikilink': wikiLinkPicker.openFromEditor(); break
      case 'mathblock':
        editor.chain().focus().insertContent({ type: 'mathBlock', attrs: { tex: 'E = mc^2' } }).run()
        break
      case 'mathinline':
        editor.chain().focus().insertContent({ type: 'mathInline', attrs: { tex: 'a^2 + b^2 = c^2' } }).run()
        break
    }
    setSlashState((s) => ({ ...s, open: false }))
  }, [editor, t, wikiLinkPicker.openFromEditor])

  // ── 插入表格 ──
  function insertTable(rows: number, cols: number) {
    if (!editor) return
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  }

  // ── 工具栏表格按钮：弹出网格选择器 ──
  function openTablePicker(e: React.MouseEvent) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    closeEditorOverlays()
    setTablePicker({ open: true, x: rect.left, y: rect.bottom + 4 })
  }

  // ── 工具栏有序列表样式按钮：弹出样式选择器 ──
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

  // 应用有序列表编号样式
  function applyOlStyle(style: string) {
    if (!editor) return
    const { $from } = editor.state.selection
    let inOl = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'orderedList') { inOl = true; break }
    }
    if (!inOl) {
      editor.chain().focus().toggleOrderedList().run()
    }
    editor.chain().focus().updateAttributes('orderedList', { listStyle: style }).run()
    setOlPicker((s) => ({ ...s, open: false }))
  }

  // ── 应用设置（行高 / 编辑区宽度 / 标记显隐）──
  // 字体与字号已迁移到 App.tsx 顶层 CSS 变量（--font-editor / --editor-font-size），
  // 此处仅保留每个编辑器实例独立的行高与编辑区宽度。
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

  // ── 自动补全括号 ──
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

  // ── 行内 mark：有选区则切换，无选区则插入占位文本并选中 ──
  function insertInlineMark(markName: string, placeholder: string) {
    if (!editor) return
    const { from, empty } = editor.state.selection
    if (empty) {
      editor.chain().focus()
        .insertContent({ type: 'text', text: placeholder, marks: [{ type: markName }] })
        .setTextSelection({ from, to: from + placeholder.length })
        .run()
    } else {
      switch (markName) {
        case 'bold': editor.chain().focus().toggleBold().run(); break
        case 'italic': editor.chain().focus().toggleItalic().run(); break
        case 'strike': editor.chain().focus().toggleStrike().run(); break
        case 'code': editor.chain().focus().toggleCode().run(); break
      }
    }
  }

  const execCmd = useCallback((cmd: string) => {
    if (!editor) return
    switch (cmd) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'bold': insertInlineMark('bold', t('editor.placeholder.bold')); break
      case 'italic': insertInlineMark('italic', t('editor.placeholder.italic')); break
      case 'strike': insertInlineMark('strike', t('editor.placeholder.strike')); break
      case 'code': insertInlineMark('code', t('editor.placeholder.code')); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'list': editor.chain().focus().toggleBulletList().run(); break
      case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo': editor.chain().focus().toggleTaskList().run(); break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'link': openLinkDialog(); break
      case 'wikilink': wikiLinkPicker.openFromEditor(); break
      case 'image': openImagePicker(); break
      case 'table': {
        const rect = editor.view.dom.getBoundingClientRect()
        closeEditorOverlays()
        setTablePicker({ open: true, x: rect.left + 40, y: rect.top + 40 })
        break
      }
      case 'codeblock': editor.chain().focus().toggleCodeBlock().run(); break
      case 'slash': onSlashCommand?.('slash'); break
    }
  }, [editor, onSlashCommand, t, wikiLinkPicker.openFromEditor])

  // ── 图片选择器 ──
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

  const { onScrollContextMenu, applyImageSizePreview } = useEditorContextMenu({
    editor,
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

  // ── 加载状态 ──
  if (!editor) {
    return (
      <div className="editor-area">
        <div className="welcome-screen">
          <div className="welcome-tagline" style={{ fontSize: 14 }}>{t('editor.loading')}</div>
        </div>
      </div>
    )
  }

  const isReadMode = editorMode === 'read'
  const isSourceMode = editorMode === 'source'
  const isSplitMode = editorMode === 'split'
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
      aiAssistant, applyImageEdit, applyImageSizePreview, applyLink, applyOlStyle,
      applySlashCommand, closeEditorOverlays, closeLinkDialog, codeBlockLang,
      containerRef, content, docDirRef, editor, filePath, getCurrentContent,
      editorMode, execCmd, findReplaceMode, findReplaceVisible,
      handlePreviewLinkClick, handleSplitScroll, hasEditorOverlay, headingPickerOpen,
      imageCtxMenu, imageEditPopup, imageEditPopupRef, imageSizeDialog,
      insertTable, isReadMode, isSourceMode, isSplitMode,
      jumpToFootnote, linkDialog, minimapOnLeft, minimapOnRight,
      olPicker, onAddAiContext, onChange, onFindReplaceClose, onFindReplaceModeChange, onOpenWikiLink, hideAiSelectionButton,
      onScrollContextMenu, openExistingLinkDialog, openTablePicker, previewHtml,
      previewScrollRef, scrollRef, searchCurrentIdx, searchMatches,
      setCodeBlockLang, setHeadingPickerOpen, setImageCtxMenu, setImageEditPopup,
      setImageSizeDialog, setLinkDialog, setOlPicker, setSearchCurrentIdx,
      setSearchMatches, setSlashState, setTableCtxMenu, setTablePicker,
      setTextareaScrollTop, settings, showToolbar, slashState, wikiLinkPicker,
      splitRatio, splitRef, startSplitDrag, syntaxHint,
      t, tableCtxMenu, tablePicker, textareaRef,
      textareaScrollTop, toggleOlPicker, toolbarLayoutClass, toolbarPosition,
      }}
    />
  )
})
