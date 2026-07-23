/**
 * HTML ? Markdown pipeline for the third-party Markdown engine.
 */

import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { toRelPath } from '../asset'
import { escapeHtml as _escapeHtml } from './builtin'
import { prepareHtmlFootnotes, restoreFootnotesToMarkdown } from './footnotes'

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

  // ── 自定义规则：文档头属性块 ──
  turndown.addRule('frontMatter', {
    filter: (node) => {
      return node instanceof HTMLElement && node.tagName === 'PRE' && node.hasAttribute('data-frontmatter')
    },
    replacement: (_content, node) => {
      const value = (node.textContent || '').replace(/\n$/, '')
      return `\n---\n${value}\n---\n\n`
    },
  })

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
  const footnotes = prepareHtmlFootnotes(html)
  const body = htmlFragmentToMarkdown(footnotes.html, docDir)
  return restoreFootnotesToMarkdown(
    body,
    footnotes,
    (fragment) => htmlFragmentToMarkdown(fragment, docDir),
  )
}

function htmlFragmentToMarkdown(html: string, docDir?: string | null): string {
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
