/**
 * KaTeX 数学公式节点（TipTap / ProseMirror）
 *
 * 设计要点：
 * - Markdown 源码是唯一真相。行内 `\(...\)` 与块级 `$$...$$` 在 markdown.ts 中
 *   被转换为带 `data-tex` 的占位元素；本节点负责把 `data-tex` 还原为 KaTeX 渲染。
 * - 节点为 atom（无子内容），renderHTML 同时输出 `data-tex`，从而 htmlToMarkdown
 *   能无损还原回 `\(...\)` / `$$...$$`，保证 Markdown ↔ HTML 双向往返不丢公式。
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

function renderKatex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex || '', {
      displayMode: display,
      throwOnError: false,
      output: 'htmlAndMathml',
    })
  } catch {
    return `<span class="math-render-error">${escapeHtml(tex)}</span>`
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function MathView({ node, display }: NodeViewProps & { display: boolean }) {
  const tex = (node.attrs.tex as string) || ''
  const html = renderKatex(tex, display)
  return (
    <NodeViewWrapper
      className={`fk-math-node ${display ? 'fk-math-block' : 'fk-math-inline'}`}
      data-tex={tex}
      data-display={String(display)}
      contentEditable={false}
    >
      {tex.trim() === '' ? (
        <span className="fk-math-empty">{display ? '$$ \\quad $$' : '\\( \\quad \\)'}</span>
      ) : (
        <span className="katex-render" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      <span className="fk-math-edit" contentEditable={false} data-tex={tex} />
    </NodeViewWrapper>
  )
}

// ── 行内数学：\(\tex\) ──
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      tex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-tex') || '',
        renderHTML: (attrs) => (attrs.tex ? { 'data-tex': attrs.tex } : {}),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span.fk-math.fk-math-inline',
        getAttrs: (el) => ({ tex: (el as HTMLElement).getAttribute('data-tex') || '' }),
      },
      {
        tag: 'span.fk-math[data-display="false"]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).getAttribute('data-tex') || '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'fk-math fk-math-inline',
        'data-display': 'false',
      }),
      node.attrs.tex as string,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <MathView {...props} display={false} />)
  },
})

// ── 块级数学：$$\tex$$ ──
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      tex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-tex') || '',
        renderHTML: (attrs) => (attrs.tex ? { 'data-tex': attrs.tex } : {}),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div.fk-math.fk-math-block',
        getAttrs: (el) => ({ tex: (el as HTMLElement).getAttribute('data-tex') || '' }),
      },
      {
        tag: 'div.fk-math[data-display="true"]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).getAttribute('data-tex') || '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'fk-math fk-math-block',
        'data-display': 'true',
      }),
      node.attrs.tex as string,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <MathView {...props} display={true} />)
  },
})
