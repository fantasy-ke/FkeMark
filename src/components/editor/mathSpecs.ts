/**
 * KaTeX 数学公式的编辑器节点。
 *
 * - `mathInline`：行内公式，对应 Markdown 的 `\(...\)`
 * - `mathBlock`：块级公式，对应 Markdown 的 `$$...$$`
 *
 * 两者都是无子内容的原子节点，`tex` 属性保存公式源码。渲染时交给 KaTeX 输出 HTML；
 * 双击进入编辑态显示 textarea，Enter 或失焦提交、Escape 取消。
 * `toExternalHTML` 输出带 `data-tex` 的占位元素，保证与 Markdown 解析端一致。
 */
import { createBlockConfig, createBlockSpec, createInlineContentSpec } from '@blocknote/core'
import 'katex/dist/katex.min.css'
import { observeNearViewport } from '../../utils/markdown/heavyRender'
import { renderKatexHtml } from '../../utils/markdown/katexRender'

/** 外部 HTML（粘贴 / 导入 / 导出）使用的类名，parse 规则据此识别公式 */
const MATH_HTML_CLASS = 'fk-math'
/** 编辑器内渲染的公式节点类名，样式见 styles/editor.css */
const MATH_NODE_CLASS = 'fk-math-node'

export const DEFAULT_INLINE_MATH_TEX = 'a^2 + b^2 = c^2'
export const DEFAULT_BLOCK_MATH_TEX = 'E = mc^2'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface MathViewOptions {
  tex: string
  display: boolean
  /** 提交新的 TeX 源码 */
  commit: (tex: string) => void
}

/**
 * 构建公式节点的 DOM：非编辑态渲染 KaTeX，双击切换到 textarea 编辑。
 * 节点整体 `contenteditable=false`，避免 ProseMirror 把编辑操作当成文档改动。
 */
function createMathView(options: MathViewOptions): { dom: HTMLElement; destroy: () => void } {
  const dom = document.createElement(options.display ? 'div' : 'span')
  dom.className = `${MATH_NODE_CLASS} ${options.display ? 'fk-math-block' : 'fk-math-inline'}`
  dom.setAttribute('contenteditable', 'false')
  dom.dataset.tex = options.tex
  dom.dataset.display = String(options.display)

  let tex = options.tex
  let editing = false

  const rendered = document.createElement('span')
  rendered.className = 'katex-render'

  const editor = document.createElement('textarea')
  editor.className = 'fk-math-edit-ta'
  editor.spellcheck = false
  editor.rows = options.display ? 3 : 1
  editor.placeholder = options.display ? '$$ E = mc^2 $$' : '\\( a^2 + b^2 = c^2 \\)'
  editor.style.display = 'none'

  const paint = () => {
    dom.dataset.tex = tex
    if (tex) dom.setAttribute('aria-label', tex)
    if (tex.trim() === '') {
      rendered.innerHTML = `<span class="fk-math-empty">${escapeHtml(options.display ? '$$ \\quad $$' : '\\( \\quad \\)')}</span>`
      rendered.style.minHeight = ''
      return
    }
    rendered.innerHTML = renderKatexHtml(tex, options.display)
    rendered.title = tex
    const height = rendered.getBoundingClientRect().height
    if (height > 0) rendered.style.minHeight = `${Math.ceil(height)}px`
  }

  const stopEditing = (nextTex: string | null) => {
    editing = false
    editor.style.display = 'none'
    rendered.style.display = ''
    dom.classList.remove('fk-math-editing')
    if (nextTex !== null) {
      const trimmed = nextTex.trim()
      if (trimmed !== tex) {
        tex = trimmed
        paint()
        options.commit(tex)
        return
      }
    }
    paint()
  }

  const startEditing = () => {
    if (editing) return
    editing = true
    editor.value = tex
    editor.style.display = ''
    rendered.style.display = 'none'
    dom.classList.add('fk-math-editing')
    editor.focus()
    editor.select()
  }

  dom.addEventListener('dblclick', (event) => {
    event.preventDefault()
    event.stopPropagation()
    startEditing()
  })

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      stopEditing(editor.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      stopEditing(null)
    }
    event.stopPropagation()
  })
  editor.addEventListener('blur', () => {
    if (editing) stopEditing(editor.value)
  })

  rendered.classList.add('is-pending')
  rendered.textContent = tex.trim() || (options.display ? '$$' : '\\(\\)')
  // 节点视图返回后才会插入文档。提前观察时，视口回调可能不会再触发。
  let cancelled = false
  let stopObserve = () => {}
  queueMicrotask(() => {
    if (cancelled) return
    stopObserve = observeNearViewport(dom, () => {
      rendered.classList.remove('is-pending')
      paint()
    })
  })
  dom.append(rendered, editor)

  return {
    dom,
    destroy() {
      cancelled = true
      stopObserve()
      dom.replaceChildren()
    },
  }
}

// ── 行内公式 \(...\) ──

export const mathInlineSpec = createInlineContentSpec(
  {
    type: 'mathInline' as const,
    content: 'none' as const,
    propSchema: {
      tex: { default: DEFAULT_INLINE_MATH_TEX },
    },
  },
  {
    parse(element) {
      if (element.tagName !== 'SPAN') return undefined
      if (!element.classList.contains(MATH_HTML_CLASS)) return undefined
      if (element.dataset.display === 'true') return undefined
      return { tex: element.dataset.tex ?? '' }
    },
    render(inlineContent, updateInlineContent) {
      return createMathView({
        tex: inlineContent.props.tex,
        display: false,
        commit: (tex) => updateInlineContent({ type: 'mathInline', props: { tex } }),
      })
    },
    toExternalHTML(inlineContent) {
      const span = document.createElement('span')
      span.className = `${MATH_HTML_CLASS} ${MATH_HTML_CLASS}-inline`
      span.dataset.tex = inlineContent.props.tex
      span.dataset.display = 'false'
      return { dom: span }
    },
  },
)

// ── 块级公式 $$...$$ ──

export const createMathBlockConfig = createBlockConfig(
  () => ({
    type: 'mathBlock' as const,
    propSchema: {
      tex: { default: DEFAULT_BLOCK_MATH_TEX },
    },
    content: 'none' as const,
  }),
)

export const createMathBlockSpec = createBlockSpec(
  createMathBlockConfig,
  {
    meta: {
      isolating: false,
    },
    parse(element) {
      if (element.tagName !== 'DIV') return undefined
      if (!element.classList.contains(MATH_HTML_CLASS)) return undefined
      if (element.dataset.display !== 'true') return undefined
      return { tex: element.dataset.tex ?? '' }
    },
    render(block, editor) {
      return createMathView({
        tex: block.props.tex,
        display: true,
        commit: (tex) => editor.updateBlock(block, { props: { tex } }),
      })
    },
    toExternalHTML(block) {
      const div = document.createElement('div')
      div.className = `${MATH_HTML_CLASS} ${MATH_HTML_CLASS}-block`
      div.dataset.tex = block.props.tex
      div.dataset.display = 'true'
      return { dom: div }
    },
  },
)
