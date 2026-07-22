/**
 * 导入导出系统
 * - 导出：MD / HTML / TXT / PDF / DOCX / ePub / RTF / OPML
 * - 导入：MD / HTML / TXT 转 Markdown
 * - 格式校验、冲突处理、数据完整性检查
 */
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { isTauri } from './tauri'
import { showAlert } from '../components/ConfirmDialog'
import { markdownToPreviewHtml } from './markdown.engine'
import { translate, type Lang } from '../i18n'
import { buildDocx, buildEpub, buildOpml, buildRtf } from './exportFormats'

// ── 支持的格�?──
export const EXPORT_FORMATS = ['md', 'html', 'txt', 'pdf', 'docx', 'epub', 'rtf', 'opml'] as const
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

// ── HTML �?Markdown 简易转�?──
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
export function convertForExport(content: string, format: ExportFormat, lang: Lang = 'zh-CN'): string {
  switch (format) {
    case 'md':
      return content
    case 'html': {
      const body = markdownToPreviewHtml(content)
      return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${translate(lang, 'export.printTitle')}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #1f2937; }
h1, h2, h3 { margin-top: 1.5em; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #e5e7eb; padding-left: 16px; color: #6b7280; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #e5e7eb; padding: 8px 12px; }
th { background: #f3f4f6; }
img { max-width: 100%; border-radius: 8px; }
</style>
</head>
<body>
${body}
</body>
</html>`
    }
    case 'rtf':
      return buildRtf(content, lang)
    case 'opml':
      return buildOpml(content, lang)
    case 'docx':
    case 'epub':
      throw new Error(`${format.toUpperCase()} is a binary export format`)
    case 'txt':
      // 纯文本：去除 Markdown 标记
      return content
        .replace(/^#{1,6}\s+/gm, '')    // 标题标记
        .replace(/\*\*(.+?)\*\*/g, '$1') // 粗体
        .replace(/\*(.+?)\*/g, '$1')     // 斜体
        .replace(/~~(.+?)~~/g, '$1')     // 删除�?
        .replace(/`(.+?)`/g, '$1')       // 行内代码
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim()) // 代码块围�?
        .replace(/>\s+/gm, '')           // 引用
        .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)') // 链接
        .replace(/!\[(.+?)\]\((.+?)\)/g, '[$1] $2') // 图片
        .replace(/^[-*+]\s+/gm, '- ')    // 列表
    default:
      return content
  }
}


// ── 导出文件（Tauri 环境）──
interface ExportFileInfo {
  extension: string
  mimeType: string
  binary: boolean
}

const EXPORT_FILE_INFO: Record<Exclude<ExportFormat, 'pdf'>, ExportFileInfo> = {
  md: { extension: 'md', mimeType: 'text/markdown', binary: false },
  html: { extension: 'html', mimeType: 'text/html', binary: false },
  txt: { extension: 'txt', mimeType: 'text/plain', binary: false },
  docx: { extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', binary: true },
  epub: { extension: 'epub', mimeType: 'application/epub+zip', binary: true },
  rtf: { extension: 'rtf', mimeType: 'application/rtf', binary: false },
  opml: { extension: 'opml', mimeType: 'text/x-opml', binary: false },
}

async function buildExportContent(content: string, format: Exclude<ExportFormat, 'pdf'>, lang: Lang): Promise<string | Uint8Array> {
  if (format === 'docx') return buildDocx(content, lang)
  if (format === 'epub') return buildEpub(content, lang)
  return convertForExport(content, format, lang)
}

// ── 导出文件（Tauri / 浏览器）──
export async function exportFile(content: string, format: ExportFormat, lang: Lang = 'zh-CN'): Promise<boolean> {
  if (format === 'pdf') return exportToPdf(content, lang)

  const info = EXPORT_FILE_INFO[format]
  try {
    if (isTauri()) {
      const filePath = await saveDialog({
        defaultPath: `document.${info.extension}`,
        filters: [{ name: format.toUpperCase(), extensions: [info.extension] }],
      })
      if (!filePath) return false

      const exportContent = await buildExportContent(content, format, lang)
      if (exportContent instanceof Uint8Array) {
        await invoke('write_binary_file', { filePath, data: Array.from(exportContent) })
      } else {
        await invoke('write_file_command', { path: filePath, content: exportContent })
      }
      return true
    }

    const exportContent = await buildExportContent(content, format, lang)
    const blobContent: BlobPart = typeof exportContent === 'string'
      ? exportContent
      : new Uint8Array(exportContent).buffer
    const blob = new Blob([blobContent], {
      type: info.binary ? info.mimeType : `${info.mimeType};charset=utf-8`,
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `document.${info.extension}`
    anchor.click()
    URL.revokeObjectURL(url)
    return true
  } catch (e) {
    console.error('Export failed:', e)
    return false
  }
}

// ── 导出 PDF（通过浏览器打�?API）──
export async function exportToPdf(content: string, lang: Lang = 'zh-CN'): Promise<boolean> {
  // �?Markdown 转为带打印样式的 HTML，在隐藏 iframe 中打开打印
  const html = buildPrintHtml(content, lang)

  // 创建隐藏 iframe
  const existingIframe = document.getElementById('pdf-export-frame') as HTMLIFrameElement | null
  if (existingIframe) {
    existingIframe.remove()
  }

  const iframe = document.createElement('iframe')
  iframe.id = 'pdf-export-frame'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  return new Promise((resolve) => {
    iframe.onload = () => {
      try {
        const doc = iframe.contentWindow?.document
        if (!doc) {
          resolve(false)
          return
        }
        // 延迟一点确保渲染完�?
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            // 打印对话框关闭后清理
            setTimeout(() => {
              iframe.remove()
            }, 1000)
            resolve(true)
          } catch (e) {
            console.error('Print failed:', e)
            iframe.remove()
            resolve(false)
          }
        }, 300)
      } catch (e) {
        console.error('PDF export failed:', e)
        iframe.remove()
        resolve(false)
      }
    }

    // 写入 HTML 内容
    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    } else {
      // 降级：直接在新窗口打开
      const w = window.open('', '_blank')
      if (w) {
        w.document.open()
        w.document.write(html)
        w.document.close()
        setTimeout(() => {
          w.print()
          resolve(true)
        }, 500)
      } else {
        resolve(false)
      }
    }
  })
}

// ── 构建打印�?HTML ──
function buildPrintHtml(markdownContent: string, lang: Lang = 'zh-CN'): string {
  // 复用 convertForExport �?HTML 转换
  const bodyHtml = convertForExport(markdownContent, 'html', lang)
  // 提取 <body> 内的内容
  const bodyMatch = bodyHtml.match(/<body>([\s\S]*)<\/body>/)
  const innerHtml = bodyMatch ? bodyMatch[1] : bodyHtml

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${translate(lang, 'export.printTitle')}</title>
<style>
  @page {
    size: A4;
    margin: 2cm 2.5cm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 12pt;
    line-height: 1.8;
    color: #1f2937;
    max-width: 100%;
    margin: 0;
    padding: 0;
  }
  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.8em;
    margin-bottom: 0.6em;
    page-break-after: avoid;
    break-after: avoid;
  }
  h1 { font-size: 22pt; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  h2 { font-size: 18pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 15pt; }
  h4 { font-size: 13pt; }
  p { margin: 0.8em 0; }
  a { color: #c96442; text-decoration: none; }
  code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "SF Mono", "JetBrains Mono", "Fira Code", monospace;
    font-size: 0.9em;
  }
  pre {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    page-break-inside: avoid;
    break-inside: avoid;
    border: 1px solid #e5e7eb;
  }
  pre code {
    background: none;
    padding: 0;
    font-size: 10pt;
    line-height: 1.5;
  }
  blockquote {
    border-left: 3px solid #c96442;
    padding-left: 16px;
    margin: 1em 0;
    color: #6b7280;
    page-break-inside: avoid;
  }
  ul, ol {
    padding-left: 24px;
    margin: 0.6em 0;
  }
  li { margin: 0.3em 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    page-break-inside: avoid;
    font-size: 11pt;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background: #f3f4f6;
    font-weight: 600;
  }
  img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    page-break-inside: avoid;
  }
  hr {
    border: none;
    border-top: 2px solid #e5e7eb;
    margin: 2em 0;
  }
  /* 代码高亮简�?*/
  .hljs-keyword, .hljs-built_in { color: #c678dd; }
  .hljs-string { color: #98c379; }
  .hljs-comment { color: #7f848e; font-style: italic; }
  .hljs-number { color: #d19a66; }
  .hljs-function, .hljs-title { color: #61afef; }
  .hljs-tag, .hljs-name { color: #e06c75; }
  .hljs-attr { color: #d19a66; }
</style>
</head>
<body>
${innerHtml}
</body>
</html>`
}

// ── 导入文件 ──
export async function importFile(lang: Lang = 'zh-CN'): Promise<{ content: string; fileName: string } | null> {
  if (!isTauri()) {
    // 浏览器环�?
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
          void showAlert(translate(lang, validation.error ?? 'import.validationFailed'), translate(lang, 'import.fail'))
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
      void showAlert(translate(lang, validation.error ?? 'import.validationFailed'), translate(lang, 'import.fail'))
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
