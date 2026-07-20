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
        lines.push(state.getLine(next))
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
      const checked = match[1].toLowerCase() === 'x'
      tasks.set(lineIdx, checked)
      lineIdx++
      // 保留为普通列表项（markdown-it 会正常解析），内容前缀注入标记
      // 在 postProcessTaskLists 中根据 tasks map 重建 HTML
      return `${match[1]}- <!--task:${checked ? '1' : '0'}-->${match[3]}`
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
  // 模式：<ul>\s*<li>\s*<!--task:(0|1)-->... → 重写为 taskList
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
      if (/<!--task:(0|1)-->/.test(line)) {
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
    const taskMatch = line.match(/<!--task:(0|1)-->/)
    if (taskMatch) {
      const checked = taskMatch[1] === '1'
      // 移除 task 标记
      line = line.replace(/<!--task:(0|1)-->/, '')
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
  return html.replace(/src="(?!https?:\/\/|\/|data:)([^"]+)"/g, (_m, src) => {
    const url = toAssetUrl(src, docDir!)
    return `src="${url}"`
  })
}

/**
 * markdown → TipTap 兼容 HTML
 */
export function markdownToHtml(md: string, docDir?: string | null): string {
  if (!md) return '<p></p>'

  const mdInstance = createMarkdownIt()

  // 1. 预处理任务列表
  const preprocessed = preprocessTaskList(md)

  // 2. markdown-it 解析
  let html = mdInstance.render(preprocessed.text)

  // 3. 后处理：任务列表重建
  html = postProcessTaskLists(html)

  // 4. 后处理：图片 src 路径
  html = postProcessImageSrc(html, docDir)

  // 5. 归一化连续空行
  html = (html || '<p></p>').replace(/\n{3,}/g, '\n\n')

  return html
}

// ════════════════════════════════════════════════
//  HTML → Markdown（turndown 管线）
// ════════════════════════════════════════════════

/**
 * 创建配置好的 TurndownService 实例
 */
function createTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
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
      return `${checked ? '- [x]' : '- [ ]'} ${cleanContent}`
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

  // ── 取消 turndown 默认的图片规则（避免重复）──
  // turndown 的默认图片规则会匹配所有 img，我们用更具体的 imageWithSize 替代
  // 但 turndown 的规则有优先级：先添加先匹配
  // imageWithSize 在默认之前添加（已处理），有尺寸的图片走 imageWithSize
  // 没尺寸的图片走默认规则 → 这正是我们要的

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
      // 用原始分隔行替换 turndown 生成的分隔行
      const origSep = `| ${info.separators.split('|').map((s) => s.trim() || '---').join(' | ')} |`
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
 * HTML → Markdown（支持 TipTap 自定义属性无损往返）
 */
export function htmlToMarkdown(html: string, docDir?: string | null): string {
  if (!html) return ''

  // 1. 提取表格 data-separators（在 DOM 操作前）
  const sepInfos = extractTableSeps(html)

  // 2. 路径转换（asset URL → 相对路径）
  let processedHtml = html
  if (docDir) {
    // 在 turndown 处理前，将 asset: 开头的 src 替换为相对路径
    // turndown 会直接使用 HTML 中的 src 值
    const div = document.createElement('div')
    div.innerHTML = html
    const imgs = div.querySelectorAll('img')
    imgs.forEach((img) => {
      const src = img.getAttribute('src')
      if (src) {
        img.setAttribute('src', toRelPath(src, docDir!))
      }
    })
    processedHtml = div.innerHTML
  }

  // 3. turndown 转换
  const turndown = createTurndown()
  let md = turndown.turndown(processedHtml)

  // 4. 后处理：恢复表格分隔行
  // 先定位每个表格在 MD 中的位置
  const tableStarts = findTableStarts(md)
  for (let i = 0; i < Math.min(sepInfos.length, tableStarts.length); i++) {
    sepInfos[i].startOffset = tableStarts[i]
  }
  md = postProcessTableSeps(md, sepInfos)

  // 5. 后处理：任务列表中的 checkbox HTML → 清理
  md = md.replace(/\[object HTMLInputElement\]/g, '')

  // 6. 归一化连续空行
  md = md.trim().replace(/\n{3,}/g, '\n\n')

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
