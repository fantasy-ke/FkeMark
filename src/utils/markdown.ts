/**
 * HTML ↔ Markdown 双向转换工具
 * 
 * 支持完整的 Markdown 语法：
 * - 标题 (h1-h6)
 * - 粗体/斜体/删除线/下划线/高亮/行内代码
 * - 代码块（带语言标识）
 * - 有序/无序/任务列表（嵌套）
 * - 引用块（嵌套）
 * - 表格（标准结构 + TipTap 结构）
 * - 链接/图片（含尺寸信息）
 * - 水平分割线
 */

// ════════════════════════════════════════════════
//  HTML → Markdown（递归 DOM 遍历，支持嵌套 + 表格 + 任务列表）
// ════════════════════════════════════════════════

export function htmlToMarkdown(html: string): string {
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
          // 保留图片尺寸信息（如果有自定义宽度/高度）
          const style = el.getAttribute('style') || ''
          const wMatch = style.match(/width:\s*(\d+(?:\.\d+)?)(px|%)/)
          const hMatch = style.match(/height:\s*(\d+(?:\.\d+)?)(px|%)/)
          let sizeSuffix = ''
          if (wMatch || hMatch) {
            const w = wMatch ? `${wMatch[1]}${wMatch[2]}` : ''
            const h = hMatch ? `${hMatch[1]}${hMatch[2]}` : ''
            sizeSuffix = ` <!-- size:${w}x${h} -->`
          }
          result += `![${alt}](${src}${title ? ` "${title}"` : ''})${sizeSuffix}`
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
// 兼容两种结构：
//   ① 标准结构：<thead><tr><th></th></tr></thead><tbody><tr><td></td></tr></tbody>
//   ② TipTap 输出：无 <thead>，表头 <th> 直接放在 <tbody> 的 <tr> 内
function tableToMd(el: HTMLElement): string {
  const rows: string[][] = []

  // 收集一个 <tr> 的单元格（同时处理 th 与 td，仅取直接子元素，避免嵌套表格干扰）
  const collectRow = (tr: HTMLElement) => {
    const cells = Array.from(tr.children)
      .filter((c) => {
        const tag = c.tagName.toLowerCase()
        return tag === 'th' || tag === 'td'
      })
      .map((c) => textContent(c as HTMLElement).trim())
    rows.push(cells)
  }

  const thead = el.querySelector('thead')
  const tbody = el.querySelector('tbody')
  if (thead) {
    // 有 thead：表头行来自 thead，表体来自 tbody
    const tr = thead.querySelector('tr')
    if (tr) collectRow(tr as HTMLElement)
    if (tbody) {
      for (const tr of Array.from(tbody.querySelectorAll('tr'))) collectRow(tr as HTMLElement)
    }
  } else if (tbody) {
    // 无 thead（TipTap 结构）：所有行都在 tbody，第一行作表头
    for (const tr of Array.from(tbody.querySelectorAll('tr'))) collectRow(tr as HTMLElement)
  } else {
    // 兜底：直接取所有 tr
    for (const tr of Array.from(el.querySelectorAll('tr'))) collectRow(tr as HTMLElement)
  }

  if (rows.length === 0) return ''
  // 列数取所有行的最大值，避免空表头导致 colCount=0
  const colCount = Math.max(...rows.map((r) => r.length))
  if (colCount === 0) return ''
  const pad = (r: string[]) => r.concat(Array(colCount).fill('')).slice(0, colCount)

  // 对齐：默认左对齐（:---）；如单元格带 text-align 样式则按其值
  const alignStr = (a: string) => {
    if (a === 'center') return ':---:'
    if (a === 'right') return '---:'
    if (a === 'left') return ':---'
    return '---'
  }
  const headerAligns = pad(rows[0]).map((_, idx) => {
    const tr = (thead?.querySelector('tr') ?? tbody?.querySelectorAll('tr')[0]) as HTMLElement | undefined
    const cell = tr?.children[idx] as HTMLElement | undefined
    const align = cell?.getAttribute('align') || cell?.style?.textAlign || 'left'
    return (['left', 'center', 'right'].includes(align) ? align : 'left') as 'left' | 'center' | 'right'
  })
  const sep = headerAligns.map(alignStr)

  const lines: string[] = []
  lines.push('| ' + pad(rows[0]).join(' | ') + ' |')
  lines.push('| ' + sep.join(' | ') + ' |')
  for (let i = 1; i < rows.length; i++) {
    lines.push('| ' + pad(rows[i]).join(' | ') + ' |')
  }
  return lines.join('\n')
}

export function textContent(el: HTMLElement): string {
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

export function markdownToHtml(md: string): string {
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
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\s*<!--\s*size:([^\s]*?)x([^\s]*?)\s*-->)?/g, (_m, alt, src, title, width, height) => {
    let style = ''
    if (width) style += `width:${width};`
    if (height) style += `height:${height};`
    return `<img src="${src}" alt="${alt || ''}"${title ? ` title="${title}"` : ''}${style ? ` style="${style}"` : ''}>`
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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
