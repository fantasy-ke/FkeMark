import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import { useEffect } from 'react'
import type { AppSettings } from '../types'
import { TyporaRender } from './plugins/TyporaRender'

interface EditorProps {
  content: string
  onChange: (content: string) => void
  settings: AppSettings
}

export function Editor({ content, onChange, settings }: EditorProps) {
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
      // Typora 风格即时渲染：光标进入节点时显示 Markdown 语法标记
      TyporaRender,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      // 将编辑器内容转换为 Markdown 文本
      const html = editor.getHTML()
      onChange(htmlToMarkdown(html))
    },
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none dark:prose-invert focus:outline-none min-h-full p-8',
        style: `font-size: ${settings.fontSize}px; line-height: 1.8;`,
      },
    },
  })

  // 当外部 content 变化时更新编辑器
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(markdownToHtml(content))
    }
  }, [content, editor])

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">编辑器加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <EditorContent editor={editor} />
    </div>
  )
}

// 简单的 HTML 到 Markdown 转换
function htmlToMarkdown(html: string): string {
  // 创建一个临时 div 来解析 HTML
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
        case 'strong':
        case 'b': result += `**${el.textContent}**`; break
        case 'em':
        case 'i': result += `*${el.textContent}*`; break
        case 'code': result += `\`${el.textContent}\``; break
        case 'pre': result += `\n\`\`\`\n${el.textContent}\n\`\`\`\n\n`; break
        case 'ul':
          result += '\n'
          el.querySelectorAll(':scope > li').forEach(li => {
            result += `- ${li.textContent}\n`
          })
          result += '\n'
          break
        case 'ol':
          result += '\n'
          el.querySelectorAll(':scope > li').forEach((li, idx) => {
            result += `${idx + 1}. ${li.textContent}\n`
          })
          result += '\n'
          break
        case 'blockquote': result += `\n> ${el.textContent}\n\n`; break
        case 'a': result += `[${el.textContent}](${el.getAttribute('href')})`; break
        case 'br': result += '\n'; break
        default: result += el.textContent || ''; break
      }
    }
  }
  
  return result
}

// 简单的 Markdown 到 HTML 转换
function markdownToHtml(md: string): string {
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
      // 处理行内格式
      let processed = trimmed
      processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')
      processed = processed.replace(/`(.+?)`/g, '<code>$1</code>')
      html += `<p>${processed}</p>`
    }
  }
  
  if (inList) html += `</${listType}>`
  
  return html
}
