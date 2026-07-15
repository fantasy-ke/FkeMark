/**
 * Typora 风格即时渲染插件
 *
 * 核心原理：
 * - 监听光标位置变化
 * - 光标进入 bold/italic/code/link 等行内 mark 时，通过 ProseMirror Decoration
 *   在对应位置插入 <span class="md-delimiter visible"> 语法标记（包裹式，非前置）
 * - 块级前缀（# / > / - / ```）不再内联插入，改由 Editor 的浮动 SyntaxBadge
 *   在焦点左上方显示，避免遮挡正文
 * - CSS 控制标记的显隐过渡动画
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Mark, Node as PMNode, ResolvedPos } from 'prosemirror-model'

const typoraKey = new PluginKey('typoraRender')

// ──────────────────────────────────────────────
//  Markdown 行内语法标记定义（仅包裹式 mark）
// ──────────────────────────────────────────────

interface DelimiterDef {
  start: string
  end: string
}

/** 行内 mark 类型 → 分隔符映射（仅保留包裹式，块级前缀已移至浮动提示） */
const MARK_DELIMITERS: Record<string, DelimiterDef> = {
  bold:      { start: '**',  end: '**' },
  italic:    { start: '*',   end: '*' },
  code:      { start: '`',   end: '`' },
  strike:    { start: '~~',  end: '~~' },
  underline: { start: '<u>', end: '</u>' },
  highlight: { start: '==',  end: '==' },
  link:      { start: '[',   end: ']' },  // link 的 end 特殊处理
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
 */
function findMarkRange(
  $pos: ResolvedPos,
  mark: Mark
): { from: number; to: number } | null {
  const parent = $pos.parent
  if (!parent.isTextblock) return null

  let idx = $pos.index()
  const textOffset = $pos.textOffset

  if (textOffset === 0 && idx > 0) {
    const prev = parent.child(idx - 1)
    if (prev.isText && prev.marks.some((m) => m.eq(mark))) {
      idx--
    }
  }

  if (idx >= parent.childCount) return null
  const child = parent.child(idx)
  if (!child.isText || !child.marks.some((m) => m.eq(mark))) {
    return null
  }

  let startIdx = idx
  while (startIdx > 0) {
    const prev = parent.child(startIdx - 1)
    if (!prev.isText || !prev.marks.some((m) => m.eq(mark))) break
    startIdx--
  }

  let endIdx = idx
  while (endIdx < parent.childCount - 1) {
    const next = parent.child(endIdx + 1)
    if (!next.isText || !next.marks.some((m) => m.eq(mark))) break
    endIdx++
  }

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
//  装饰器计算（仅行内 mark，块级前缀已移除）
// ──────────────────────────────────────────────

function computeDecorations(
  doc: PMNode,
  from: number,
  _to: number,
  empty: boolean
): DecorationSet {
  if (!empty) {
    return DecorationSet.empty
  }

  const decorations: Decoration[] = []

  // 仅处理行内 mark 分隔符（bold/italic/code/strike/underline/highlight/link）
  const $from = doc.resolve(from)
  const activeMarks = $from.marks()

  for (const mark of activeMarks) {
    const def = MARK_DELIMITERS[mark.type.name]
    if (!def) continue

    const range = findMarkRange($from, mark)
    if (!range) continue

    decorations.push(
      Decoration.widget(range.from, () => createDelimiterWidget(def.start), {
        side: -1,
      })
    )

    if (mark.type.name === 'link') {
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
