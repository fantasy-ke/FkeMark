import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextStyle from '@tiptap/extension-text-style'
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
import type { AppSettings, EditorMode } from '../types'
import { TyporaRender } from './plugins/TyporaRender'
import { SlashMenu, type SlashCommand } from './SlashMenu'

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
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [slashState, setSlashState] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  })
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; text: string }>({
    open: false, url: '', text: '',
  })
  // 浮动语法提示（焦点左上方）
  const [syntaxHint, setSyntaxHint] = useState<{ text: string; x: number; y: number } | null>(null)

  const editorRef = useRef<TiptapEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'md-link' },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      TextStyle,
      TyporaRender,
    ],
    content: content || '<p></p>',
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
      // 块级前缀：heading / blockquote / codeBlock / listItem
      const block = $from.parent
      if (block.type.name === 'heading') {
        parts.push('#'.repeat(block.attrs.level) + ' ')
      } else if (block.type.name === 'blockquote') {
        parts.push('> ')
      } else if (block.type.name === 'codeBlock') {
        parts.push('```')
      }
      // 列表项前缀
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
        }
        depth--
      }
      // 行内 mark（简短标记）
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
    view: { state: { selection: { $from: { start: () => number; parent: { textContent: string }; parentOffset: number } } } }
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
        // ``` 或 ```lang 回车 → 代码块
        const fenceMatch = textBefore.match(/^```(\w*)\s*$/)
        if (fenceMatch) {
          event.preventDefault()
          const from = $from.start()
          const to = from + parent.textContent.length
          ed.chain().focus().deleteRange({ from, to }).setCodeBlock().run()
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
      case 'code': insertInlineMark('code', '代码'); break
      case 'codeblock': editor.chain().focus().setCodeBlock().run(); break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'image': openImagePicker(); break
      case 'link': openLinkDialog(); break
    }
    setSlashState((s) => ({ ...s, open: false }))
  }, [editor])

  // ── 应用设置 ──
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement
    el.style.fontSize = `${settings.fontSize}px`
    const lhMap = { compact: '1.5', normal: '1.8', relaxed: '2.2' }
    el.style.lineHeight = lhMap[settings.lineHeight] || '1.8'
    const ewMap = { narrow: '680px', medium: '800px', wide: '960px' }
    el.style.maxWidth = ewMap[settings.editorWidth] || '800px'
    if (settings.showMarkers) document.body.classList.remove('hide-markers')
    else document.body.classList.add('hide-markers')
  }, [editor, settings.fontSize, settings.lineHeight, settings.editorWidth, settings.showMarkers])

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
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'link': openLinkDialog(); break
      case 'image': openImagePicker(); break
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

  const onScrollContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

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
          <div className="editor-toolbar">
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
            <button className="tb-btn" title="有序列表 — 1. 项" onClick={() => execCmd('ol')}>1.</button>
            <button className="tb-btn" title="分割线 — ---" onClick={() => execCmd('hr')}>―</button>
            <span className="tb-sep" />
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
            {minimapOnLeft && <Minimap content={content} scrollRef={scrollRef} />}

            <div
              className={`editor-scroll ${isReadMode ? 'read-mode-scroll' : ''}`}
              ref={scrollRef as React.RefObject<HTMLDivElement>}
              style={{ position: 'relative' }}
              onContextMenu={onScrollContextMenu}
            >
              {settings.showLineNumbers && !isReadMode && <LineNumbers content={content} />}
              <EditorContent editor={editor} />
            </div>

            {minimapOnRight && <Minimap content={content} scrollRef={scrollRef} />}
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

      {/* 链接弹窗 */}
      {linkDialog.open && (
        <div className="link-dialog-overlay" onClick={() => setLinkDialog({ open: false, url: '', text: '' })}>
          <div className="link-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="link-dialog-title">插入链接</div>
            <label className="link-dialog-label">显示文本（可选）</label>
            <input
              className="link-dialog-input"
              type="text"
              value={linkDialog.text}
              placeholder="选中文本将自动填入"
              onChange={(e) => setLinkDialog((s) => ({ ...s, text: e.target.value }))}
            />
            <label className="link-dialog-label">链接地址</label>
            <input
              className="link-dialog-input"
              type="url"
              autoFocus
              value={linkDialog.url}
              placeholder="https://"
              onKeyDown={(e: ReactKeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                if (e.key === 'Escape') setLinkDialog({ open: false, url: '', text: '' })
              }}
              onChange={(e) => setLinkDialog((s) => ({ ...s, url: e.target.value }))}
            />
            <div className="link-dialog-actions">
              <button className="link-dialog-btn cancel" onClick={() => setLinkDialog({ open: false, url: '', text: '' })}>取消</button>
              <button className="link-dialog-btn ok" onClick={applyLink}>插入</button>
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
            <span className="menu-label">{settings.showMinimap ? '隐藏小地图' : '显示小地图'}</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => { onEditorModeChange('live'); setShowContextMenu(false) }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </span>
            <span className="menu-label">实时编辑模式</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => { onEditorModeChange('read'); setShowContextMenu(false) }}
          >
            <span className="menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            <span className="menu-label">阅读模式</span>
          </button>
        </div>
      )}

      <div className="focus-overlay" />
    </div>
  )
})

// ─── 小地图组件 ───
function Minimap({ content, scrollRef }: { content: string; scrollRef?: RefObject<HTMLDivElement | null> }) {
  const lines = content.split('\n')
  return (
    <div
      className="minimap-panel"
      onClick={(e) => {
        const el = e.currentTarget
        const rect = el.getBoundingClientRect()
        const ratio = (e.clientY - rect.top) / rect.height
        if (scrollRef?.current) {
          scrollRef.current.scrollTop = ratio * scrollRef.current.scrollHeight
        }
      }}
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
        const display = trimmed.slice(0, 20) || ' '
        return (
          <div key={i} style={{ color, fontWeight: weight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {display}
          </div>
        )
      })}
    </div>
  )
}

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
//  HTML → Markdown（递归 DOM 遍历，支持嵌套）
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
          // 代码块：去除尾部多余换行，确保 ``` 闭合正确
          const codeText = textContent(el).replace(/\n$/, '')
          result += `\n\`\`\`\n${codeText}\n\`\`\`\n\n`
          break
        }
        case 'ul':
          result += '\n' + listToMd(el, 'ul', 0) + '\n'
          break
        case 'ol':
          result += '\n' + listToMd(el, 'ol', 0) + '\n'
          break
        case 'blockquote':
          result += '\n' + blockquoteToMd(el, 0) + '\n\n'
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

function textContent(el: HTMLElement): string {
  let t = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      t += child.textContent || ''
    } else if (child instanceof HTMLElement) {
      if (!(child.classList?.contains('md-marker') || child.classList?.contains('md-delimiter'))) {
        t += textContent(child)
      }
    } else if (child instanceof Element) {
      t += child.textContent || ''
    }
  }
  return t
}

// ════════════════════════════════════════════════
//  Markdown → HTML（逐行解析，支持完整语法）
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
  let paragraphBuffer = ''

  const closeUl = () => { if (inUl) { html += '</ul>'; inUl = false } }
  const closeOl = () => { if (inOl) { html += '</ol>'; inOl = false } }
  const closeList = () => { closeUl(); closeOl() }
  const closeQuote = () => {
    if (inQuote) { html += '</blockquote>'; inQuote = false }
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
      if (inCode) {
        // 闭合代码块：补全 </code></pre>
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

    // 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (ulMatch) {
      flushParagraph(); closeOl()
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
      flushParagraph(); closeUl()
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
      continue
    }

    // 普通段落（累积以处理多行）
    paragraphBuffer = paragraphBuffer ? `${paragraphBuffer} ${trimmed}` : trimmed
  }

  flushParagraph(); closeList(); closeQuote()
  // 未闭合的代码块自动补全
  if (inCode) html += '</code></pre>'
  return html || '<p></p>'
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
