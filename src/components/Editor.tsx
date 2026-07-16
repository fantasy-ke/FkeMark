import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './plugins/ResizableImage'
import TextStyle from '@tiptap/extension-text-style'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import OrderedList from '@tiptap/extension-ordered-list'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { lowlight } from '../lib/lowlight'
import {
  forwardRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { AppSettings, EditorMode } from '../types'
import { TyporaRender } from './plugins/TyporaRender'
import { SlashMenu, type SlashCommand } from './SlashMenu'
import { useI18n } from '../i18n'
import { debounce, isLargeDocument } from '../utils/performance'

// 导入拆分出的模块
import { markdownToHtml, htmlToMarkdown } from '../utils/markdown'
import { Minimap } from './editor/Minimap'
import { LineNumbers } from './editor/LineNumbers'
import {
  TableGridPicker,
  OlStylePicker,
  CodeBlockLangPicker,
} from './editor/EditorPickers'
import {
  LinkDialog,
  EditorContextMenu,
  TableContextMenu,
  ImageContextMenu,
  ImageSizeDialog,
} from './editor/EditorMenus'

// ── lowlight 实例已在 src/lib/lowlight.ts 中配置（注册了常用语言）──

// 有序列表扩展：增加 listStyle 属性（渲染为 data-ls），支持工具栏切换编号样式
const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: 'decimal',
        parseHTML: (el) => (el.getAttribute('data-ls') as string) || 'decimal',
        renderHTML: (attrs) =>
          attrs.listStyle && attrs.listStyle !== 'decimal'
            ? { 'data-ls': attrs.listStyle }
            : {},
      },
    }
  },
})

/** 对外暴露的命令式接口，供 App 调用（如拖拽图片插入） */
export interface EditorHandle {
  insertImageMarkdown: (url: string, alt?: string) => void
  focusEditor: () => void
}

interface EditorProps {
  content: string
  onChange: (content: string) => void
  settings: AppSettings
  editorMode: EditorMode
  onEditorModeChange: (mode: EditorMode) => void
  onSlashCommand?: (cmd: string) => void
  scrollRef?: RefObject<HTMLDivElement | null>
  onToggleMinimap?: () => void
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { content, onChange, settings, editorMode, onEditorModeChange, onSlashCommand, scrollRef, onToggleMinimap },
  ref
) {
  const { t } = useI18n()
  
  // ── 状态管理 ──
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [tableCtxMenu, setTableCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [slashState, setSlashState] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  })
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; text: string }>({
    open: false, url: '', text: '',
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
  // 浮动语法提示（焦点左上方）
  const [syntaxHint, setSyntaxHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const [codeBlockLang, setCodeBlockLang] = useState<{ pos: number; language: string; x: number; y: number } | null>(null)
  // 表格网格选择器
  const [tablePicker, setTablePicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  // 有序列表样式选择器
  const [olPicker, setOlPicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })

  const editorRef = useRef<TiptapEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── 编辑器初始化 ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // 用 CodeBlockLowlight 替代
        orderedList: false, // 用带 listStyle 属性的 StyledOrderedList 替代
      }),
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'md-link' },
      }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
      StyledOrderedList,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'editor-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TyporaRender,
    ],
    // 初始化时即把 markdown 转为 HTML，避免首次渲染显示无格式的原始文本
    content: markdownToHtml(content || ''),
    onUpdate: ({ editor }) => {
      // 大文档使用防抖更新，减少频繁 onChange 导致的重新渲染
      const html = editor.getHTML()
      const md = htmlToMarkdown(html)
      if (isLargeDocument(md)) {
        // 大文档：延迟 100ms
        if (!(editor as unknown as { _debouncedOnChange?: ReturnType<typeof debounce> })._debouncedOnChange) {
          ;(editor as unknown as { _debouncedOnChange?: ReturnType<typeof debounce> })._debouncedOnChange = debounce(() => {
            onChange(htmlToMarkdown(editor.getHTML()))
          }, 100)
        }
        ;(editor as unknown as { _debouncedOnChange?: ReturnType<typeof debounce> })._debouncedOnChange?.()
      } else {
        onChange(md)
      }
    },
    editorProps: {
      attributes: { class: 'editor-inner' },
      handleKeyDown: (view, event) => {
        const ed = editorRef.current
        if (!ed) return false
        return handleShortcut(ed, event, view)
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // ── 对外暴露插入图片能力 ──
  const insertImageMarkdown = useCallback((url: string, alt?: string) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent({ type: 'image', attrs: { src: url, alt: alt || '', title: null } })
      .run()
  }, [editor])

  useImperativeHandle(ref, () => ({
    insertImageMarkdown,
    focusEditor: () => editor?.commands.focus(),
  }), [editor, insertImageMarkdown])

  // ── 视图模式：控制可编辑性 ──
  useEffect(() => {
    if (!editor) return
    editor.setEditable(editorMode !== 'read')
  }, [editorMode, editor])

  // ── 内容同步（源码模式跳过，避免每键触发 setContent）──
  useEffect(() => {
    if (!editor || editorMode === 'source') return
    if (content !== htmlToMarkdown(editor.getHTML())) {
      editor.commands.setContent(markdownToHtml(content))
    }
  }, [content, editor, editorMode])

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
  function openLinkDialog() {
    const ed = editorRef.current
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    const selectedText = empty ? '' : ed.state.doc.textBetween(from, to, ' ')
    setLinkDialog({ open: true, url: '', text: selectedText })
  }

  function applyLink() {
    if (!editor) return
    const { url, text } = linkDialog
    if (!url.trim()) { setLinkDialog({ open: false, url: '', text: '' }); return }
    const { from, to, empty } = editor.state.selection
    if (empty) {
      const display = text.trim() || url.trim()
      const start = from
      editor.chain().focus()
        .insertContent({ type: 'text', text: display, marks: [{ type: 'link', attrs: { href: url.trim() } }] })
        .setTextSelection({ from: start, to: start + display.length })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
      void from; void to
    }
    setLinkDialog({ open: false, url: '', text: '' })
  }

  // ── 编辑器快捷键处理 ──
  function handleShortcut(
    ed: TiptapEditor,
    event: KeyboardEvent,
    view: { state: { selection: { $from: { start: () => number; parent: { textContent: string }; parentOffset: number; depth: number; node: (d: number) => { type: { name: string }; childCount: number } } } } }
  ): boolean {
    const ctrl = event.ctrlKey || event.metaKey
    const key = event.key

    // Ctrl+1~6 切换标题层级
    if (ctrl && !event.shiftKey && /^[1-6]$/.test(key)) {
      event.preventDefault()
      const level = parseInt(key, 10) as 1 | 2 | 3 | 4 | 5 | 6
      ed.chain().focus().toggleHeading({ level }).run()
      return true
    }
    // Ctrl+0 恢复正文
    if (ctrl && !event.shiftKey && key === '0') {
      event.preventDefault()
      ed.chain().focus().setParagraph().run()
      return true
    }
    // Ctrl+B 粗体
    if (ctrl && !event.shiftKey && (key === 'b' || key === 'B')) {
      event.preventDefault()
      ed.chain().focus().toggleBold().run()
      return true
    }
    // Ctrl+I 斜体
    if (ctrl && !event.shiftKey && (key === 'i' || key === 'I')) {
      event.preventDefault()
      ed.chain().focus().toggleItalic().run()
      return true
    }
    // Ctrl+Shift+S 删除线
    if (ctrl && event.shiftKey && (key === 'S' || key === 's')) {
      event.preventDefault()
      ed.chain().focus().toggleStrike().run()
      return true
    }
    // Ctrl+Shift+Q 引用
    if (ctrl && event.shiftKey && (key === 'Q' || key === 'q')) {
      event.preventDefault()
      ed.chain().focus().toggleBlockquote().run()
      return true
    }
    // Alt+S 删除线
    if (event.altKey && (key === 's' || key === 'S')) {
      event.preventDefault()
      ed.chain().focus().toggleStrike().run()
      return true
    }
    // Ctrl+K 链接
    if (ctrl && !event.shiftKey && (key === 'k' || key === 'K')) {
      event.preventDefault()
      openLinkDialog()
      return true
    }
    // ── Tab 在表格单元格内导航 + 最后一格新建行 ──
    if (key === 'Tab' && !event.shiftKey) {
      const { $from } = view.state.selection
      let inCell = false
      let cellDepth = -1
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d)
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          inCell = true
          cellDepth = d
          break
        }
      }
      if (inCell && cellDepth > 0) {
        event.preventDefault()
        const beforePos = ed.state.selection.from
        ed.commands.goToNextCell?.() || false
        if (ed.state.selection.from === beforePos) {
          ed.chain().focus().addRowAfter().run()
          setTimeout(() => {
            ed.commands.goToNextCell?.()
          }, 0)
        }
        return true
      }
    }
    // Enter 处理：--- → 分割线，``` → 代码块
    if (key === 'Enter' && !event.shiftKey) {
      const { $from } = view.state.selection
      const parent = $from.parent
      const textBefore = parent.textContent.slice(0, $from.parentOffset)
      if ($from.parentOffset === parent.textContent.length) {
        if (/^---\s*$/.test(textBefore)) {
          event.preventDefault()
          const from = $from.start()
          const to = from + parent.textContent.length
          ed.chain().focus().deleteRange({ from, to }).setHorizontalRule().run()
          return true
        }
        const fenceMatch = textBefore.match(/^```(\w*)\s*$/)
        if (fenceMatch) {
          event.preventDefault()
          const from = $from.start()
          const to = from + parent.textContent.length
          const lang = fenceMatch[1] || 'plaintext'
          ed.chain().focus().deleteRange({ from, to }).setCodeBlock({ language: lang }).run()
          return true
        }
      }
    }
    return false
  }

  // ── 斜杠命令：监听 transaction 检测 / 输入 ──
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      const { selection } = editor.state
      if (!selection.empty) { setSlashState((s) => (s.open ? { ...s, open: false } : s)); return }
      const $from = selection.$from
      if ($from.parent.type.name !== 'paragraph' && $from.parent.type.name !== 'heading') {
        setSlashState((s) => (s.open ? { ...s, open: false } : s)); return
      }
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
      const m = textBefore.match(/(?:^|\s)\/(\w*)$/)
      if (m) {
        const query = m[1]
        try {
          const coords = editor.view.coordsAtPos(selection.from)
          setSlashState({ open: true, query, x: coords.left, y: coords.bottom + 4 })
        } catch { /* ignore */ }
      } else {
        setSlashState((s) => (s.open ? { ...s, open: false } : s))
      }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

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
      case 'bold': insertInlineMark('bold', '粗体'); break
      case 'italic': insertInlineMark('italic', '斜体'); break
      case 'strike': insertInlineMark('strike', '删除线'); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'ul': editor.chain().focus().toggleBulletList().run(); break
      case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'code': insertInlineMark('code', '代码'); break
      case 'codeblock': editor.chain().focus().setCodeBlock({ language: 'plaintext' }).run(); break
      case 'table':
        insertTable(3, 3)
        break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'image': openImagePicker(); break
      case 'link': openLinkDialog(); break
    }
    setSlashState((s) => ({ ...s, open: false }))
  }, [editor])

  // ── 插入表格 ──
  function insertTable(rows: number, cols: number) {
    if (!editor) return
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  }

  // ── 工具栏表格按钮：弹出网格选择器 ──
  function openTablePicker(e: React.MouseEvent) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTablePicker({ open: true, x: rect.left, y: rect.bottom + 4 })
  }

  // ── 工具栏有序列表样式按钮：弹出样式选择器 ──
  function openOlPicker(e: React.MouseEvent) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setOlPicker({ open: true, x: rect.left, y: rect.bottom + 4 })
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

  // ── 应用设置 ──
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement
    el.style.fontSize = `${settings.fontSize}px`
    const lhMap = { compact: '1.5', normal: '1.8', relaxed: '2.2' }
    el.style.lineHeight = lhMap[settings.lineHeight] || '1.8'
    const ewMap = { narrow: '680px', medium: '800px', wide: '960px' }
    document.documentElement.style.setProperty('--editor-max-w', ewMap[settings.editorWidth] || '800px')
    document.documentElement.style.setProperty('--font-sans', settings.fontFamily || 'system-ui')
    if (settings.showMarkers) document.body.classList.remove('hide-markers')
    else document.body.classList.add('hide-markers')
  }, [editor, settings.fontSize, settings.lineHeight, settings.editorWidth, settings.fontFamily, settings.showMarkers])

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
      case 'bold': insertInlineMark('bold', '粗体'); break
      case 'italic': insertInlineMark('italic', '斜体'); break
      case 'strike': insertInlineMark('strike', '删除线'); break
      case 'code': insertInlineMark('code', '代码'); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'list': editor.chain().focus().toggleBulletList().run(); break
      case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo': editor.chain().focus().toggleTaskList().run(); break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'link': openLinkDialog(); break
      case 'image': openImagePicker(); break
      case 'table': {
        const rect = editor.view.dom.getBoundingClientRect()
        setTablePicker({ open: true, x: rect.left + 40, y: rect.top + 40 })
        break
      }
      case 'slash': onSlashCommand?.('slash'); break
    }
  }, [editor, onSlashCommand])

  // ── 图片选择器 ──
  function openImagePicker() {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        insertImageMarkdown(reader.result as string, file.name)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  // 将菜单定位钳制在视口内
  function clampMenuPos(x: number, y: number, estW = 210, estH = 300) {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - estW - pad)
    const maxY = Math.max(pad, window.innerHeight - estH - pad)
    return {
      x: Math.min(Math.max(pad, x), maxX),
      y: Math.min(Math.max(pad, y), maxY),
    }
  }

  const onScrollContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.nativeEvent.stopImmediatePropagation()
    const target = e.target as HTMLElement

    // 图片右键
    const imgEl = target.closest('img') as HTMLImageElement | null
    if (imgEl) {
      const imgPos = findImagePos(imgEl)
      if (imgPos !== null) {
        const node = editor?.state.doc.nodeAt(imgPos)
        setImageCtxMenu({
          ...clampMenuPos(e.clientX, e.clientY, 220, 200),
          pos: imgPos,
          width: node?.attrs?.width ?? null,
          height: node?.attrs?.height ?? null,
          widthUnit: node?.attrs?.widthUnit ?? 'px',
          heightUnit: node?.attrs?.heightUnit ?? 'px',
          src: imgEl.src,
        })
        return
      }
    }

    // 表格单元格右键
    if (target.closest('table.editor-table, .tableWrapper')) {
      setTableCtxMenu(clampMenuPos(e.clientX, e.clientY, 210, 300))
      return
    }
    setContextMenuPos(clampMenuPos(e.clientX, e.clientY, 210, 180))
    setShowContextMenu(true)
  }

  // 查找图片节点在 ProseMirror 文档中的位置
  function findImagePos(imgEl: HTMLImageElement): number | null {
    if (!editor) return null
    let pos: number | null = null
    editor.state.doc.descendants((node, nodePos) => {
      if (pos !== null) return false
      if (node.type.name === 'image') {
        if (node.attrs.src === imgEl.getAttribute('src')) {
          pos = nodePos
          return false
        }
      }
      return true
    })
    return pos
  }

  // 图片尺寸实时预览
  function applyImageSizePreview(_pos: number, width: string | null, height: string | null, widthUnit: string, heightUnit: string) {
    if (!editor) return
    const w = width ? parseInt(width, 10) : null
    const h = height ? parseInt(height, 10) : null
    editor.commands.updateImageSize({ width: w, height: h, widthUnit, heightUnit })
  }

  // ── 菜单关闭事件监听 ──
  useEffect(() => {
    if (!imageCtxMenu) return
    const close = () => setImageCtxMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [imageCtxMenu])

  useEffect(() => {
    if (!tableCtxMenu) return
    const close = () => setTableCtxMenu(null)
    document.addEventListener('click', close)
    return () => { document.removeEventListener('click', close) }
  }, [tableCtxMenu])

  useEffect(() => {
    if (!showContextMenu) return
    const close = () => setShowContextMenu(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [showContextMenu])

  useEffect(() => {
    if (!slashState.open) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.slash-menu')) setSlashState((s) => ({ ...s, open: false }))
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [slashState.open])

  useEffect(() => {
    if (!tablePicker.open) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.table-grid-picker') && !target.closest('[data-table-btn]')) {
        setTablePicker((s) => ({ ...s, open: false }))
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tablePicker.open])

  useEffect(() => {
    if (!olPicker.open) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.ol-style-picker') && !target.closest('[data-ol-btn]')) {
        setOlPicker((s) => ({ ...s, open: false }))
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [olPicker.open])

  // ── 加载状态 ──
  if (!editor) {
    return (
      <div className="editor-area">
        <div className="welcome-screen">
          <div className="welcome-tagline" style={{ fontSize: 14 }}>编辑器加载中...</div>
        </div>
      </div>
    )
  }

  const isReadMode = editorMode === 'read'
  const isSourceMode = editorMode === 'source'
  const minimapOnLeft = settings.showMinimap && settings.minimapSide === 'left'
  const minimapOnRight = settings.showMinimap && settings.minimapSide === 'right'

  return (
    <div className="editor-area" ref={containerRef}>
      <div className="editor-pane">
        {/* 工具栏 */}
        {!isReadMode && !isSourceMode && (
          <div className={`editor-toolbar ${settings.toolbarFloating ? 'floating' : ''}`}>
            <button className="tb-btn" title="标题 1 (Ctrl+1)" onClick={() => execCmd('h1')}><strong>H1</strong></button>
            <button className="tb-btn" title="标题 2 (Ctrl+2)" onClick={() => execCmd('h2')}><strong>H2</strong></button>
            <button className="tb-btn" title="标题 3 (Ctrl+3)" onClick={() => execCmd('h3')}><strong>H3</strong></button>
            <span className="tb-sep" />
            <button className="tb-btn" title="粗体 (Ctrl+B) — **文本**" onClick={() => execCmd('bold')}><strong>B</strong></button>
            <button className="tb-btn" title="斜体 (Ctrl+I) — *文本*" onClick={() => execCmd('italic')}><em>I</em></button>
            <button className="tb-btn" title="删除线 (Alt+S) — ~~文本~~" onClick={() => execCmd('strike')}><s>S</s></button>
            <button className="tb-btn" title="行内代码 — `代码`" onClick={() => execCmd('code')}>&lt;/&gt;</button>
            <span className="tb-sep" />
            <button className="tb-btn" title="引用 (Ctrl+Shift+Q) — &gt; 文本" onClick={() => execCmd('quote')}>❝</button>
            <button className="tb-btn" title="无序列表 — - 项" onClick={() => execCmd('list')}>≡</button>
            <button className="tb-btn" title={t('toolbar.ol')} onClick={() => execCmd('ol')}>1.</button>
            <button
              className="tb-btn"
              style={{ width: 14, fontSize: 10, padding: 0 }}
              title={t('toolbar.olStyle.title')}
              data-ol-btn
              onClick={openOlPicker}
            >▾</button>
            <button className="tb-btn" title="任务列表 — - [ ] 待办" onClick={() => execCmd('todo')}>☐</button>
            <button className="tb-btn" title="分割线 — ---" onClick={() => execCmd('hr')}>―</button>
            <span className="tb-sep" />
            <button
              className="tb-btn"
              title="表格 — | 列 | 列 |"
              data-table-btn
              onClick={openTablePicker}
            >▦</button>
            <button className="tb-btn" title="链接 (Ctrl+K) — [文本](url)" onClick={() => execCmd('link')}>🔗</button>
            <button className="tb-btn" title="图片 — ![alt](url)" onClick={() => execCmd('image')}>🖼</button>
            <span style={{ flex: 1 }} />
            <button className="tb-btn" title="命令菜单 (/)" onClick={() => execCmd('slash')}>/</button>
          </div>
        )}

        {/* 源码模式 */}
        {isSourceMode && (
          <textarea
            className="source-textarea"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="在此编辑 Markdown 源码..."
            spellCheck={false}
          />
        )}

        {/* 实时/阅读模式 */}
        {!isSourceMode && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {minimapOnLeft && <Minimap content={content} scrollRef={scrollRef} side="left" editorMode={editorMode} />}

            <div
              className={`editor-scroll ${isReadMode ? 'read-mode-scroll' : ''}`}
              ref={scrollRef as React.RefObject<HTMLDivElement>}
              style={{ position: 'relative' }}
              onContextMenu={onScrollContextMenu}
            >
              {settings.showLineNumbers && !isReadMode && <LineNumbers content={content} />}
              <EditorContent editor={editor} />
            </div>

            {minimapOnRight && <Minimap content={content} scrollRef={scrollRef} side="right" editorMode={editorMode} />}
          </div>
        )}

        {/* 浮动语法提示 */}
        {syntaxHint && (
          <div className="syntax-hint-badge" style={{ left: syntaxHint.x, top: syntaxHint.y }}>
            {syntaxHint.text}
          </div>
        )}
      </div>

      {/* 斜杠命令菜单 */}
      {slashState.open && (
        <SlashMenu
          query={slashState.query}
          x={slashState.x}
          y={slashState.y}
          onSelect={applySlashCommand}
          onClose={() => setSlashState((s) => ({ ...s, open: false }))}
        />
      )}

      {/* 表格网格选择器 */}
      {tablePicker.open && (
        <TableGridPicker
          x={tablePicker.x}
          y={tablePicker.y}
          onSelect={(rows, cols) => {
            insertTable(rows, cols)
            setTablePicker((s) => ({ ...s, open: false }))
          }}
          onClose={() => setTablePicker((s) => ({ ...s, open: false }))}
        />
      )}

      {/* 有序列表样式选择器 */}
      {olPicker.open && (
        <OlStylePicker
          x={olPicker.x}
          y={olPicker.y}
          onApply={applyOlStyle}
          onClose={() => setOlPicker((s) => ({ ...s, open: false }))}
        />
      )}

      {/* 代码块语言选择器 */}
      {codeBlockLang && (
        <CodeBlockLangPicker
          pos={codeBlockLang.pos}
          language={codeBlockLang.language}
          x={codeBlockLang.x}
          y={codeBlockLang.y}
          onChange={(lang) => {
            setCodeBlockLang((s) => s ? { ...s, language: lang } : null)
            editor?.commands.updateAttributes('codeBlock', { language: lang })
          }}
        />
      )}

      {/* 链接弹窗 */}
      <LinkDialog
        open={linkDialog.open}
        url={linkDialog.url}
        text={linkDialog.text}
        onUrlChange={(url) => setLinkDialog((s) => ({ ...s, url }))}
        onTextChange={(text) => setLinkDialog((s) => ({ ...s, text }))}
        onApply={applyLink}
        onClose={() => setLinkDialog({ open: false, url: '', text: '' })}
      />

      {/* 右键菜单 */}
      {showContextMenu && (
        <EditorContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          showMinimap={settings.showMinimap}
          onToggleMinimap={() => onToggleMinimap?.()}
          onSetLiveMode={() => onEditorModeChange('live')}
          onSetReadMode={() => onEditorModeChange('read')}
          onClose={() => setShowContextMenu(false)}
        />
      )}

      {/* 表格右键菜单 */}
      {tableCtxMenu && (
        <TableContextMenu
          x={tableCtxMenu.x}
          y={tableCtxMenu.y}
          editor={editor}
          onClose={() => setTableCtxMenu(null)}
        />
      )}

      {/* 图片右键菜单 */}
      {imageCtxMenu && (
        <ImageContextMenu
          x={imageCtxMenu.x}
          y={imageCtxMenu.y}
          pos={imageCtxMenu.pos}
          width={imageCtxMenu.width}
          height={imageCtxMenu.height}
          widthUnit={imageCtxMenu.widthUnit}
          heightUnit={imageCtxMenu.heightUnit}
          src={imageCtxMenu.src}
          editor={editor}
          onResize={() => setImageSizeDialog({
            pos: imageCtxMenu.pos,
            width: imageCtxMenu.width != null ? String(imageCtxMenu.width) : '',
            height: imageCtxMenu.height != null ? String(imageCtxMenu.height) : '',
            widthUnit: imageCtxMenu.widthUnit || 'px',
            heightUnit: imageCtxMenu.heightUnit || 'px',
          })}
          onResetSize={() => {
            editor?.commands.updateImageSize({ width: null, height: null, widthUnit: 'px', heightUnit: 'px' })
            setImageCtxMenu(null)
          }}
          onHalfWidth={() => {
            editor?.commands.updateImageSize({ width: 50, widthUnit: '%', height: null, heightUnit: 'px' })
            setImageCtxMenu(null)
          }}
          onFullWidth={() => {
            editor?.commands.updateImageSize({ width: 100, widthUnit: '%', height: null, heightUnit: 'px' })
            setImageCtxMenu(null)
          }}
          onDelete={() => {
            editor?.chain().focus().deleteRange({ from: imageCtxMenu.pos, to: imageCtxMenu.pos + 1 }).run()
            setImageCtxMenu(null)
          }}
          onClose={() => setImageCtxMenu(null)}
        />
      )}

      {/* 图片尺寸调整弹窗 */}
      {imageSizeDialog && (
        <ImageSizeDialog
          pos={imageSizeDialog.pos}
          width={imageSizeDialog.width}
          height={imageSizeDialog.height}
          widthUnit={imageSizeDialog.widthUnit}
          heightUnit={imageSizeDialog.heightUnit}
          onWidthChange={(width) => setImageSizeDialog((s) => s ? { ...s, width } : null)}
          onHeightChange={(height) => setImageSizeDialog((s) => s ? { ...s, height } : null)}
          onWidthUnitChange={(unit) => setImageSizeDialog((s) => s ? { ...s, widthUnit: unit } : null)}
          onHeightUnitChange={(unit) => setImageSizeDialog((s) => s ? { ...s, heightUnit: unit } : null)}
          onPreview={(w, h) => applyImageSizePreview(imageSizeDialog.pos, w, h, imageSizeDialog.widthUnit, imageSizeDialog.heightUnit)}
          onConfirm={() => {
            if (editor && imageSizeDialog) {
              const w = imageSizeDialog.width ? parseInt(imageSizeDialog.width, 10) : null
              const h = imageSizeDialog.height ? parseInt(imageSizeDialog.height, 10) : null
              editor.commands.updateImageSize({
                width: w,
                height: h,
                widthUnit: imageSizeDialog.widthUnit,
                heightUnit: imageSizeDialog.heightUnit,
              })
            }
            setImageSizeDialog(null)
          }}
          onCancel={() => setImageSizeDialog(null)}
        />
      )}

      <div className="focus-overlay" />
    </div>
  )
})
