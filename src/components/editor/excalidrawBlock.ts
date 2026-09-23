import { createBlockConfig, createBlockSpec } from '@blocknote/core'
import { isExcalidrawLanguage, isExcalidrawSource, createEmptyExcalidrawScene } from '../../utils/markdown/excalidraw'
import { createExcalidrawBlockView } from './excalidrawBlockView'

export const DEFAULT_EXCALIDRAW_SCENE = createEmptyExcalidrawScene()

export function excalidrawSourceFromCodeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((item) => {
    if (!item || typeof item !== 'object') return ''
    return typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : ''
  }).join('')
}

export function excalidrawBlockFromCodeBlock(block: {
  type?: unknown
  props?: Record<string, unknown>
  content?: unknown
  children?: unknown[]
}): { type: 'excalidraw'; props: { source: string }; children: unknown[] } | null {
  if (block.type !== 'codeBlock') return null
  const source = excalidrawSourceFromCodeContent(block.content)
  if (!isExcalidrawLanguage(block.props?.language) && !isExcalidrawSource(source)) return null
  return {
    type: 'excalidraw',
    props: { source: source.trim() || DEFAULT_EXCALIDRAW_SCENE },
    children: Array.isArray(block.children) ? block.children : [],
  }
}

type ExcalidrawPromoteEditor = {
  document: unknown[]
  getBlock: (id: string) => unknown
  replaceBlocks: (targets: never[], blocks: never[]) => unknown
}

function visitBlocks(blocks: unknown[], visit: (block: {
  id?: unknown
  type?: unknown
  props?: Record<string, unknown>
  content?: unknown
  children?: unknown[]
}) => void) {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { id?: unknown; type?: unknown; props?: Record<string, unknown>; content?: unknown; children?: unknown[] }
    visit(block)
    if (Array.isArray(block.children)) visitBlocks(block.children, visit)
  }
}

export function promoteExcalidrawCodeBlocks(editor: ExcalidrawPromoteEditor): boolean {
  const ids: string[] = []
  visitBlocks(editor.document, (block) => {
    if (typeof block.id === 'string' && excalidrawBlockFromCodeBlock(block)) ids.push(block.id)
  })
  if (ids.length === 0) return false
  for (const id of ids) {
    const block = editor.getBlock(id)
    if (!block || typeof block !== 'object') continue
    const promoted = excalidrawBlockFromCodeBlock(block as {
      type?: unknown
      props?: Record<string, unknown>
      content?: unknown
      children?: unknown[]
    })
    if (!promoted) continue
    editor.replaceBlocks([block] as never[], [promoted] as never[])
  }
  return true
}

function languageFromElement(element: HTMLElement): string {
  const fromData = element.getAttribute('data-language')
  if (fromData) return fromData
  const token = element.className.split(/\s+/).find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

export const createExcalidrawBlockConfig = createBlockConfig(
  () => ({
    type: 'excalidraw' as const,
    propSchema: {
      source: { default: DEFAULT_EXCALIDRAW_SCENE },
    },
    content: 'none' as const,
  }),
)

export const createExcalidrawBlockSpec = createBlockSpec(
  createExcalidrawBlockConfig,
  {
    meta: { isolating: false },
    parse(element) {
      if (element.tagName !== 'PRE') return undefined
      if (element.childElementCount !== 1 || element.firstElementChild?.tagName !== 'CODE') return undefined
      const code = element.firstElementChild as HTMLElement
      const language = languageFromElement(code) || languageFromElement(element)
      const source = code.textContent ?? ''
      if (!isExcalidrawLanguage(language) && !isExcalidrawSource(source)) return undefined
      return { source: source.trim() || DEFAULT_EXCALIDRAW_SCENE }
    },
    render(block, editor) {
      return createExcalidrawBlockView(block, editor)
    },
    toExternalHTML(block) {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.className = 'language-excalidraw'
      code.dataset.language = 'excalidraw'
      code.textContent = block.props.source
      pre.appendChild(code)
      return { dom: pre }
    },
    runsBefore: ['codeBlock'],
  },
)
