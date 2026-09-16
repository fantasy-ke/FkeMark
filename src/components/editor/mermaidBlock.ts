import { createBlockConfig, createBlockSpec } from '@blocknote/core'
import { isMermaidLanguage, isMermaidSource } from '../../utils/markdown/mermaid'
import { createMermaidBlockView } from './mermaidBlockView'

export const DEFAULT_MERMAID_SOURCE = 'flowchart LR\n  A[Start] --> B[End]'

export function mermaidSourceFromCodeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((item) => {
    if (!item || typeof item !== 'object') return ''
    return typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : ''
  }).join('')
}

export function mermaidBlockFromCodeBlock(block: {
  type?: unknown
  props?: Record<string, unknown>
  content?: unknown
  children?: unknown[]
}): { type: 'mermaid'; props: { source: string }; children: unknown[] } | null {
  if (block.type !== 'codeBlock') return null
  const source = mermaidSourceFromCodeContent(block.content)
  if (!isMermaidLanguage(block.props?.language) && !isMermaidSource(source)) return null
  return {
    type: 'mermaid',
    props: { source },
    children: Array.isArray(block.children) ? block.children : [],
  }
}

function languageFromElement(element: HTMLElement): string {
  const fromData = element.getAttribute('data-language')
  if (fromData) return fromData
  const token = element.className.split(/\s+/).find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

export const createMermaidBlockConfig = createBlockConfig(
  () => ({
    type: 'mermaid' as const,
    propSchema: {
      source: { default: DEFAULT_MERMAID_SOURCE },
    },
    content: 'none' as const,
  }),
)

export const createMermaidBlockSpec = createBlockSpec(
  createMermaidBlockConfig,
  {
    meta: {
      isolating: false,
    },
    parse(element) {
      if (element.tagName !== 'PRE') return undefined
      if (element.childElementCount !== 1 || element.firstElementChild?.tagName !== 'CODE') return undefined
      const code = element.firstElementChild as HTMLElement
      const language = languageFromElement(code) || languageFromElement(element)
      const source = code.textContent ?? ''
      if (!isMermaidLanguage(language) && !isMermaidSource(source)) return undefined
      return { source }
    },
    render(block, editor) {
      return createMermaidBlockView(block, editor)
    },
    toExternalHTML(block) {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.className = 'language-mermaid'
      code.dataset.language = 'mermaid'
      code.textContent = block.props.source
      pre.appendChild(code)
      return { dom: pre }
    },
    runsBefore: ['codeBlock'],
  },
)
