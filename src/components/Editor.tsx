import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import { useEffect, useCallback, useRef } from 'react'
import type { AppSettings } from '../types'
import { TyporaRender } from './plugins/TyporaRender'

interface EditorProps {
  content: string
  onChange: (content: string) => void
  settings: AppSettings
  onSlashCommand?: (cmd: string) => void
}

export function Editor({ content, onChange, settings, onSlashCommand }: EditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-500 underline' },
      }),
      TextStyle,
      TyporaRender,
    ],
    content: content || '<p></p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(htmlToMarkdown(html))
    },
    editorProps: {
      attributes: {
        class: 'editor-inner',
      },
    },
  })

  // 外部 content 变化时更新编辑器
  useEffect(() => {
    if (editor && content !== htmlToMarkdown(editor.getHTML())) {
      editor.commands.setContent(markdownToHtml(content))
    }
  }, [content, editor])

  // 应用设置到编辑器 DOM
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement
    // 字号
    el.style.fontSize = `${settings.fontSize}px`
    // 行高
    const lhMap = { compact: '1.5', normal: '1.8', relaxed: '2.2' }
    el.style.lineHeight = lhMap[settings.lineHeight] || '1.8'
    // 编辑区宽度
    const ewMap = { narrow: '680px', medium: '800px', wide: '960px' }
    el.style.maxWidth = ewMap[settings.editorWidth] || '800px'
    // 显示/隐藏 Markdown 标记
    if (settings.showMarkers) {
      document.body.classList.remove('hide-markers')
    } else {
      document.body.classList.add('hide-markers')
    }
  }, [editor, settings.fontSize, settings.lineHeight, settings.editorWidth, settings.showMarkers])

  // 自动补全括号
  useEffect(() => {
    if (!editor || !settings.autoBracket) return
    const handler = (e: KeyboardEvent) => {
      if (!editor.isFocused) return
      const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
      const closing = pairs[e.key]
      if (closing) {
        e.preventDefault()
        editor.commands.insertContent(`${e.key}${closing}`)
        editor.commands.focus()
        // 光标左移一位
        setTimeout(() => {
          const { from } = editor.state.selection
          editor.commands.setTextSelection(from - 1)
        }, 0)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editor, settings.autoBracket])

  // 工具栏命令
  const execCmd = useCallback(
    (cmd: string) => {
      if (!editor) return
      switch (cmd) {
        case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
        case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
        case 'bold': editor.chain().focus().toggleBold().run(); break
        case 'italic': editor.chain().focus().toggleItalic().run(); break
        case 'code': editor.chain().focus().toggleCode().run(); break
        case 'quote': editor.chain().focus().toggleBlockquote().run(); break
        case 'list': editor.chain().focus().toggleBulletList().run(); break
        case 'slash': onSlashCommand?.('slash'); break
      }
    },
    [editor, onSlashCommand]
  )

  if (!editor) {
    return (
      <div className="editor-area">
        <div className="welcome-screen">
          <div className="welcome-tagline" style={{ fontSize: 14 }}>编辑器加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-area">
      <div className="editor-pane">
        {/* 工具栏 */}
        <div className="editor-toolbar">
          <button className="tb-btn" title="标题 1" onClick={() => execCmd('h1')}><strong>H1</strong></button>
          <button className="tb-btn" title="标题 2" onClick={() => execCmd('h2')}><strong>H2</strong></button>
          <button className="tb-btn" title="粗体 (Ctrl+B)" onClick={() => execCmd('bold')}><strong>B</strong></button>
          <button className="tb-btn" title="斜体 (Ctrl+I)" onClick={() => execCmd('italic')}><em>I</em></button>
          <button className="tb-btn" title="行内代码" onClick={() => execCmd('code')}>&lt;/&gt;</button>
          <button className="tb-btn" title="引用" onClick={() => execCmd('quote')}>❝</button>
          <button className="tb-btn" title="列表" onClick={() => execCmd('list')}>≡</button>
          <span style={{ flex: 1 }} />
          <button className="tb-btn" title="命令菜单 (/)" onClick={() => execCmd('slash')}>/</button>
        </div>

        {/* 编辑器滚动容器 + 行号 */}
        <div className="editor-scroll" ref={scrollRef} style={{ position: 'relative' }}>
          {settings.showLineNumbers && <LineNumbers content={content} />}
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="focus-overlay" />
    </div>
  )
}

// ─── 行号组件 ───
function LineNumbers({ content }: { content: string }) {
  const lines = content.split('\n').length
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '40px',
        paddingTop: '40px',
        textAlign: 'right',
        paddingRight: '8px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--muted)',
        userSelect: 'none',
        pointerEvents: 'none',
        lineHeight: '1.8',
        opacity: 0.5,
      }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <div key={i}>{i + 1}</div>
      ))}
    </div>
  )
}

// ─── HTML → Markdown ───
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
        case 'h1': result += `\n# ${el.textContent}\n\n`; break
        case 'h2': result += `\n## ${el.textContent}\n\n`; break
        case 'h3': result += `\n### ${el.textContent}\n\n`; break
        case 'h4': result += `\n#### ${el.textContent}\n\n`; break
        case 'h5': result += `\n##### ${el.textContent}\n\n`; break
        case 'h6': result += `\n###### ${el.textContent}\n\n`; break
        case 'p': result += `\n${el.textContent}\n\n`; break
        case 'strong': case 'b': result += `**${el.textContent}**`; break
        case 'em': case 'i': result += `*${el.textContent}*`; break
        case 'code': result += `\`${el.textContent}\``; break
        case 'pre': result += `\n\`\`\`\n${textContent(el)}\n\`\`\`\n\n`; break
        case 'ul':
          result += '\n'
          el.querySelectorAll(':scope > li').forEach((li: Element) => {
            result += `- ${textContent(li as HTMLElement)}\n`
          })
          result += '\n'
          break
        case 'ol':
          result += '\n'
          el.querySelectorAll(':scope > li').forEach((li: Element, idx: number) => {
            result += `${idx + 1}. ${textContent(li as HTMLElement)}\n`
          })
          result += '\n'
          break
        case 'blockquote': result += `\n> ${textContent(el)}\n\n`; break
        case 'a': result += `[${el.textContent}](${el.getAttribute('href')})`; break
        case 'br': result += '\n'; break
        default: result += textContent(el) || ''; break
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

// ─── Markdown → HTML ───
function markdownToHtml(md: string): string {
  if (!md) return '<p></p>'
  const lines = md.split('\n')
  let html = ''
  let inList = false
  let listType = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      if (inList) { html += `</${listType}>`; inList = false }
      html += `<h1>${trimmed.slice(2)}</h1>`
    } else if (trimmed.startsWith('## ')) {
      if (inList) { html += `</${listType}>`; inList = false }
      html += `<h2>${trimmed.slice(3)}</h2>`
    } else if (trimmed.startsWith('### ')) {
      if (inList) { html += `</${listType}>`; inList = false }
      html += `<h3>${trimmed.slice(4)}</h3>`
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList || listType !== 'ul') {
        if (inList) html += `</${listType}>`
        html += '<ul>'
        listType = 'ul'
        inList = true
      }
      html += `<li>${trimmed.slice(2)}</li>`
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        if (inList) html += `</${listType}>`
        html += '<ol>'
        listType = 'ol'
        inList = true
      }
      html += `<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`
    } else if (trimmed === '') {
      if (inList) { html += `</${listType}>`; inList = false }
      html += '<p></p>'
    } else {
      if (inList) { html += `</${listType}>`; inList = false }
      let processed = trimmed
      processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')
      processed = processed.replace(/`(.+?)`/g, '<code>$1</code>')
      html += `<p>${processed}</p>`
    }
  }
  if (inList) html += `</${listType}>`
  return html || '<p></p>'
}
