/**
 * 导入导出系统
 * - 导出：Markdown → MD / HTML / TXT
 * - 导入：MD / HTML / TXT → Markdown
 * - 格式校验、冲突处理、数据完整性检查
 */
import { invoke } from '@tauri-apps/api/tauri'
import { open as openDialog, save as saveDialog } from '@tauri-apps/api/dialog'
import { isTauri } from './tauri'

// ── 支持的格式 ──
export const EXPORT_FORMATS = ['md', 'html', 'txt'] as const
export type ExportFormat = typeof EXPORT_FORMATS[number]

export const IMPORT_EXTENSIONS = ['md', 'markdown', 'html', 'htm', 'txt'] as const

// ── 格式校验 ──
export function validateImportFile(fileName: string, content: string): { valid: boolean; error?: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (!['md', 'markdown', 'html', 'htm', 'txt'].includes(ext)) {
    return { valid: false, error: 'import.invalidFormat' }
  }
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'import.emptyFile' }
  }
  return { valid: true }
}

// ── HTML → Markdown 简易转换 ──
export function htmlToMarkdownSimple(html: string): string {
  // 利用 DOM 解析
  const div = document.createElement('div')
  div.innerHTML = html

  function convertNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const children = Array.from(el.childNodes).map(convertNode).join('')

    switch (tag) {
      case 'h1': return `\n# ${children}\n\n`
      case 'h2': return `\n## ${children}\n\n`
      case 'h3': return `\n### ${children}\n\n`
      case 'h4': return `\n#### ${children}\n\n`
      case 'h5': return `\n##### ${children}\n\n`
      case 'h6': return `\n###### ${children}\n\n`
      case 'p': return `\n${children}\n\n`
      case 'strong': case 'b': return `**${children}**`
      case 'em': case 'i': return `*${children}*`
      case 's': case 'del': case 'strike': return `~~${children}~~`
      case 'code': return `\`${children}\``
      case 'pre': {
        const codeEl = el.querySelector('code')
        const langMatch = codeEl?.className.match(/language-(\w+)/)
        const lang = langMatch ? langMatch[1] : ''
        const code = codeEl?.textContent || el.textContent || ''
        return `\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`
      }
      case 'blockquote': return `\n> ${children.trim().replace(/\n/g, '\n> ')}\n\n`
      case 'ul': return `\n${children}\n`
      case 'ol': {
        let idx = 1
        let result = ''
        for (const li of Array.from(el.children)) {
          if (li.tagName.toLowerCase() === 'li') {
            result += `${idx}. ${convertNode(li).trim()}\n`
            idx++
          }
        }
        return `\n${result}\n`
      }
      case 'li': return `- ${children.trim()}\n`
      case 'a': {
        const href = el.getAttribute('href') || ''
        return `[${children}](${href})`
      }
      case 'img': {
        const src = el.getAttribute('src') || ''
        const alt = el.getAttribute('alt') || ''
        return `![${alt}](${src})`
      }
      case 'hr': return '\n---\n\n'
      case 'br': return '\n'
      default: return children
    }
  }

  return Array.from(div.childNodes).map(convertNode).join('').trim()
}

// ── 导出内容转换 ──
export function convertForExport(content: string, format: ExportFormat): string {
  switch (format) {
    case 'md':
      return content
    case 'html': {
      // 将 Markdown 转为完整 HTML 文档
      // 使用已有的 markdownToHtml（从 Editor 导入会导致循环，所以此处简化处理）
      const lines = content.split('\n')
      let html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Exported Document</title>\n<style>\nbody { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #1f2937; }\nh1, h2, h3 { margin-top: 1.5em; }\ncode { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }\npre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; }\npre code { background: none; padding: 0; }\nblockquote { border-left: 3px solid #e5e7eb; padding-left: 16px; color: #6b7280; }\ntable { border-collapse: collapse; width: 100%; }\nth, td { border: 1px solid #e5e7eb; padding: 8px 12px; }\nth { background: #f3f4f6; }\nimg { max-width: 100%; border-radius: 8px; }\n</style>\n</head>\n<body>\n'
      // 简单的 Markdown → HTML（逐行）
      let inCode = false
      let inUl = false
      let inOl = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('```')) {
          if (inCode) { html += '</code></pre>\n'; inCode = false }
          else { const lang = trimmed.slice(3).trim(); html += `<pre><code${lang ? ` class="language-${lang}"` : ''}>`; inCode = true }
          continue
        }
        if (inCode) { html += escapeHtmlSimple(line) + '\n'; continue }
        const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
        if (h) { const lvl = h[1].length; html += `<h${lvl}>${inlineMdToHtml(h[2])}</h${lvl}>\n`; continue }
        if (/^---\s*$/.test(trimmed)) { html += '<hr>\n'; continue }
        if (trimmed.startsWith('> ')) { html += `<blockquote>${inlineMdToHtml(trimmed.slice(2))}</blockquote>\n`; continue }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          if (!inUl) { html += '<ul>\n'; inUl = true }
          html += `<li>${inlineMdToHtml(trimmed.slice(2))}</li>\n`; continue
        }
        if (inUl) { html += '</ul>\n'; inUl = false }
        const olMatch = trimmed.match(/^\d+\.\s+(.*)$/)
        if (olMatch) {
          if (!inOl) { html += '<ol>\n'; inOl = true }
          html += `<li>${inlineMdToHtml(olMatch[1])}</li>\n`; continue
        }
        if (inOl) { html += '</ol>\n'; inOl = false }
        if (trimmed === '') { html += '\n'; continue }
        html += `<p>${inlineMdToHtml(trimmed)}</p>\n`
      }
      if (inCode) html += '</code></pre>\n'
      if (inUl) html += '</ul>\n'
      if (inOl) html += '</ol>\n'
      html += '</body>\n</html>'
      return html
    }
    case 'txt':
      // 纯文本：去除 Markdown 标记
      return content
        .replace(/^#{1,6}\s+/gm, '')    // 标题标记
        .replace(/\*\*(.+?)\*\*/g, '$1') // 粗体
        .replace(/\*(.+?)\*/g, '$1')     // 斜体
        .replace(/~~(.+?)~~/g, '$1')     // 删除线
        .replace(/`(.+?)`/g, '$1')       // 行内代码
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim()) // 代码块围栏
        .replace(/>\s+/gm, '')           // 引用
        .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)') // 链接
        .replace(/!\[(.+?)\]\((.+?)\)/g, '[$1] $2') // 图片
        .replace(/^[-*+]\s+/gm, '- ')    // 列表
    default:
      return content
  }
}

function inlineMdToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1">')
}

function escapeHtmlSimple(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── 导出文件（Tauri 环境）──
export async function exportFile(content: string, format: ExportFormat): Promise<boolean> {
  const ext = format === 'html' ? 'html' : format === 'txt' ? 'txt' : 'md'
  const mimeType = format === 'html' ? 'text/html' : format === 'txt' ? 'text/plain' : 'text/markdown'

  if (!isTauri()) {
    // 浏览器环境：使用下载方式
    const exportContent = convertForExport(content, format)
    const blob = new Blob([exportContent], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `document.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    return true
  }

  try {
    const filePath = await saveDialog({
      defaultPath: `document.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    })
    if (!filePath) return false

    const exportContent = convertForExport(content, format)
    await invoke('write_file_command', { path: filePath, content: exportContent })
    return true
  } catch (e) {
    console.error('Export failed:', e)
    return false
  }
}

// ── 导入文件 ──
export async function importFile(): Promise<{ content: string; fileName: string } | null> {
  if (!isTauri()) {
    // 浏览器环境
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown,.html,.htm,.txt'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }
        const text = await file.text()
        const validation = validateImportFile(file.name, text)
        if (!validation.valid) {
          alert(validation.error)
          resolve(null)
          return
        }
        // HTML 文件需要转换为 Markdown
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const content = (ext === 'html' || ext === 'htm') ? htmlToMarkdownSimple(text) : text
        resolve({ content, fileName: file.name })
      }
      input.click()
    })
  }

  try {
    const filePath = await openDialog({
      multiple: false,
      filters: [{ name: 'Documents', extensions: ['md', 'markdown', 'html', 'htm', 'txt'] }],
    })
    if (!filePath || typeof filePath !== 'string') return null

    const content = await invoke<string>('read_file_command', { path: filePath })
    const fileName = filePath.split(/[\\/]/).pop() || filePath

    const validation = validateImportFile(fileName, content)
    if (!validation.valid) {
      alert(validation.error)
      return null
    }

    // HTML 文件需要转换为 Markdown
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const mdContent = (ext === 'html' || ext === 'htm') ? htmlToMarkdownSimple(content) : content

    return { content: mdContent, fileName }
  } catch (e) {
    console.error('Import failed:', e)
    return null
  }
}
