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

import { markdownToHtml as builtinMdToHtml, htmlToMarkdown as builtinHtmlToMd, escapeHtml as builtinEscapeHtml } from './markdown'
import { markdownToHtml as thirdMdToHtml, htmlToMarkdown as thirdHtmlToMd } from './markdown.third'

export type MarkdownEngine = 'builtin' | 'third'

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
