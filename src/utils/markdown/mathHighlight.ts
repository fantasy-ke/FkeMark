/**
 * 数学公式与高亮的解析后处理。
 *
 * BlockNote 的 Markdown 解析基于 remark + remark-gfm，既不认识 `==高亮==`，
 * 也不认识 `\(行内公式\)` / `$$块级公式$$`；同时 remark 会剥掉 Markdown 里的原始 HTML，
 * 因此无法用 HTML 作为传输介质。这里改为在解析结果上做一次后处理：这些语法会以
 * 字面文本的形式保留下来，再就地改写成编辑器 schema 里的真实节点与样式。
 *
 * 反向（编辑器 → Markdown）由 `blockNoteSerializer` 负责，两端必须保持一致。
 */

export interface MathHighlightResult {
  blocks: unknown[]
  /** 是否发生过改写，供调用方记录与测试断言 */
  transformed: boolean
}

interface InlineItemLike {
  type?: unknown
  text?: unknown
  styles?: Record<string, unknown>
  props?: Record<string, unknown>
  content?: unknown
}

interface BlockLike {
  id?: unknown
  type?: unknown
  props?: Record<string, unknown>
  content?: unknown
  children?: unknown[]
}

/** 行内公式 `\(...\)`；不允许跨行 */
const INLINE_MATH_RE = /\\\(([^\n]+?)\\\)/
/** 高亮 `==...==`；内容不含 `=` 且不跨行 */
const HIGHLIGHT_RE = /==([^=\n]+?)==/
/** 独占一行的块级公式 `$$...$$` */
const SINGLE_LINE_BLOCK_MATH_RE = /^\$\$([\s\S]+?)\$\$$/
/** 多行块级公式的 `$$` 边界行 */
const BLOCK_MATH_FENCE_RE = /^\$\$$/
/** Front Matter 的 `---` 边界行 */
const FRONT_MATTER_BOUNDARY_RE = /^(?:\uFEFF)?---[ \t]*$/
/** 代码围栏起始行 */
const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asInlineItems(value: unknown): InlineItemLike[] | null {
  return Array.isArray(value) ? value as InlineItemLike[] : null
}

function asChildren(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

/** 取纯文本块的内容文本；仅当内容全是文本项时返回 */
function plainTextOf(block: BlockLike): string | null {
  const items = asInlineItems(block.content)
  if (!items) return null
  if (items.some((item) => item.type !== 'text')) return null
  return items.map((item) => (typeof item.text === 'string' ? item.text : '')).join('')
}

/**
 * 把一段文本按行内公式与高亮拆成多个内联项。
 * 带 `code` 样式的文本属于行内代码，不做任何改写。
 */
function splitInlineText(text: string, styles: Record<string, unknown>): {
  items: InlineItemLike[]
  changed: boolean
} {
  if (styles.code === true) return { items: [{ type: 'text', text, styles }], changed: false }

  const items: InlineItemLike[] = []
  let changed = false
  let cursor = 0

  while (cursor < text.length) {
    const rest = text.slice(cursor)
    const math = INLINE_MATH_RE.exec(rest)
    const mark = HIGHLIGHT_RE.exec(rest)
    const mathIndex = math ? math.index : -1
    const markIndex = mark ? mark.index : -1

    if (mathIndex < 0 && markIndex < 0) break

    const useMath = mathIndex >= 0 && (markIndex < 0 || mathIndex <= markIndex)
    const next = useMath ? mathIndex : markIndex
    if (next > 0) items.push({ type: 'text', text: rest.slice(0, next), styles })

    if (useMath && math) {
      items.push({ type: 'mathInline', props: { tex: math[1].trim() } })
      cursor += next + math[0].length
    } else if (mark) {
      items.push({ type: 'text', text: mark[1], styles: { ...styles, highlight: true } })
      cursor += next + mark[0].length
    }
    changed = true
  }

  if (cursor < text.length) items.push({ type: 'text', text: text.slice(cursor), styles })
  return { items, changed }
}

/** 递归改写一个块的内联内容（链接内部也要处理） */
function transformInlineItems(items: InlineItemLike[]): { items: InlineItemLike[]; changed: boolean } {
  const output: InlineItemLike[] = []
  let changed = false

  for (const item of items) {
    if (item.type === 'text' && typeof item.text === 'string') {
      const styles = isRecord(item.styles) ? item.styles : {}
      const result = splitInlineText(item.text, styles)
      if (result.changed) changed = true
      output.push(...result.items)
      continue
    }
    if (item.type === 'link') {
      const inner = asInlineItems(item.content)
      if (inner) {
        const result = transformInlineItems(inner)
        if (result.changed) {
          changed = true
          output.push({ ...item, content: result.items })
          continue
        }
      }
    }
    output.push(item)
  }

  return { items: output, changed }
}

/** 把独占一行的 `$$...$$` 段落与 `$$` 包裹的多行段落合并成 mathBlock */
function transformBlocksAtLevel(blocks: unknown[]): { blocks: unknown[]; changed: boolean } {
  const output: unknown[] = []
  let changed = false

  for (let index = 0; index < blocks.length; index += 1) {
    const raw = blocks[index]
    if (!isRecord(raw)) {
      output.push(raw)
      continue
    }
    const block = raw as BlockLike

    // 多行块级公式：`$$` 起止行之间全部内容作为 TeX
    if (block.type === 'paragraph' && plainTextOf(block)?.trim().match(BLOCK_MATH_FENCE_RE)) {
      const body: string[] = []
      let end = index + 1
      let closed = false
      for (; end < blocks.length; end += 1) {
        const candidate = blocks[end]
        if (!isRecord(candidate)) break
        const text = plainTextOf(candidate as BlockLike)
        if (text === null) break
        if (text.trim().match(BLOCK_MATH_FENCE_RE)) {
          closed = true
          break
        }
        body.push(text)
      }
      if (closed) {
        output.push({
          id: block.id,
          type: 'mathBlock',
          props: { tex: body.join('\n').trim() },
          children: [],
        })
        changed = true
        index = end
        continue
      }
    }

    // 单行块级公式
    if (block.type === 'paragraph') {
      const text = plainTextOf(block)
      const single = text === null ? null : text.trim().match(SINGLE_LINE_BLOCK_MATH_RE)
      if (single) {
        output.push({
          id: block.id,
          type: 'mathBlock',
          props: { tex: single[1].trim() },
          children: [],
        })
        changed = true
        continue
      }
    }

    // 代码块内的字面语法保持原样
    const nextBlock: BlockLike = { ...block }
    if (block.type !== 'codeBlock') {
      const items = asInlineItems(block.content)
      if (items) {
        const result = transformInlineItems(items)
        if (result.changed) {
          changed = true
          nextBlock.content = result.items
        }
      }
    }
    const children = asChildren(block.children)
    if (children && children.length > 0) {
      const result = transformBlocksAtLevel(children)
      if (result.changed) {
        changed = true
        nextBlock.children = result.blocks
      }
    }
    output.push(nextBlock)
  }

  return { blocks: output, changed }
}

/**
 * 把解析结果里的 `==高亮==`、`\(行内公式\)` 与 `$$块级公式$$` 改写成真实节点与样式。
 * 输入与输出都是 BlockNote 的块数组，未发生改写时原样返回。
 */
export function applyMathAndHighlight(blocks: unknown[]): MathHighlightResult {
  const result = transformBlocksAtLevel(blocks)
  return { blocks: result.blocks, transformed: result.changed }
}

/**
 * 保护行内公式的反斜杠，供解析前调用。
 *
 * remark 会把 `\(` 当成转义序列，输出成 `(`，导致公式标记丢失。这里把公式定界符的
 * 反斜杠翻倍（`\(` → `\\(`），remark 解析后还原成字面量 `\(`，再由
 * `applyMathAndHighlight` 改写成真正的公式节点。代码围栏、行内代码与 Front Matter 不变。
 */
export function protectInlineMathEscapes(markdown: string): string {
  const lines = markdown.split('\n')
  const output: string[] = []
  let fence: string | null = null
  let inFrontMatter = false
  let frontMatterDone = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!frontMatterDone && index === 0) {
      if (FRONT_MATTER_BOUNDARY_RE.test(line)) {
        inFrontMatter = true
        output.push(line)
        continue
      }
      frontMatterDone = true
    } else if (inFrontMatter) {
      output.push(line)
      if (FRONT_MATTER_BOUNDARY_RE.test(line)) {
        inFrontMatter = false
        frontMatterDone = true
      }
      continue
    }

    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      const marker = fenceMatch[2]
      if (fence === null) fence = marker.charAt(0)
      else if (marker.charAt(0) === fence) fence = null
      output.push(line)
      continue
    }
    if (fence !== null) {
      output.push(line)
      continue
    }

    output.push(protectInlineMathInLine(line))
  }

  return output.join('\n')
}

/** 逐字符保护单行里的公式定界符，跳过行内代码与已转义的反斜杠 */
function protectInlineMathInLine(line: string): string {
  let result = ''
  let index = 0

  while (index < line.length) {
    const char = line.charAt(index)

    if (char === '`') {
      let runEnd = index
      while (line.charAt(runEnd) === '`') runEnd += 1
      const fence = line.slice(index, runEnd)
      const close = line.indexOf(fence, runEnd)
      if (close !== -1) {
        result += line.slice(index, close + fence.length)
        index = close + fence.length
        continue
      }
      result += line.slice(index)
      break
    }

    if (char === '\\') {
      const next = line.charAt(index + 1)
      if (next === '(' || next === ')') {
        // 已经是转义形式时不再重复翻倍
        if (line.charAt(index - 1) !== '\\') {
          result += `\\${char}${next}`
          index += 2
          continue
        }
      }
      result += char + next
      index += 2
      continue
    }

    result += char
    index += 1
  }

  return result
}
