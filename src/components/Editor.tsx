import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
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
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { AppSettings, EditorMode } from '../types'
import { TyporaRender } from './plugins/TyporaRender'
import { SlashMenu, type SlashCommand } from './SlashMenu'
import { useI18n } from '../i18n'

// ── lowlight 实例已在 src/lib/lowlight.ts 中配置（注册了常用语言）──

// 有序列表扩展：增加 listStyle 属性（渲染为 data-ls），支持工具栏切换编号样式
// （decimal / lower-alpha / upper-alpha / lower-roman / upper-roman）
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
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [tableCtxMenu, setTableCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [slashState, setSlashState] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  })
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; text: string }>({
    open: false, url: '', text: '',
  })
  // 浮动语法提示（焦点左上方）
  const [syntaxHint, setSyntaxHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const [codeBlockLang, setCodeBlockLang] = useState<{ pos: number; language: string; x: number; y: number } | null>(null)
  // 表格网格选择器
  const [tablePicker, setTablePicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  // 有序列表样式选择器
  const [olPicker, setOlPicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })

  const editorRef = useRef<TiptapEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
      Image.configure({ inline: false, allowBase64: true }),
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
      onChange(htmlToMarkdown(editor.getHTML()))
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

  // 对外暴露插入图片能力
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

  // ── 链接弹窗 ──
  function openLinkDialog() {
    const ed = editorRef.current
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    const selectedText = empty ? '' : ed.state.doc.textBetween(from, to, ' ')
    setLinkDialog({ open: true, url: '', text: selectedText })
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
      // 查找当前是否在 tableCell/tableHeader 内
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
        // 尝试 goToNextCell（TipTap Table 扩展自带）
        // 如果在最后一格，goToNextCell 会失败或不动，此时 addRowAfter 并跳到新行第一格
        const beforePos = ed.state.selection.from
        ed.commands.goToNextCell?.() || false
        // 检查是否移动了
        if (ed.state.selection.from === beforePos) {
          // 在最后一格：新建一行并跳到第一格
          ed.chain().focus().addRowAfter().run()
          // 移到新行第一格：用 goToPreviousRow + goToNextCell 不太直观，直接用 setInputSelection
          // 简化：新行已创建，再次 goToNextCell 应该能跳到新行第一格
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
        // --- 回车 → 水平分割线
        if (/^---\s*$/.test(textBefore)) {
          event.preventDefault()
          const from = $from.start()
          const to = from + parent.textContent.length
          ed.chain().focus().deleteRange({ from, to }).setHorizontalRule().run()
          return true
        }
        // ``` 或 ```lang 回车 → 代码块（带语言）
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
        // 默认插入 3x3 表格
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

  // 应用有序列表编号样式：未在有序列表中则先创建，再设置 listStyle 属性
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
    // 宽度通过 CSS 变量 --editor-max-w 驱动：父容器 .editor-inner / .source-textarea
    // 都引用该变量，若直接设在 .ProseMirror 上会被父容器 max-width 截断而失效。
    const ewMap = { narrow: '680px', medium: '800px', wide: '960px' }
    document.documentElement.style.setProperty('--editor-max-w', ewMap[settings.editorWidth] || '800px')
    // 字体：写 CSS 变量 --font-sans，全局引用
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

  // ── 行内 mark：有选区则切换，无选区则插入占位文本并选中（显示语法符号）──
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

  // 将菜单定位钳制在视口内，避免屏幕右下角右键时菜单溢出
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
    // 阻止 contextmenu 事件冒泡到 document，否则 close useEffect 会立即关闭菜单
    e.nativeEvent.stopImmediatePropagation()
    const target = e.target as HTMLElement
    // 表格单元格右键：弹出表格操作菜单
    if (target.closest('table.editor-table, .tableWrapper')) {
      setTableCtxMenu(clampMenuPos(e.clientX, e.clientY, 210, 300))
      return
    }
    setContextMenuPos(clampMenuPos(e.clientX, e.clientY, 210, 180))
    setShowContextMenu(true)
  }

  // 表格右键菜单关闭（只监听 click，不监听 contextmenu 以防刚弹出就被关）
  useEffect(() => {
    if (!tableCtxMenu) return
    const close = () => setTableCtxMenu(null)
    document.addEventListener('click', close)
    return () => {
      document.removeEventListener('click', close)
    }
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
        {/* 工具栏（阅读/源码模式隐藏）*/}
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

        {/* 源码模式：纯文本编辑区 */}
        {isSourceMode && (
          <textarea
            className="source-textarea"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="在此编辑 Markdown 源码..."
            spellCheck={false}
          />
        )}

        {/* 实时/阅读模式：小地图 + 滚动容器 */}
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

        {/* 浮动语法提示（焦点左上方）*/}
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
        <div
          className="ol-style-picker"
          style={{ left: olPicker.x, top: olPicker.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {([
            ['decimal', '1.', t('toolbar.olStyle.decimal')],
            ['lower-alpha', 'a.', t('toolbar.olStyle.lowerAlpha')],
            ['upper-alpha', 'A.', t('toolbar.olStyle.upperAlpha')],
            ['lower-roman', 'i.', t('toolbar.olStyle.lowerRoman')],
            ['upper-roman', 'I.', t('toolbar.olStyle.upperRoman')],
          ] as const).map(([val, glyph, label]) => (
            <button
              key={val}
              className="ol-style-item"
              onMouseDown={(e) => { e.preventDefault(); applyOlStyle(val) }}
            >
              <span className="ol-style-glyph">{glyph}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 代码块语言选择器 */}
      {codeBlockLang && (
        <div
          className="code-lang-picker"
          style={{ left: codeBlockLang.x, top: codeBlockLang.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <input
            className="code-lang-input"
            type="text"
            list="code-lang-list"
            value={codeBlockLang.language}
            placeholder={t('codeLang.placeholder')}
            onChange={(e) => {
              const lang = e.target.value.trim() || 'plaintext'
              setCodeBlockLang((s) => s ? { ...s, language: lang } : null)
              // 注意：不能调用 .focus()，否则每输入一个字符焦点就被抢回编辑器，
              // 导致输入框只能输入一个字符。updateAttributes 直接基于当前选区生效。
              editor?.commands.updateAttributes('codeBlock', { language: lang })
            }}
          />
          <datalist id="code-lang-list">
            {['javascript', 'typescript', 'python', 'bash', 'shell', 'json', 'xml', 'css', 'sql', 'markdown', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'yaml', 'dockerfile', 'plaintext'].map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
      )}

      {/* 链接弹窗 */}
      {linkDialog.open && (
        <div className="link-dialog-overlay" onClick={() => setLinkDialog({ open: false, url: '', text: '' })}>
          <div className="link-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="link-dialog-title">{t('linkDialog.title')}</div>
            <label className="link-dialog-label">{t('linkDialog.text')}</label>
            <input
              className="link-dialog-input"
              type="text"
              value={linkDialog.text}
              placeholder={t('linkDialog.textPlaceholder')}
              onChange={(e) => setLinkDialog((s) => ({ ...s, text: e.target.value }))}
            />
            <label className="link-dialog-label">{t('linkDialog.url')}</label>
            <input
              className="link-dialog-input"
              type="url"
              autoFocus
              value={linkDialog.url}
              placeholder={t('linkDialog.urlPlaceholder')}
              onKeyDown={(e: ReactKeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                if (e.key === 'Escape') setLinkDialog({ open: false, url: '', text: '' })
              }}
              onChange={(e) => setLinkDialog((s) => ({ ...s, url: e.target.value }))}
            />
            <div className="link-dialog-actions">
              <button className="link-dialog-btn cancel" onClick={() => setLinkDialog({ open: false, url: '', text: '' })}>{t('linkDialog.cancel')}</button>
              <button className="link-dialog-btn ok" onClick={applyLink}>{t('linkDialog.ok')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {showContextMenu && (
        <div
          className="app-menu-dropdown open"
          style={{ position: 'fixed', top: contextMenuPos.y, left: contextMenuPos.x, zIndex: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="app-menu-item"
            onClick={() => { onToggleMinimap?.(); setShowContextMenu(false) }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </span>
            <span className="menu-label">{settings.showMinimap ? t('ctx.hideMinimap') : t('ctx.showMinimap')}</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => { onEditorModeChange('live'); setShowContextMenu(false) }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </span>
            <span className="menu-label">{t('ctx.liveMode')}</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => { onEditorModeChange('read'); setShowContextMenu(false) }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            <span className="menu-label">{t('ctx.readMode')}</span>
          </button>
        </div>
      )}

      {/* 表格右键菜单 */}
      {tableCtxMenu && (
        <div
          className="app-menu-dropdown open table-ctx-menu"
          style={{ position: 'fixed', top: tableCtxMenu.y, left: tableCtxMenu.x, zIndex: 300 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          {[
            { label: t('table.insertRowAbove'), cmd: () => editor?.chain().focus().addRowBefore().run() },
            { label: t('table.insertRowBelow'), cmd: () => editor?.chain().focus().addRowAfter().run() },
            { label: t('table.insertColLeft'), cmd: () => editor?.chain().focus().addColumnBefore().run() },
            { label: t('table.insertColRight'), cmd: () => editor?.chain().focus().addColumnAfter().run() },
            { label: t('table.deleteRow'), cmd: () => editor?.chain().focus().deleteRow().run(), danger: true },
            { label: t('table.deleteCol'), cmd: () => editor?.chain().focus().deleteColumn().run(), danger: true },
            { label: t('table.deleteTable'), cmd: () => editor?.chain().focus().deleteTable().run(), danger: true },
          ].map((item) => (
            <button
              key={item.label}
              className="app-menu-item"
              style={item.danger ? { color: 'var(--destructive)' } : undefined}
              onClick={() => { item.cmd(); setTableCtxMenu(null) }}
            >
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="focus-overlay" />
    </div>
  )
})

// ─── 表格网格选择器组件 ───
function TableGridPicker(props: { x: number; y: number; onSelect: (rows: number, cols: number) => void; onClose: () => void }) {
  const { x, y, onSelect } = props
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const maxRows = 8
  const maxCols = 8
  return (
    <div className="table-grid-picker" style={{ left: x, top: y }} onMouseLeave={() => setHover({ r: 0, c: 0 })}>
      <div className="table-grid">
        {Array.from({ length: maxRows }, (_, r) =>
          Array.from({ length: maxCols }, (_, c) => {
            const isHover = r < hover.r && c < hover.c
            return (
              <div
                key={`${r}-${c}`}
                className={`table-grid-cell ${isHover ? 'hover' : ''}`}
                onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                onMouseDown={(e) => { e.preventDefault(); onSelect(r + 1, c + 1) }}
              />
            )
          })
        )}
      </div>
      <div className="table-grid-label">
        {hover.r > 0 && hover.c > 0 ? `${hover.r} × ${hover.c}` : '拖拽选择行列'}
      </div>
    </div>
  )
}

// ─── 小地图组件（支持滑动查看 + 悬浮预览，带尖尖指向）───
function Minimap({
  content,
  scrollRef,
  side,
  editorMode,
}: {
  content: string
  scrollRef?: RefObject<HTMLDivElement | null>
  side: 'left' | 'right'
  editorMode: 'source' | 'live' | 'read'
}) {
  const lines = content.split('\n')
  const [hover, setHover] = useState<{ html: string; y: number; left: number } | null>(null)
  const draggingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const scrollToPos = useCallback((clientY: number) => {
    const el = panelRef.current
    if (!el || !scrollRef?.current) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    scrollRef.current.scrollTo({ top: ratio * scrollRef.current.scrollHeight, behavior: 'auto' })
  }, [scrollRef])

  const handleMouseMove = (e: React.MouseEvent) => {
    // 拖动中实时滚动
    if (draggingRef.current) {
      scrollToPos(e.clientY)
    }
    // 悬浮预览：计算对应行范围，提取片段，按模式渲染
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    const lineIdx = Math.floor(ratio * lines.length)
    // 提取以该行为中心的 5 行片段
    const start = Math.max(0, lineIdx - 2)
    const end = Math.min(lines.length, lineIdx + 3)
    const fragment = lines.slice(start, end).join('\n').trim()
    if (!fragment) { setHover(null); return }

    // 根据编辑模式决定预览内容
    let html: string
    if (editorMode === 'source') {
      // 源码模式：纯文本预览（转义 HTML）
      html = `<pre class="minimap-tip-pre">${escapeHtml(fragment)}</pre>`
    } else {
      // live / read 模式：markdown 渲染为 HTML
      html = markdownToHtml(fragment)
    }

    // tooltip 垂直居中跟随鼠标，水平位置根据 side 计算（绝对视口坐标，用 Portal 渲染到 body）
    const TOOLTIP_W = 280
    // 小地图在左边 → tooltip 显示在右边（panel 右侧 + 14px 间距）
    // 小地图在右边 → tooltip 显示在左边（panel 左侧 - 14px - 280px 宽度）
    // 边界钳制：避免悬浮框溢出视口
    const rawLeft = side === 'left' ? rect.right + 14 : rect.left - 14 - TOOLTIP_W
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - 8))
    // 垂直居中跟随鼠标，但钳制在视口内（tooltip 约 160px 高）
    const y = Math.max(80, Math.min(e.clientY, window.innerHeight - 80))
    setHover({ html, y, left })
  }

  return (
    <div
      ref={panelRef}
      className={`minimap-panel minimap-${side}`}
      onMouseDown={(e) => { draggingRef.current = true; scrollToPos(e.clientY) }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => { draggingRef.current = false }}
      onMouseLeave={() => { draggingRef.current = false; setHover(null) }}
    >
      {lines.map((line, i) => {
        const trimmed = line.trim()
        let color = 'var(--muted)'
        let weight: 'normal' | 'bold' = 'normal'
        if (trimmed.startsWith('# ')) { color = 'var(--fg)'; weight = 'bold' }
        else if (trimmed.startsWith('## ')) { color = 'var(--accent)'; weight = 'bold' }
        else if (trimmed.startsWith('### ')) { color = 'var(--muted)'; weight = 'bold' }
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) { color = 'var(--marker)' }
        else if (trimmed.startsWith('> ')) { color = 'var(--quote-bar)' }
        else if (trimmed.startsWith('```')) { color = 'var(--code-bg)' }
        else if (/^\|/.test(trimmed)) { color = 'var(--quote-bar)' }
        else if (/^- \[[ x]\]/.test(trimmed)) { color = 'var(--accent)' }
        const display = trimmed.slice(0, 20) || ' '
        return (
          <div key={i} style={{ color, fontWeight: weight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {display}
          </div>
        )
      })}
      {hover && createPortal(
        <div
          ref={tooltipRef}
          className={`minimap-tooltip minimap-tooltip-${side}`}
          style={{ top: hover.y, left: hover.left }}
        >
          <div className="minimap-tooltip-arrow" />
          <div className="minimap-tooltip-content" dangerouslySetInnerHTML={{ __html: hover.html }} />
        </div>,
        document.body
      )}
    </div>
  )
}

// 注：escapeHtml 函数已在文件末尾定义，此处复用

// ─── 行号组件 ───
function LineNumbers({ content }: { content: string }) {
  const lines = content.split('\n').length
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '40px', paddingTop: '40px',
      textAlign: 'right', paddingRight: '8px', fontSize: '12px',
      fontFamily: 'var(--font-mono)', color: 'var(--muted)',
      userSelect: 'none', pointerEvents: 'none', lineHeight: '1.8', opacity: 0.5,
    }}>
      {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
    </div>
  )
}

// ════════════════════════════════════════════════
//  HTML → Markdown（递归 DOM 遍历，支持嵌套 + 表格 + 任务列表）
// ════════════════════════════════════════════════
function htmlToMarkdown(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return divToMarkdown(div).trim()
}

function divToMarkdown(element: HTMLElement): string {
  let result = ''
  for (let i = 0; i < element.childNodes.length; i++) {
    const node = element.childNodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()
      switch (tag) {
        case 'h1': result += `\n# ${textContent(el)}\n\n`; break
        case 'h2': result += `\n## ${textContent(el)}\n\n`; break
        case 'h3': result += `\n### ${textContent(el)}\n\n`; break
        case 'h4': result += `\n#### ${textContent(el)}\n\n`; break
        case 'h5': result += `\n##### ${textContent(el)}\n\n`; break
        case 'h6': result += `\n###### ${textContent(el)}\n\n`; break
        case 'p': result += `\n${inlineToMd(el)}\n\n`; break
        case 'strong': case 'b': result += `**${inlineToMd(el)}**`; break
        case 'em': case 'i': result += `*${inlineToMd(el)}*`; break
        case 's': case 'del': case 'strike': result += `~~${inlineToMd(el)}~~`; break
        case 'u': result += `<u>${inlineToMd(el)}</u>`; break
        case 'mark': result += `==${inlineToMd(el)}==`; break
        case 'code': result += `\`${textContent(el)}\``; break
        case 'pre': {
          // 代码块：提取语言 + 内容
          const codeEl = el.querySelector('code')
          const langMatch = codeEl?.className.match(/language-(\w+)/)
          const lang = langMatch ? langMatch[1] : ''
          const codeText = (codeEl ? textContent(codeEl as HTMLElement) : textContent(el)).replace(/\n$/, '')
          result += `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`
          break
        }
        case 'ul':
          // 任务列表 vs 普通无序列表
          if (el.getAttribute('data-type') === 'taskList') {
            result += '\n' + taskListToMd(el, 0) + '\n'
          } else {
            result += '\n' + listToMd(el, 'ul', 0) + '\n'
          }
          break
        case 'ol':
          result += '\n' + listToMd(el, 'ol', 0) + '\n'
          break
        case 'blockquote':
          result += '\n' + blockquoteToMd(el, 0) + '\n\n'
          break
        case 'table':
          result += '\n' + tableToMd(el) + '\n\n'
          break
        case 'a': {
          const href = el.getAttribute('href') || ''
          const title = el.getAttribute('title')
          result += `[${inlineToMd(el)}](${href}${title ? ` "${title}"` : ''})`
          break
        }
        case 'img': {
          const src = el.getAttribute('src') || ''
          const alt = el.getAttribute('alt') || ''
          const title = el.getAttribute('title')
          result += `![${alt}](${src}${title ? ` "${title}"` : ''})`
          break
        }
        case 'hr': result += `\n---\n\n`; break
        case 'br': result += '\n'; break
        default: result += inlineToMd(el) || ''; break
      }
    }
  }
  return result
}

function inlineToMd(element: HTMLElement): string {
  let result = ''
  for (let i = 0; i < element.childNodes.length; i++) {
    const node = element.childNodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()
      switch (tag) {
        case 'strong': case 'b': result += `**${inlineToMd(el)}**`; break
        case 'em': case 'i': result += `*${inlineToMd(el)}*`; break
        case 's': case 'del': case 'strike': result += `~~${inlineToMd(el)}~~`; break
        case 'u': result += `<u>${inlineToMd(el)}</u>`; break
        case 'mark': result += `==${inlineToMd(el)}==`; break
        case 'code': result += `\`${textContent(el)}\``; break
        case 'a': {
          const href = el.getAttribute('href') || ''
          result += `[${inlineToMd(el)}](${href})`
          break
        }
        case 'img': {
          const src = el.getAttribute('src') || ''
          const alt = el.getAttribute('alt') || ''
          result += `![${alt}](${src})`
          break
        }
        case 'br': result += '\n'; break
        default: result += inlineToMd(el); break
      }
    }
  }
  return result
}

function listToMd(el: HTMLElement, type: 'ul' | 'ol', depth: number): string {
  let result = ''
  const indent = '  '.repeat(depth)
  let idx = 1
  for (const child of Array.from(el.children)) {
    const li = child as HTMLElement
    if (li.tagName.toLowerCase() !== 'li') continue
    const marker = type === 'ul' ? '- ' : `${idx}. `
    let text = ''
    let nested = ''
    for (const c of Array.from(li.childNodes)) {
      if (c.nodeType === Node.ELEMENT_NODE) {
        const ce = c as HTMLElement
        const ct = ce.tagName.toLowerCase()
        if (ct === 'ul') nested += listToMd(ce, 'ul', depth + 1)
        else if (ct === 'ol') nested += listToMd(ce, 'ol', depth + 1)
        else text += inlineToMd(ce)
      } else if (c.nodeType === Node.TEXT_NODE) {
        text += c.textContent || ''
      }
    }
    result += `${indent}${marker}${text.trim()}\n`
    if (nested) result += nested
    idx++
  }
  return result
}

// ── 任务列表转 Markdown：- [ ] / - [x] ──
function taskListToMd(el: HTMLElement, depth: number): string {
  let result = ''
  const indent = '  '.repeat(depth)
  for (const child of Array.from(el.children)) {
    const li = child as HTMLElement
    if (li.tagName.toLowerCase() !== 'li') continue
    const checked = li.getAttribute('data-checked') === 'true'
    const marker = checked ? '- [x] ' : '- [ ] '
    let text = ''
    let nested = ''
    // taskItem 结构：<li data-checked><label><input></label><div>内容</div></li>
    for (const c of Array.from(li.childNodes)) {
      if (c.nodeType === Node.ELEMENT_NODE) {
        const ce = c as HTMLElement
        const ct = ce.tagName.toLowerCase()
        if (ct === 'label') continue // 跳过 checkbox label
        if (ct === 'div') text += inlineToMd(ce)
        else if (ct === 'ul') {
          if (ce.getAttribute('data-type') === 'taskList') nested += taskListToMd(ce, depth + 1)
          else nested += listToMd(ce, 'ul', depth + 1)
        } else if (ct === 'ol') nested += listToMd(ce, 'ol', depth + 1)
        else text += inlineToMd(ce)
      } else if (c.nodeType === Node.TEXT_NODE) {
        text += c.textContent || ''
      }
    }
    result += `${indent}${marker}${text.trim()}\n`
    if (nested) result += nested
  }
  return result
}

function blockquoteToMd(el: HTMLElement, depth: number): string {
  const prefix = '>'.repeat(depth + 1) + ' '
  let result = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent || '').trim()
      if (t) result += `${prefix}${t}\n`
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ce = child as HTMLElement
      const ct = ce.tagName.toLowerCase()
      if (ct === 'blockquote') {
        result += blockquoteToMd(ce, depth + 1)
      } else if (ct === 'p') {
        result += `${prefix}${inlineToMd(ce).trim()}\n`
      } else {
        result += `${prefix}${inlineToMd(ce).trim()}\n`
      }
    }
  }
  return result
}

// ── 表格转 Markdown ──
function tableToMd(el: HTMLElement): string {
  const rows: string[][] = []
  let headerAligns: ('left' | 'center' | 'right')[] = []
  // thead
  const thead = el.querySelector('thead')
  if (thead) {
    const tr = thead.querySelector('tr')
    if (tr) {
      const cells = Array.from(tr.querySelectorAll('th')).map((th) => textContent(th as HTMLElement).trim())
      rows.push(cells)
      headerAligns = cells.map(() => 'left')
    }
  }
  // tbody
  const tbody = el.querySelector('tbody')
  if (tbody) {
    for (const tr of Array.from(tbody.querySelectorAll('tr'))) {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => textContent(td as HTMLElement).trim())
      rows.push(cells)
    }
  }
  if (rows.length === 0) return ''
  const colCount = rows[0].length
  // 构造分隔行
  const alignStr = (a: string) => {
    if (a === 'center') return ':---:'
    if (a === 'right') return '---:'
    if (a === 'left') return ':---'
    return '---'
  }
  const sep = headerAligns.map(alignStr).slice(0, colCount)
  // 构造每行
  const lines: string[] = []
  lines.push('| ' + rows[0].join(' | ') + ' |')
  lines.push('| ' + sep.join(' | ') + ' |')
  for (let i = 1; i < rows.length; i++) {
    const padded = rows[i].concat(Array(colCount).fill('')).slice(0, colCount)
    lines.push('| ' + padded.join(' | ') + ' |')
  }
  return lines.join('\n')
}

function textContent(el: HTMLElement): string {
  let t = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      t += child.textContent || ''
    } else if (child instanceof HTMLElement) {
      if (!(child.classList?.contains('md-marker') || child.classList?.contains('md-delimiter') || child.classList?.contains('code-lang-selector'))) {
        t += textContent(child)
      }
    } else if (child instanceof Element) {
      t += child.textContent || ''
    }
  }
  return t
}

// ════════════════════════════════════════════════
//  Markdown → HTML（逐行解析，支持完整语法 + 表格 + 任务列表）
// ════════════════════════════════════════════════
function markdownToHtml(md: string): string {
  if (!md) return '<p></p>'
  const lines = md.split('\n')
  let html = ''
  let inUl = false
  let inOl = false
  let inQuote = false
  let inCode = false
  let codeLang = ''
  let inTaskList = false
  let paragraphBuffer = ''
  // 表格状态
  let tableBuffer: string[][] = []
  let inTable = false

  const closeUl = () => { if (inUl) { html += '</ul>'; inUl = false } }
  const closeOl = () => { if (inOl) { html += '</ol>'; inOl = false } }
  const closeTaskList = () => { if (inTaskList) { html += '</ul>'; inTaskList = false } }
  const closeList = () => { closeUl(); closeOl(); closeTaskList() }
  const closeQuote = () => {
    if (inQuote) { html += '</blockquote>'; inQuote = false }
  }
  const flushTable = () => {
    if (tableBuffer.length >= 2) {
      html += '<table><thead><tr>'
      for (const cell of tableBuffer[0]) {
        html += `<th>${parseInlineMd(cell)}</th>`
      }
      html += '</tr></thead><tbody>'
      for (let i = 2; i < tableBuffer.length; i++) {
        html += '<tr>'
        for (const cell of tableBuffer[i]) {
          html += `<td>${parseInlineMd(cell)}</td>`
        }
        html += '</tr>'
      }
      html += '</tbody></table>'
    }
    tableBuffer = []
    inTable = false
  }
  const flushParagraph = () => {
    if (paragraphBuffer) {
      html += `<p>${parseInlineMd(paragraphBuffer)}</p>`
      paragraphBuffer = ''
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 代码块围栏：``` 开头（含语言标识）
    if (/^```/.test(trimmed)) {
      if (inTable) flushTable()
      if (inCode) {
        html += `</code></pre>`
        inCode = false
        codeLang = ''
        html += '\n'
      } else {
        flushParagraph(); closeList(); closeQuote()
        codeLang = trimmed.replace(/^```/, '').trim()
        html += `<pre><code${codeLang ? ` class="language-${codeLang}"` : ''}>`
        inCode = true
      }
      continue
    }
    if (inCode) {
      html += escapeHtml(line) + '\n'
      continue
    }

    // 表格行：| 开头
    if (/^\|.*\|\s*$/.test(trimmed)) {
      // 检查下一行是否是分隔行（仅在未进入表格时）
      if (!inTable) {
        const nextLine = lines[i + 1]?.trim() || ''
        if (/^\|[\s:-]+\|/.test(nextLine)) {
          // 进入表格
          flushParagraph(); closeList(); closeQuote()
          inTable = true
          tableBuffer.push(parseTableRow(trimmed))
          continue
        }
      }
      if (inTable) {
        // 跳过分隔行（:---:）
        if (/^\|[\s:-]+\|/.test(trimmed)) {
          tableBuffer.push(['---']) // 占位，后续跳过
        } else {
          tableBuffer.push(parseTableRow(trimmed))
        }
        continue
      }
    }
    // 表格结束
    if (inTable) {
      flushTable()
    }

    // 标题
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushParagraph(); closeList(); closeQuote()
      const level = h[1].length
      html += `<h${level}>${parseInlineMd(h[2])}</h${level}>`
      continue
    }

    // 水平分割线
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      flushParagraph(); closeList(); closeQuote()
      html += '<hr>'
      continue
    }

    // 引用（支持嵌套 >>）
    const quoteMatch = trimmed.match(/^(>+)\s+(.*)$/)
    if (quoteMatch) {
      flushParagraph(); closeList()
      if (!inQuote) { html += '<blockquote>'; inQuote = true }
      html += `<p>${parseInlineMd(quoteMatch[2])}</p>`
      continue
    }
    if (inQuote) { html += '</blockquote>'; inQuote = false }

    // 任务列表：- [ ] 或 - [x]
    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (taskMatch) {
      flushParagraph(); closeUl(); closeOl()
      if (!inTaskList) { html += '<ul data-type="taskList">'; inTaskList = true }
      const checked = taskMatch[1].toLowerCase() === 'x'
      html += `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}></label><div>${parseInlineMd(taskMatch[2])}</div></li>`
      continue
    }

    // 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (ulMatch) {
      flushParagraph(); closeOl(); closeTaskList()
      if (!inUl) { html += '<ul>'; inUl = true }
      const indent = line.match(/^(\s*)/)?.[1].length || 0
      if (indent >= 2 && inUl) {
        html = html.replace(/<\/li>$/, `<ul><li>${parseInlineMd(ulMatch[1])}</li></ul>`)
      } else {
        html += `<li>${parseInlineMd(ulMatch[1])}</li>`
      }
      continue
    }

    // 有序列表
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/)
    if (olMatch) {
      flushParagraph(); closeUl(); closeTaskList()
      if (!inOl) { html += '<ol>'; inOl = true }
      const indent = line.match(/^(\s*)/)?.[1].length || 0
      if (indent >= 2 && inOl) {
        html = html.replace(/<\/li>$/, `<ol><li>${parseInlineMd(olMatch[1])}</li></ol>`)
      } else {
        html += `<li>${parseInlineMd(olMatch[1])}</li>`
      }
      continue
    }

    // 空行
    if (trimmed === '') {
      flushParagraph(); closeList(); closeQuote()
      if (inTable) flushTable()
      continue
    }

    // 普通段落（累积以处理多行）
    paragraphBuffer = paragraphBuffer ? `${paragraphBuffer} ${trimmed}` : trimmed
  }

  flushParagraph(); closeList(); closeQuote()
  if (inTable) flushTable()
  // 未闭合的代码块自动补全
  if (inCode) html += '</code></pre>'
  return html || '<p></p>'
}

// ── 解析表格行：| a | b | → ['a', 'b'] ──
function parseTableRow(line: string): string[] {
  const trimmed = line.trim()
  // 去除首尾 |
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((c) => c.trim())
}

function parseInlineMd(text: string): string {
  let s = text
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, alt, src, title) => {
    return `<img src="${src}" alt="${alt || ''}"${title ? ` title="${title}"` : ''}>`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, txt, href, title) => {
    return `<a href="${href}"${title ? ` title="${title}"` : ''}>${txt}</a>`
  })
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>')
  s = s.replace(/==(.+?)==/g, '<mark>$1</mark>')
  s = s.replace(/<u>(.+?)<\/u>/g, '<u>$1</u>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
