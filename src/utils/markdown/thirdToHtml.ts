/**
 * 第三方 Markdown 引擎（markdown-it + turndown）
 *
 * 与手写引擎（markdown.ts）完全兼容，支持同一套 TipTap 属性：
 * - data-tex / data-display（数学公式无损往返）
 * - data-type="taskList" / data-checked（任务列表）
 * - data-separators（表格分隔行）
 * - data-marker（无序列表符号）
 * - 图片尺寸（<!-- size:WxH -->）
 * - data-footnotes / data-footnote-ref（脚注无损往返）
 * - data-doc-tag（正文标签无损往返）
 *
 * 通过 utils/markdown/engine.ts 的路由层切换使用。
 */

import MarkdownIt from 'markdown-it'
import { toAssetUrl } from '../asset'
import { escapeHtml as _escapeHtml } from './builtin'
import { prepareMarkdownForRendering, renderFrontMatterHtml } from './normalize'
import {
  prepareMarkdownFootnotes,
  renderFootnotesHtml,
} from './footnotes'
import { prepareDocumentTags, renderDocumentTagsHtml } from './metadata'

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

  const prepared = prepareMarkdownForRendering(md)
  const tags = prepareDocumentTags(prepared.body)
  const footnotes = prepareMarkdownFootnotes(tags.body)
  let html = renderFootnotesHtml(
    renderMarkdownBody(footnotes.body, docDir),
    footnotes,
    (definition) => renderMarkdownBody(definition, docDir),
  )
  html = renderDocumentTagsHtml(html, tags)

  if (prepared.frontMatter !== null) {
    html = `${renderFrontMatterHtml(prepared.frontMatter)}\n${html}`
  }

  html = (html || '<p></p>').replace(/\n{3,}/g, '\n\n')
  return html.trim() ? html : '<p></p>'
}

function renderMarkdownBody(md: string, docDir?: string | null): string {
  const normalizedMd = normalizeLooseTables(md)
  const tableSeparators = extractTableSeparators(normalizedMd)
  const listMarkers = extractListMarkers(normalizedMd)
  const preprocessed = preprocessTaskList(normalizedMd)
  let html = createMarkdownIt().render(preprocessed.text)
  html = postProcessTaskLists(html)
  html = injectDataMarkers(html, listMarkers)
  html = injectTableSeparators(html, tableSeparators)
  html = postProcessImageSrc(html, docDir)
  return removeEmptyBlockquotes(html)
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
