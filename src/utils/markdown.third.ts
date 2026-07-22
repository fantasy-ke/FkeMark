/**
 * 第三方 Markdown 引擎（markdown-it + turndown）
 *
 * 与手写引擎（markdown.ts）完全兼容，支持同一套 TipTap 属性：
 * - data-tex / data-display（数学公式无损往返）
 * - data-type="taskList" / data-checked（任务列表）
 * - data-separators（表格分隔行）
 * - data-marker（无序列表符号）
 * - 图片尺寸（<!-- size:WxH -->）
 *
 * 通过 markdown.engine.ts 的路由层切换使用。
 */

import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { toAssetUrl, toRelPath } from './asset'
import { escapeHtml as _escapeHtml } from './markdown'

// ════════════════════════════════════════════════
//  Markdown → HTML（markdown-it 管线）
// ════════════════════════════════════════════════

/**
 * 转义 HTML 属性值（用于 data-tex 等属性）
 */
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 生成数学公式 HTML（与手写引擎 mathToHtml 输出一致）
 */
function mathToHtml(tex: string, display: boolean): string {
  const esc = escapeHtmlAttr(tex)
  const fallback = _escapeHtml(tex)
  return display
    ? `<div class="fk-math fk-math-block" data-tex="${esc}" data-display="true">${fallback}</div>`
    : `<span class="fk-math fk-math-inline" data-tex="${esc}" data-display="false">${fallback}</span>`
}

/**
 * 从 StateBlock 中获取指定行（复刻 markdown-it table 插件模式）
 * markdown-it v14 的 StateBlock 公开 API 是 getLines(begin, end, indent, keepLastLF)，
 * 但没有单行 getLine；这里通过 bMarks/eMarks 直接获取原始行。
 */
function getLine(state: any, lineNum: number): string {
  const pos = state.bMarks[lineNum] + state.tShift[lineNum]
  const max = state.eMarks[lineNum]
  return state.src.slice(pos, max)
}

/**
 * 创建配置好的 markdown-it 实例
 */
function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,       // 不允许原始 HTML（安全 + 与手写引擎行为一致）
    breaks: true,      // 单换行 = <br>
    linkify: true,     // 自动链接
    typographer: false,
  })

  // 启用 GFM 扩展
  md.enable(['table', 'strikethrough'])

  // ── 自定义块级规则：数学公式 $$...$$ ──
  md.block.ruler.before('fence', 'math_block', (state: any, startLine: number, endLine: number, _silent: boolean) => {
    const line = getLine(state, startLine).trim()
    // 单行 $$...$$
    const inlineMatch = line.match(/^\$\$(.+)\$\$$/)
    if (inlineMatch) {
      const token = state.push('math_block', '', 0)
      token.content = inlineMatch[1]
      token.info = 'display'
      state.line = startLine + 1
      return true
    }
    // 多行 $$...$$
    if (/^\$\$\s*$/.test(line)) {
      let next = startLine + 1
      const lines: string[] = []
      for (; next < endLine; next++) {
        const nl = getLine(state, next).trim()
        if (/^\$\$\s*$/.test(nl)) break
        lines.push(getLine(state, next))
      }
      if (next < endLine) {
        const token = state.push('math_block', '', 0)
        token.content = lines.join('\n')
        token.info = 'display'
        state.line = next + 1
        return true
      }
    }
    return false
  })
  md.renderer.rules.math_block = (tokens, idx) => {
    const token = tokens[idx]
    return mathToHtml(token.content, true)
  }

  // ── 自定义块级规则：\[ ... \] ──
  md.block.ruler.before('math_block', 'math_bracket_block', (state: any, startLine: number, endLine: number, _silent: boolean) => {
    const line = getLine(state, startLine).trim()
    const singleMatch = line.match(/^\\\[(.+)\\\]$/)
    if (singleMatch) {
      const token = state.push('math_block', '', 0)
      token.content = singleMatch[1]
      token.info = 'display'
      state.line = startLine + 1
      return true
    }
    if (/^\\\[\s*$/.test(line)) {
      let next = startLine + 1
      const lines: string[] = []
      for (; next < endLine; next++) {
        const nl = getLine(state, next).trim()
        if (/^\\\]\s*$/.test(nl)) break
        lines.push(getLine(state, next))
      }
      if (next < endLine) {
        const token = state.push('math_block', '', 0)
        token.content = lines.join('\n')
        token.info = 'display'
        state.line = next + 1
        return true
      }
    }
    return false
  })

  // ── 自定义行内规则：\( ... \) ──
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const match = state.src.slice(state.pos).match(/^\\\((.+?)\\\)/)
    if (!match) return false
    if (!silent) {
      const token = state.push('math_inline', '', 0)
      token.content = match[1]
    }
    state.pos += match[0].length
    return true
  })
  md.renderer.rules.math_inline = (tokens, idx) => {
    return mathToHtml(tokens[idx].content, false)
  }

  // ── 自定义行内规则：==高亮== ──
  md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
    const match = state.src.slice(state.pos).match(/^==(.+?)==/)
    if (!match) return false
    if (!silent) {
      const token = state.push('highlight', '', 0)
      token.content = match[1]
    }
    state.pos += match[0].length
    return true
  })
  md.renderer.rules.highlight = (tokens, idx) => {
    return `<mark>${md.utils.escapeHtml(tokens[idx].content)}</mark>`
  }

  // ── 自定义行内规则：图片尺寸（捕获 <!-- size:WxH --> 注释）──
  // 重写 image 渲染器以支持尺寸注释
  const defaultImageRender = md.renderer.rules.image!
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    // 查找图片后的 size 注释（在原始 MD 中紧挨着 ![xxx](yyy) 的注释）
    const nextIdx = idx + 1
    let style = ''
    if (nextIdx < tokens.length) {
      const nextToken = tokens[nextIdx]
      if (nextToken.type === 'html_inline' && nextToken.content) {
        const sizeMatch = nextToken.content.match(/<!--\s*size:\s*([^\s]*?)x([^\s]*?)\s*-->/)
        if (sizeMatch) {
          const width = sizeMatch[1]
          const height = sizeMatch[2]
          if (width) style += `width:${width};`
          if (height) style += `height:${height};`
          // 标记该 token 已被消费
          nextToken.content = ''
        }
      }
    }
    let result = defaultImageRender(tokens, idx, options, env, self)
    if (style) {
      result = result.replace(/>$/, ` style="${style}">`)
    }
    return result
  }

  return md
}

/**
 * 预处理器：在 markdown-it 解析前转换任务列表
 * 把 - [ ] / - [x] 转为带标记的普通列表项，然后在渲染器中检测
 *
 * 策略：给包含任务列表的 li 添加 data-type="taskItem" 属性
 * 通过在预处理阶段注入 HTML 属性标记实现
 */
function preprocessTaskList(mdText: string): { text: string; tasks: Map<number, boolean> } {
  const tasks = new Map<number, boolean>()
  let lineIdx = 0
  const lines = mdText.split('\n')
  const result = lines.map((line) => {
    const match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (match) {
      const checked = match[2].toLowerCase() === 'x'
      tasks.set(lineIdx, checked)
      lineIdx++
      // 保留为普通列表项（markdown-it 会正常解析），内容前缀注入非 HTML 标记
      // 在 postProcessTaskLists 中根据 tasks map 重建 HTML
      return `${match[1]}- @@TASK:${checked ? '1' : '0'}@@ ${match[3]}`
    }
    lineIdx++
    return line
  })
  return { text: result.join('\n'), tasks }
}

/**
 * 后处理器：将 markdown-it 输出的普通列表 HTML 中的任务列表项
 * 转换回 TipTap 兼容的任务列表结构
 */
function postProcessTaskLists(html: string): string {
  // 模式：<ul>\s*<li>@@TASK:(0|1)@@... → 重写为 taskList
  // 使用逐行处理 + 状态机

  const lines = html.split('\n')
  const result: string[] = []
  let i = 0
  let inUl = false
  let ulBuffer: string[] = []
  let hasTaskItems = false

  while (i < lines.length) {
    const line = lines[i]

    if (/^\s*<ul[^>]*>\s*$/.test(line)) {
      // 进入 ul，缓冲直到 </ul>
      inUl = true
      ulBuffer = [line]
      hasTaskItems = false
      i++
      continue
    }

    if (inUl) {
      ulBuffer.push(line)
      // 检测 task 标记
      if (/@@TASK:(0|1)@@/.test(line)) {
        hasTaskItems = true
      }
      if (/^\s*<\/ul>\s*$/.test(line)) {
        // ul 结束
        if (hasTaskItems) {
          result.push(...rewriteTaskList(ulBuffer))
        } else {
          result.push(...ulBuffer)
        }
        inUl = false
        ulBuffer = []
        hasTaskItems = false
      }
      i++
      continue
    }

    result.push(line)
    i++
  }

  // 兜底
  if (inUl && ulBuffer.length > 0) {
    result.push(...ulBuffer)
  }

  return result.join('\n')
}

/**
 * 重写一个 <ul> 块为 taskList 结构
 */
function rewriteTaskList(ulLines: string[]): string[] {
  const result: string[] = []
  // 替换 ul open tag
  const openLine = ulLines[0].replace(/<ul[^>]*>/, '<ul data-type="taskList">')
  result.push(openLine)

  for (let i = 1; i < ulLines.length - 1; i++) {
    let line = ulLines[i]
    const taskMatch = line.match(/@@TASK:(0|1)@@/)
    if (taskMatch) {
      const checked = taskMatch[1] === '1'
      // 移除 task 标记
      line = line.replace(/@@TASK:(0|1)@@/, '')
      // 给 li 添加 data-type / data-checked
      line = line.replace(
        /<li(>|\s)/,
        `<li data-type="taskItem" data-checked="${checked}"$1`,
      )
      // 在 li 内容前插入 checkbox label
      line = line.replace(
        /(<li[^>]*>)/,
        `$1<label><input type="checkbox"${checked ? ' checked="checked"' : ''}></label><div>`,
      )
      // 在 li 闭合前闭合 div
      line = line.replace(/<\/li>/, '</div></li>')
    }
    result.push(line)
  }

  // close tag
  result.push(ulLines[ulLines.length - 1])
  return result
}

/**
 * 后处理：处理图片 src 路径（与手写引擎 toAssetUrl 一致）
 */
function postProcessImageSrc(html: string, docDir?: string | null): string {
  if (!docDir) return html
  // 简单替换：所有相对路径的 src → asset URL
  return html.replace(/src="(?!https?:\/\/|\/|data:|blob:)([^"]+)"/gi, (_m, src) => {
    const url = toAssetUrl(src, docDir!)
    return `src="${url}"`
  })
}

/**
 * Remove empty blockquotes generated by a standalone empty quote line (`>`).
 *
 * markdown-it parses a separated empty quote line as a second empty blockquote.
 * TipTap then adds an empty paragraph to satisfy the blockquote schema, making
 * the editor show a visible empty quote below the real quote text.
 */
function removeEmptyBlockquotes(html: string): string {
  let result = html
  let previous = ''
  const emptyBlockquote = /<blockquote>\s*(?:<p>\s*(?:<br\s*\/?\s*>|&nbsp;| )?\s*<\/p>\s*)*<\/blockquote>\s*/gi

  do {
    previous = result
    result = result.replace(emptyBlockquote, '')
  } while (result !== previous)

  return result
}

function isPipeTableRow(line: string): boolean {
  return /^\|.*\|\s*$/.test(line.trim())
}

function isTableSeparatorRow(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|\s*$/.test(line.trim())
}

function isFenceLine(line: string): boolean {
  return /^(```|~~~)/.test(line.trim())
}

/**
 * 兼容从聊天/文档复制来的“松散表格”：表格行之间多了空行。
 * markdown-it 遵循严格 GFM 规则，空行会结束表格块；这里只移除表格块内部空行。
 */
function normalizeLooseTables(mdText: string): string {
  const lines = mdText.split('\n')
  const result: string[] = []
  let inFence = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (isFenceLine(line)) {
      inFence = !inFence
      result.push(line)
      i++
      continue
    }

    if (!inFence && isPipeTableRow(line)) {
      const rows: string[] = []
      let j = i

      while (j < lines.length) {
        if (isPipeTableRow(lines[j])) {
          rows.push(lines[j])
          j++
          continue
        }

        if (lines[j].trim() === '') {
          let next = j + 1
          while (next < lines.length && lines[next].trim() === '') next++
          if (next < lines.length && isPipeTableRow(lines[next])) {
            j++
            continue
          }
        }

        break
      }

      if (rows.length >= 2 && !isTableSeparatorRow(rows[0]) && isTableSeparatorRow(rows[1])) {
        result.push(...rows)
        i = j
        continue
      }
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}

/**
 * markdown → TipTap 兼容 HTML
 */
export function markdownToHtml(md: string, docDir?: string | null): string {
  if (!md) return '<p></p>'

  // 0. 兼容表格行之间误插入空行的 Markdown，再提取元数据
  const normalizedMd = normalizeLooseTables(md)
  const tableSeparators = extractTableSeparators(normalizedMd)
  const listMarkers = extractListMarkers(normalizedMd)

  const mdInstance = createMarkdownIt()

  // 1. 预处理任务列表
  const preprocessed = preprocessTaskList(normalizedMd)

  // 2. markdown-it 解析
  let html = mdInstance.render(preprocessed.text)

  // 3. 后处理：任务列表重建
  html = postProcessTaskLists(html)

  // 4. 后处理：注入列表 marker（从原始 MD 的列表块提取）
  html = injectDataMarkers(html, listMarkers)

  // 5. 后处理：注入表格分隔行
  html = injectTableSeparators(html, tableSeparators)

  // 6. 后处理：图片 src 路径
  html = postProcessImageSrc(html, docDir)

  // 7. 后处理：去掉空引用块，避免 TipTap 补出可见空段落
  html = removeEmptyBlockquotes(html)

  // 8. 归一化连续空行
  html = (html || '<p></p>').replace(/\n{3,}/g, '\n\n')

  return html.trim() ? html : '<p></p>'
}

/**
 * 从原始 MD 中提取表格分隔行（用于注入 data-separators）
 */
function extractTableSeparators(mdText: string): string[] {
  const separators: string[] = []
  const lines = mdText.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    const nextLine = lines[i + 1].trim()
    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:-]+\|/.test(nextLine)) {
      const sep = nextLine
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((s) => s.trim())
        .join('|')
      separators.push(sep)
    }
  }
  return separators
}

/**
 * 从原始 MD 中提取无序列表块的标记符号（排除任务列表）
 */
function extractListMarkers(mdText: string): string[] {
  const markers: string[] = []
  const lines = mdText.split('\n')
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trimStart()
    const ulMatch = trimmed.match(/^([*+\-])\s+(?!\[[ xX]\])/)
    if (ulMatch) {
      markers.push(ulMatch[1])
      // 跳到该列表块结束
      i++
      while (i < lines.length) {
        const t = lines[i].trimStart()
        if (t.match(/^[*+\-]\s+(?!\[[ xX]\])/) || t.match(/^\d+\.\s/)) { i++; continue }
        if (t === '') { i++; continue }
        break
      }
    } else {
      i++
    }
  }
  return markers
}

/**
 * 向 HTML 中的 <ul> 元素注入 data-marker（非嵌套列表）
 */
function injectDataMarkers(html: string, markers: string[]): string {
  const div = document.createElement('div')
  div.innerHTML = html
  const uls = div.querySelectorAll('ul:not([data-type])')
  let markerIdx = 0

  for (const ul of uls) {
    const parentLi = ul.closest('li')
    if (parentLi) {
      // 嵌套列表继承父级 <ul> 的 marker
      const parentUl = parentLi.closest('ul')
      if (parentUl) {
        const pm = parentUl.getAttribute('data-marker')
        if (pm) ul.setAttribute('data-marker', pm)
      }
      continue
    }
    if (markerIdx < markers.length) {
      ul.setAttribute('data-marker', markers[markerIdx])
      markerIdx++
    }
  }

  return div.innerHTML
}

/**
 * 向 HTML 中的 <table> 元素注入 data-separators
 */
function injectTableSeparators(html: string, separators: string[]): string {
  let idx = 0
  return html.replace(/<table(?!\s[^>]*data-separators)([^>]*)>/g, (_match, attrs: string) => {
    const sep = idx < separators.length ? separators[idx] : null
    idx++
    if (sep) {
      const attrStr = attrs ? ` ${attrs}` : ''
      return `<table${attrStr} data-separators="${sep}">`
    }
    return _match
  })
}

// ════════════════════════════════════════════════
//  HTML → Markdown（turndown 管线）
// ════════════════════════════════════════════════

/**
 * TipTap 表格 HTML 正规化：将 TipTap 内部格式转换为标准 HTML 表格，
 * 确保 turndown GFM 插件能正确识别并输出 Markdown 表格。
 *
 * TipTap 表格 DOM 特征：
 * - <colgroup> 无关元素
 * - <tbody><tr><th><p>...</p></th>...（无 <thead>，<p> 包裹单元格内容）
 *
 * 正规化后：
 * - 移除 <colgroup>
 * - <p> → 直接内容（unwrap）
 * - 第一行含 <th> 则提升到 <thead>
 */
function normalizeTableHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  const tables = div.querySelectorAll('table')
  if (tables.length === 0) return html

  for (const table of tables) {
    // 1. 移除 colgroup
    const colgroup = table.querySelector('colgroup')
    if (colgroup) colgroup.remove()

    // 2. 移除 th/td 中的 <p> 包裹，保留行内内容
    for (const cell of table.querySelectorAll<HTMLElement>('th, td')) {
      const firstP = cell.querySelector('p')
      if (firstP && firstP.childNodes.length > 0 && cell.childNodes.length === 1 && cell.firstChild === firstP) {
        // 仅当 <p> 是唯一子节点时才 unwrap（避免破坏混合内容如 <p> + <ul>）
        cell.innerHTML = firstP.innerHTML
      }
    }

    // 3. 无 <thead> 时，将第一个含 <th> 的 <tr> 提升为表头
    if (!table.querySelector('thead')) {
      const tbody = table.querySelector('tbody')
      if (tbody) {
        const firstRow = tbody.querySelector('tr')
        if (firstRow && firstRow.querySelector('th')) {
          // 创建 <thead> 并移入首行
          const thead = document.createElement('thead')
          thead.appendChild(firstRow.cloneNode(true))
          table.insertBefore(thead, tbody)
          firstRow.remove()
        }
      }
    }
  }

  return div.innerHTML
}

/**
 * 在 HTML 中为 <ul data-marker="X"> 注入哨兵注释，
 * 使 turndown 转换后的 MD 中可精确定位每个列表的原始标记符号。
 *
 * 输入：<ul data-marker="*"><li>a</li></ul>
 * 输出：<!--mk:*--><ul data-marker="*"><li>a</li></ul>
 */
/**
 * 创建配置好的 TurndownService 实例
 */
function createTurndown(bulletMarker?: '-' | '+' | '*'): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: bulletMarker || '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
  })

  // 启用 GFM 插件（表格、任务列表、删除线）
  turndown.use(gfm)

  // ── 自定义规则：数学公式（data-tex）──
  turndown.addRule('mathBlock', {
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return false
      return node.hasAttribute('data-tex') && node.getAttribute('data-display') === 'true'
    },
    replacement: (_content, node) => {
      if (node instanceof HTMLElement) {
        const tex = node.getAttribute('data-tex') || ''
        return `$$\n${tex}\n$$`
      }
      return ''
    },
  })

  turndown.addRule('mathInline', {
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return false
      return node.hasAttribute('data-tex') && node.getAttribute('data-display') === 'false'
    },
    replacement: (_content, node) => {
      if (node instanceof HTMLElement) {
        const tex = node.getAttribute('data-tex') || ''
        return `\\(${tex}\\)`
      }
      return ''
    },
  })

  // ── 自定义规则：任务列表 ul[data-type="taskList"] ──
  // turndown-plugin-gfm 已处理标准 GFM 任务列表，但 TipTap 使用 data-type/data-checked
  // 重写以支持 TipTap 属性
  turndown.addRule('taskListItem', {
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return false
      return (
        node.tagName === 'LI' &&
        node.getAttribute('data-type') === 'taskItem'
      )
    },
    replacement: (content, node) => {
      if (!(node instanceof HTMLElement)) return content
      const checked = node.getAttribute('data-checked') === 'true'
      // 移除 checkbox HTML（<label><input ...></label>）只保留文本内容
      const cleanContent = content
        .replace(/<label>[\s\S]*?<\/label>/g, '')
        .replace(/<div>|<\/div>/g, '')
        .trim()
      // 显式添加换行：turndown 在处理自定义 li 规则时不会自动加块级分隔
      return `${checked ? '- [x]' : '- [ ]'} ${cleanContent}\n`
    },
  })

  // ── 自定义规则：表格 data-separators ──
  // turndown 默认生成 --- | :--- | ---: 的对齐行
  // 但我们希望保留原始 data-separators 中的格式
  // 由于 turndown 不支持直接注入表格分隔行，我们通过 post-process 实现
  // 记录表格的 data-separators 属性，在最终 MD 中替换分隔行

  // ── 自定义规则：图片尺寸保留 ──
  turndown.addRule('imageWithSize', {
    filter: (node) => {
      if (!(node instanceof HTMLImageElement)) return false
      const style = node.getAttribute('style') || ''
      return /width|height/.test(style)
    },
    replacement: (_content, node) => {
      if (!(node instanceof HTMLImageElement)) return ''
      const src = node.getAttribute('src') || ''
      const alt = node.getAttribute('alt') || ''
      const title = node.getAttribute('title')
      const style = node.getAttribute('style') || ''
      const wMatch = style.match(/width:\s*(\d+(?:\.\d+)?)(px|%)/)
      const hMatch = style.match(/height:\s*(\d+(?:\.\d+)?)(px|%)/)
      let sizeSuffix = ''
      if (wMatch || hMatch) {
        const w = wMatch ? `${wMatch[1]}${wMatch[2]}` : ''
        const h = hMatch ? `${hMatch[1]}${hMatch[2]}` : ''
        sizeSuffix = ` <!-- size:${w}x${h} -->`
      }
      return `![${alt}](${src}${title ? ` "${title}"` : ''})${sizeSuffix}`
    },
  })

  // ── 普通图片（无尺寸属性）：覆盖 turndown 默认规则，不转义 alt 中的 _ 等字符 ──
  // turndown 默认 image 规则会 escape(alt)，导致 fantasyke_Arc.png → fantasyke\_Arc.png
  // 该反斜杠在 alt 文本中虽理论合法，但通过 setContent 回灌 ProseMirror 后可能污染
  // 图片节点属性，进而导致渲染/加载异常。直接用原始 alt 值，不转义。
  turndown.addRule('imagePlain', {
    filter: (node) => {
      if (!(node instanceof HTMLImageElement)) return false
      const style = node.getAttribute('style') || ''
      // 仅匹配非尺寸图片（有尺寸的已由 imageWithSize 规则处理）
      return !/width|height/.test(style)
    },
    replacement: (_content, node) => {
      if (!(node instanceof HTMLImageElement)) return ''
      const src = node.getAttribute('src') || ''
      const alt = node.getAttribute('alt') || ''
      const title = node.getAttribute('title')
      return `![${alt}](${src}${title ? ` "${title}"` : ''})`
    },
  })

  return turndown
}

/**
 * 表格分隔行状态（用于 HTML→MD 转换中保留 data-separators）
 */
interface TableSepInfo {
  /** 用 | 分隔的原始分隔行内容 */
  separators: string
  /** 表格在 MD 中的起始位置偏移 */
  startOffset: number
}

/**
 * 后处理：在 turndown 输出的 MD 中恢复 data-separators 表格分隔行
 */
function postProcessTableSeps(md: string, sepInfos: TableSepInfo[]): string {
  if (sepInfos.length === 0) return md
  // 从后往前替换（避免偏移量变化）
  const sorted = [...sepInfos].sort((a, b) => b.startOffset - a.startOffset)
  for (const info of sorted) {
    // 找到从 startOffset 开始的第一个表格分隔行（第二行，由 turndown 生成）
    const afterStart = md.slice(info.startOffset)
    // 匹配表格行模式：| col1 | col2 |\n| --- | --- |\n...
    const tableMatch = afterStart.match(
      /^(\|[^\n]+\|\n)\|([^\n]+)\|(\n\|[^\n]+\|)/,
    )
    if (tableMatch) {
      // 用原始分隔行替换 turndown 生成的分隔行（保留原始格式，不加多余空格）
      const origSep = '|' + info.separators.split('|').map((s) => s || '---').join('|') + '|'
      const newTable = tableMatch[1] + origSep + tableMatch[3]
      const before = md.slice(0, info.startOffset)
      const after = md.slice(info.startOffset + tableMatch[0].length)
      md = before + newTable + after
    }
  }

  return md
}

/**
 * 提取 HTML 中所有表格的 data-separators 信息
 */
function extractTableSeps(html: string): TableSepInfo[] {
  const result: TableSepInfo[] = []
  const regex = /<table[^>]*data-separators="([^"]*)"[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    result.push({
      separators: match[1],
      startOffset: -1, // 将在转换后填充
    })
  }
  return result
}

/**
 * 从 HTML 中检测无序列表标记符号：若所有 <ul data-marker="X"> 一致且非 "-"，
 * 返回该标记以供 turndown 使用，否则返回 undefined（使用默认 "-"）。
 */
function detectBulletMarker(html: string): '-' | '+' | '*' | undefined {
  const div = document.createElement('div')
  div.innerHTML = html
  const uls = div.querySelectorAll<HTMLElement>('ul[data-marker]')
  const markers = new Set<string>()
  for (const ul of uls) {
    // 跳过任务列表
    if (ul.getAttribute('data-type') === 'taskList') continue
    const m = ul.getAttribute('data-marker')
    if (m && (m === '*' || m === '+' || m === '-')) markers.add(m)
  }
  if (markers.size === 1) {
    const m = [...markers][0]
    if (m !== '-') return m as '+' | '*'
  }
  return undefined
}

/**
 * HTML → Markdown（支持 TipTap 自定义属性无损往返）
 */
export function htmlToMarkdown(html: string, docDir?: string | null): string {
  if (!html) return ''

  // 0. 前置正规化：TipTap 表格 DOM → 标准 HTML 表格
  let processedHtml = normalizeTableHtml(html)

  // 1. 路径转换（asset URL → 相对路径）
  if (docDir) {
    const div = document.createElement('div')
    div.innerHTML = processedHtml
    const imgs = div.querySelectorAll('img')
    imgs.forEach((img) => {
      const src = img.getAttribute('src')
      if (src) {
        img.setAttribute('src', toRelPath(src, docDir!))
      }
    })
    processedHtml = div.innerHTML
  }

  // 2. 提取表格 data-separators（在 DOM 操作前，用 normalize 后的 HTML）
  const sepInfos = extractTableSeps(processedHtml)

  // 3. turndown 转换（根据 HTML 中的 data-marker 动态设置列表标记）
  const bulletMarker = detectBulletMarker(processedHtml)
  const turndown = createTurndown(bulletMarker)
  let md = turndown.turndown(processedHtml)

  // 4. 后处理：恢复表格分隔行
  const tableStarts = findTableStarts(md)
  for (let i = 0; i < Math.min(sepInfos.length, tableStarts.length); i++) {
    sepInfos[i].startOffset = tableStarts[i]
  }
  md = postProcessTableSeps(md, sepInfos)

  // 5. 后处理：清理 turndown 产生的格式噪音
  md = cleanTurndownNoise(md)

  // 6. 归一化连续空行
  md = md.trim().replace(/\n{3,}/g, '\n\n')

  return md
}

/**
 * 清理 turndown 产生的格式化噪音：
 * 1. 标题中点号转义（# 1\. → # 1.）
 * 2. 无语言代码块的 plaintext/text 标记
 * 3. 多余空白行（连续 3+ 空行 → 2 空行）
 * 4. 列表项间的多余空行
 */
function cleanTurndownNoise(md: string): string {
  // 1. 标题中的点号转义还原：turndown 会转义 # 1. xxx → # 1\. xxx
  md = md.replace(/^(#{1,6}\s+\d+)\\(\.[^\n]*)$/gm, '$1$2')

  // 2. 清理 turndown 为无语言代码块添加的 plaintext / text 语言标记
  md = md.replace(/^```(?:plaintext|text)\s*$/gm, '```')

  // 3. 清理列表项之间的多余空行（两个连续空行 → 一个）
  // turndown 可能在同一个 li 内产生多余空行，这些空行夹在两个列表项之间
  md = md.replace(/(^\s*[-*+]\s.+\n)\n(\n\s*[-*+]\s)/gm, '$1$2')
  md = md.replace(/(^\s*\d+\.\s.+\n)\n(\n\s*\d+\.\s)/gm, '$1$2')

  // 4. 清理 task 列表 checkbox HTML 残留
  md = md.replace(/\[object HTMLInputElement\]/g, '')

  // 5. 归一化列表项间距：turndown 可能产生 "*   item"（多空格）→ "* item"
  md = md.replace(/^(\s*[*+\-])\s{2,}/gm, '$1 ')
  md = md.replace(/^(\s*\d+\.)\s{2,}/gm, '$1 ')

  // 6. 清理残留的 @@TASK 标记（安全网）
  md = md.replace(/@@TASK:[01]@@/g, '')

  return md
}

/**
 * 在 MD 字符串中定位所有表格的起始位置
 */
function findTableStarts(md: string): number[] {
  const result: number[] = []
  const lines = md.split('\n')
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\|.*\|.*\|/.test(line)) {
      // 检查下一行是否是表格分隔行（确认这是表格）
      const nextLine = lines[i + 1] || ''
      if (/^\|[\s:-]+\|/.test(nextLine)) {
        result.push(offset)
      }
    }
    offset += line.length + 1 // +1 for \n
  }
  return result
}

// 重新导出 escapeHtml（与手写引擎共用）
export { _escapeHtml as escapeHtml }
