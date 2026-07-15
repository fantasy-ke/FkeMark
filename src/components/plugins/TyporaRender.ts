/**
 * Typora 风格即时渲染插件
 *
 * 核心原理：
 * - 监听光标位置变化
 * - 光标进入 heading/bold/italic/code/link 等节点时，通过 ProseMirror Decoration
 *   在对应位置插入 <span class="md-delimiter visible"> 语法标记
 * - 光标离开时，移除标记，恢复纯渲染视图
 * - CSS 控制标记的显隐过渡动画
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Mark, Node as PMNode, ResolvedPos } from 'prosemirror-model'

const typoraKey = new PluginKey('typoraRender')

// ──────────────────────────────────────────────
//  Markdown 语法标记定义
// ──────────────────────────────────────────────

interface DelimiterDef {
  start: string
  end: string
}

/** 行内 mark 类型 → 分隔符映射 */
const MARK_DELIMITERS: Record<string, DelimiterDef> = {
  bold:      { start: '**',  end: '**' },
  italic:    { start: '*',   end: '*' },
  code:      { start: '`',   end: '`' },
  strike:    { start: '~~',  end: '~~' },
  underline: { start: '<u>', end: '</u>' },
  highlight: { start: '==',  end: '==' },
  link:      { start: '[',   end: ']' },  // link 的 end 特殊处理
}

/** 块级节点 → 前缀映射 */
function getBlockPrefix(node: PMNode): string | null {
  if (node.type.name === 'heading') {
    return '#'.repeat(node.attrs.level) + ' '
  }
  if (node.type.name === 'blockquote') {
    return '> '
  }
  if (node.type.name === 'codeBlock') {
    return '```\n'
  }
  return null
}

// ──────────────────────────────────────────────
//  工具函数
// ──────────────────────────────────────────────

/** 创建分隔符 DOM 元素 */
function createDelimiterWidget(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'md-delimiter visible'
  span.textContent = text
  span.setAttribute('contenteditable', 'false')
  return span
}

/**
 * 在光标位置查找指定 mark 的完整范围
 *
 * 原理：从光标所在 text node 开始，向前后遍历相邻的 text node，
 * 只要它们带有相同的 mark，就扩展范围。
 */
function findMarkRange(
  $pos: ResolvedPos,
  mark: Mark
): { from: number; to: number } | null {
  const parent = $pos.parent
  if (!parent.isTextblock) return null

  // 当前 child 索引
  let idx = $pos.index()
  const textOffset = $pos.textOffset

  // 如果在 child 边界上（textOffset === 0），可能需要看前一个 child
  if (textOffset === 0 && idx > 0) {
    const prev = parent.child(idx - 1)
    if (prev.isText && prev.marks.some((m) => m.eq(mark))) {
      idx--
    }
  }

  // 确认当前 child 确实带有此 mark
  if (idx >= parent.childCount) return null
  const child = parent.child(idx)
  if (!child.isText || !child.marks.some((m) => m.eq(mark))) {
    return null
  }

  // 向前扩展：找到 mark 的起始 child
  let startIdx = idx
  while (startIdx > 0) {
    const prev = parent.child(startIdx - 1)
    if (!prev.isText || !prev.marks.some((m) => m.eq(mark))) break
    startIdx--
  }

  // 向后扩展：找到 mark 的结束 child
  let endIdx = idx
  while (endIdx < parent.childCount - 1) {
    const next = parent.child(endIdx + 1)
    if (!next.isText || !next.marks.some((m) => m.eq(mark))) break
    endIdx++
  }

  // 计算 doc 级绝对位置
  const parentStart = $pos.start()
  let from = parentStart
  for (let i = 0; i < startIdx; i++) {
    from += parent.child(i).nodeSize
  }
  let to = from
  for (let i = startIdx; i <= endIdx; i++) {
    to += parent.child(i).nodeSize
  }

  return { from, to }
}

// ──────────────────────────────────────────────
//  装饰器计算
// ──────────────────────────────────────────────

/**
 * 根据光标位置计算所有需要显示的分隔符装饰
 */
function computeDecorations(
  doc: PMNode,
  from: number,
  to: number,
  empty: boolean
): DecorationSet {
  // 非空选区时不显示分隔符（选区本身已表示范围）
  if (!empty) {
    return DecorationSet.empty
  }

  const decorations: Decoration[] = []

  // ── 1. 块级节点分隔符（heading, blockquote, codeBlock）──
  doc.nodesBetween(from, to, (node, pos) => {
    const prefix = getBlockPrefix(node)
    if (prefix) {
      // 在节点内容开始处插入前缀标记
      decorations.push(
        Decoration.widget(pos + 1, () => createDelimiterWidget(prefix), {
          side: -1,
        })
      )
    }
  })

  // ── 2. 行内 mark 分隔符（bold, italic, code, link 等）──
  const $from = doc.resolve(from)
  const activeMarks = $from.marks()

  for (const mark of activeMarks) {
    const def = MARK_DELIMITERS[mark.type.name]
    if (!def) continue

    const range = findMarkRange($from, mark)
    if (!range) continue

    // 起始分隔符
    decorations.push(
      Decoration.widget(range.from, () => createDelimiterWidget(def.start), {
        side: -1,
      })
    )

    // 结束分隔符
    if (mark.type.name === 'link') {
      // link 特殊处理：显示 ](url)
      const href = mark.attrs.href || ''
      decorations.push(
        Decoration.widget(range.to, () => createDelimiterWidget(`](${href})`), {
          side: 1,
        })
      )
    } else if (def.end) {
      decorations.push(
        Decoration.widget(range.to, () => createDelimiterWidget(def.end), {
          side: 1,
        })
      )
    }
  }

  // ── 3. 列表项前缀 ──
  // 查找光标所在位置的祖先列表节点
  let depth = $from.depth
  while (depth > 0) {
    const ancestor = $from.node(depth)
    if (ancestor.type.name === 'listItem') {
      // 找到列表项，检查是 orderedList 还是 bulletList
      const listType = $from.node(depth - 1).type.name
      if (listType === 'bulletList') {
        decorations.push(
          Decoration.widget($from.before(depth) + 1, () => createDelimiterWidget('- '), {
            side: -1,
          })
        )
      } else if (listType === 'orderedList') {
        // 计算序号
        const index = $from.index(depth - 1) + 1
        decorations.push(
          Decoration.widget($from.before(depth) + 1, () => createDelimiterWidget(`${index}. `), {
            side: -1,
          })
        )
      }
      break
    }
    depth--
  }

  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty
}

// ──────────────────────────────────────────────
//  TipTap 扩展定义
// ──────────────────────────────────────────────

export const TyporaRender = Extension.create({
  name: 'typoraRender',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: typoraKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            // 仅在选区变化或文档变化时重新计算
            if (!tr.docChanged && !tr.selectionSet) {
              return old
            }
            const { doc, selection } = tr
            return computeDecorations(
              doc,
              selection.from,
              selection.to,
              selection.empty
            )
          },
        },
        props: {
          decorations(state) {
            return typoraKey.getState(state)
          },
        },
      }),
    ]
  },
})
