/**
 * Markdown 引擎路由层
 *
 * 根据用户选择切换内置手写引擎与第三方（markdown-it + turndown）引擎。
 * 对外暴露与 markdown.ts 完全相同的 API（markdownToHtml / htmlToMarkdown / escapeHtml）。
 *
 * 切换通过 localStorage('markdown-engine') 持久化：
 * - 'third'    → 第三方引擎（默认）
 * - 'builtin'  → 手写引擎
 */

import katex from 'katex'
import { markdownToHtml as builtinMdToHtml, htmlToMarkdown as builtinHtmlToMd, escapeHtml as builtinEscapeHtml } from './markdown'
import { markdownToHtml as thirdMdToHtml, htmlToMarkdown as thirdHtmlToMd } from './markdown.third'

export type MarkdownEngine = 'builtin' | 'third'

/**
 * 把 HTML 中的数学公式占位符（.fk-math[data-tex]）渲染为 KaTeX HTML。
 * 用于分栏模式右侧的纯静态预览（不走 TipTap，需自行渲染公式）。
 */
function applyKatexToHtml(html: string): string {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll<HTMLElement>('.fk-math[data-tex]').forEach((el) => {
      const tex = el.getAttribute('data-tex') || ''
      const display = el.getAttribute('data-display') === 'true'
      let rendered: string
      try {
        rendered = katex.renderToString(tex || '', {
          displayMode: display,
          throwOnError: false,
          output: 'htmlAndMathml',
        })
      } catch {
        rendered = `<span class="math-render-error">${tex}</span>`
      }
      el.innerHTML = rendered
      el.classList.add('fk-math-rendered')
    })
    return doc.body.innerHTML
  } catch {
    return html
  }
}

const STORAGE_KEY = 'markdown-engine'

/**
 * 获取当前激活的 Markdown 引擎
 */
export function getMarkdownEngine(): MarkdownEngine {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'builtin' || stored === 'third') return stored
  } catch {
    // localStorage 不可用（SSR / 测试环境）
  }
  return 'third'
}

/**
 * 设置当前激活的 Markdown 引擎（持久化到 localStorage）
 */
export function setMarkdownEngine(engine: MarkdownEngine): void {
  try {
    localStorage.setItem(STORAGE_KEY, engine)
  } catch {
    // localStorage 不可用
  }
}

/**
 * Markdown → TipTap 兼容 HTML
 */
export function markdownToHtml(md: string, docDir?: string | null): string {
  const engine = getMarkdownEngine()
  if (engine === 'third') return thirdMdToHtml(md, docDir)
  return builtinMdToHtml(md, docDir)
}

/**
 * HTML → Markdown（支持 TipTap 自定义属性无损往返）
 */
export function htmlToMarkdown(html: string, docDir?: string | null): string {
  const engine = getMarkdownEngine()
  if (engine === 'third') return thirdHtmlToMd(html, docDir)
  return builtinHtmlToMd(html, docDir)
}

/**
 * HTML 转义（始终使用手写引擎的工具函数）
 */
export { builtinEscapeHtml as escapeHtml }

/**
 * Markdown → 预览 HTML（静态渲染，含 KaTeX 公式）
 *
 * 与 markdownToHtml 的区别：本函数在得到 TipTap 兼容 HTML 后，
 * 额外把 `data-tex` 数学占位符渲染为 KaTeX HTML，使其可直接用于
 * 分栏模式右侧的纯静态预览（不走 TipTap，避免双实例滚动/反馈回路问题）。
 */
export function markdownToPreviewHtml(md: string, docDir?: string | null): string {
  const html = markdownToHtml(md, docDir)
  return applyKatexToHtml(html)
}
