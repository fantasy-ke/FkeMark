/**
 * KaTeX 数学公式节点（TipTap / ProseMirror）
 *
 * 设计要点：
 * - Markdown 源码是唯一真相。行内 `\(...\)` 与块级 `$$...$$` 在 markdown.ts 中
 *   被转换为带 `data-tex` 的占位元素；本节点负责把 `data-tex` 还原为 KaTeX 渲染。
 * - 节点为 atom（无子内容），renderHTML 同时输出 `data-tex`，从而 htmlToMarkdown
 *   能无损还原回 `\(...\)` / `$$...$$`，保证 Markdown ↔ HTML 双向往返不丢公式。
 * - 双击已渲染的公式进入编辑模式，显示 textarea 直接修改 TeX 源码，Enter/失焦保存。
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect, useCallback } from 'react'
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

function MathView({ node, updateAttributes, display }: NodeViewProps & { display: boolean }) {
  const tex = (node.attrs.tex as string) || ''
  const html = renderKatex(tex, display)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tex)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false)

  const commit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    const trimmed = draft.trim()
    if (trimmed !== tex) {
      updateAttributes({ tex: trimmed })
    }
    setEditing(false)
  }, [draft, tex, updateAttributes])

  // 进入编辑模式时聚焦 textarea
  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.select()
    }
  }, [editing])

  // 切回渲染模式时重置标志
  useEffect(() => {
    if (!editing) committedRef.current = false
  }, [editing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(tex)
      committedRef.current = true
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <NodeViewWrapper
        className={`fk-math-node ${display ? 'fk-math-block' : 'fk-math-inline'}`}
        data-tex={tex}
        data-display={String(display)}
        contentEditable={false}
      >
        <textarea
          ref={taRef}
          className="fk-math-edit-ta"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          rows={display ? 3 : 1}
          placeholder={display ? '$$ E = mc^2 $$' : '\\( a^2 + b^2 = c^2 \\)'}
        />
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      className={`fk-math-node ${display ? 'fk-math-block' : 'fk-math-inline'}`}
      data-tex={tex}
      data-display={String(display)}
      contentEditable={false}
      onDoubleClick={() => {
        setDraft(tex)
        setEditing(true)
      }}
    >
      {tex.trim() === '' ? (
        <span className="fk-math-empty">{display ? '$$ \\quad $$' : '\\( \\quad \\)'}</span>
      ) : (
        <span className="katex-render" title={tex} dangerouslySetInnerHTML={{ __html: html }} />
      )}
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
