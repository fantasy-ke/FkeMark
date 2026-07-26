import { DOMSerializer, type Mark, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { MarkdownSerializer, type MarkdownSerializerState } from '@tiptap/pm/markdown'
import { toRelPath } from '../asset'
import { htmlToMarkdown } from './engine'
import { restoreWikiLinksFromMarkdown } from './wikiLinks'

const ASYNC_SERIALIZATION_BATCH_SIZE = 64
const ASYNC_SERIALIZATION_BUDGET_MS = 8

const SUPPORTED_NODES = new Set([
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'imageUpload',
  'listItem',
  'mathBlock',
  'mathInline',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'taskItem',
  'taskList',
  'text',
])

const SUPPORTED_MARKS = new Set([
  'bold',
  'code',
  'documentTag',
  'highlight',
  'italic',
  'link',
  'strike',
  'textStyle',
  'underline',
])

interface CachedMarkdownBlock {
  docDir: string | null
  markdown: string
  fallbackNodeTypes: string[]
  omittedNodeTypes: string[]
}

export interface ProseMirrorMarkdownMetrics {
  blockCount: number
  cacheHits: number
  cacheMisses: number
  fallbackBlocks: number
  fallbackNodeTypes: string[]
  omittedNodeTypes: string[]
  outputCharacters: number
  yieldCount: number
}

export interface ProseMirrorMarkdownResult {
  markdown: string
  metrics: ProseMirrorMarkdownMetrics
}

export interface ProseMirrorMarkdownSerializer {
  serialize: (documentNode: ProseMirrorNode, docDir: string | null) => ProseMirrorMarkdownResult
  serializeAsync: (
    documentNode: ProseMirrorNode,
    docDir: string | null,
    yieldControl: () => Promise<void>,
  ) => Promise<ProseMirrorMarkdownResult>
  clearCache: () => void
}

interface BlockSupport {
  fallbackNodeTypes: string[]
  omittedNodeTypes: string[]
}

function inspectBlockSupport(block: ProseMirrorNode): BlockSupport {
  const fallbackNodeTypes = new Set<string>()
  const omittedNodeTypes = new Set<string>()

  const inspectNode = (node: ProseMirrorNode) => {
    if (!SUPPORTED_NODES.has(node.type.name)) fallbackNodeTypes.add(`node:${node.type.name}`)
    if (node.type.name === 'imageUpload' && (node.attrs.status !== 'done' || !node.attrs.src)) {
      omittedNodeTypes.add('node:imageUpload:pending')
    }
    if (node.type.name === 'orderedList' && node.attrs.listStyle && node.attrs.listStyle !== 'decimal') {
      omittedNodeTypes.add(`node:orderedList:listStyle:${node.attrs.listStyle}`)
    }
    node.marks.forEach((mark) => {
      if (!SUPPORTED_MARKS.has(mark.type.name)) fallbackNodeTypes.add(`mark:${mark.type.name}`)
    })
  }

  inspectNode(block)
  block.descendants((node) => {
    inspectNode(node)
    return true
  })
  return {
    fallbackNodeTypes: [...fallbackNodeTypes].sort(),
    omittedNodeTypes: [...omittedNodeTypes].sort(),
  }
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length))
}

function inlineCodeFence(node: ProseMirrorNode, side: -1 | 1): string {
  const length = longestBacktickRun(node.text ?? '')
  let fence = '`'.repeat(Math.max(1, length + 1))
  if (length > 0 && side < 0) fence += ' '
  if (length > 0 && side > 0) fence = ` ${fence}`
  return fence
}

function escapeLinkDestination(value: string): string {
  return value.replace(/[()"\\]/g, '\\$&')
}

function imageMarkdown(attrs: Record<string, unknown>, docDir: string | null): string {
  const source = toRelPath(String(attrs.src ?? ''), docDir)
  const alt = String(attrs.alt ?? '').replace(/([\\\]])/g, '\\$1')
  const title = attrs.title ? ` "${String(attrs.title).replace(/"/g, '\\"')}"` : ''
  const width = attrs.width
  const height = attrs.height
  const widthValue = width == null ? '' : `${width}${String(attrs.widthUnit ?? 'px')}`
  const heightValue = height == null ? '' : `${height}${String(attrs.heightUnit ?? 'px')}`
  const size = widthValue || heightValue ? ` <!-- size:${widthValue}x${heightValue} -->` : ''
  return `![${alt}](${escapeLinkDestination(source)}${title})${size}`
}

function normalizedCodeLanguage(value: unknown): string {
  const language = String(value ?? '').trim()
  return language === 'plaintext' || language === 'text' ? '' : language
}

function renderCodeBlock(state: MarkdownSerializerState, node: ProseMirrorNode) {
  if (node.attrs.frontmatter) {
    state.write('---\n')
    state.text(node.textContent.replace(/\n+$/, ''), false)
    state.write('\n---')
    state.closeBlock(node)
    return
  }

  const fence = '`'.repeat(Math.max(3, longestBacktickRun(node.textContent) + 1))
  state.write(`${fence}${normalizedCodeLanguage(node.attrs.language)}\n`)
  state.text(node.textContent.replace(/\n+$/, ''), false)
  state.write(`\n${fence}`)
  state.closeBlock(node)
}

function renderTable(
  table: ProseMirrorNode,
  serializeContent: (content: ProseMirrorNode) => string,
): string {
  const rows: string[][] = []
  table.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => {
      const markdown = serializeContent(cell)
        .trim()
        .replace(/\n+/g, '<br>')
      cells.push(markdown)
    })
    rows.push(cells)
  })
  if (rows.length === 0) return ''

  const columnCount = Math.max(0, ...rows.map((row) => row.length))
  if (columnCount === 0) return ''
  const pad = (row: string[]) => [...row, ...Array(columnCount).fill('')].slice(0, columnCount)
  const storedSeparators = typeof table.attrs.separators === 'string'
    ? table.attrs.separators.split('|')
    : []
  const separators = Array.from({ length: columnCount }, (_, index) => storedSeparators[index] || '---')
  return [
    `| ${pad(rows[0]).join(' | ')} |`,
    `| ${separators.join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${pad(row).join(' | ')} |`),
  ].join('\n')
}

function formatFootnoteDefinition(label: string, markdown: string): string {
  const lines = markdown.trim().split('\n')
  const first = lines.shift() ?? ''
  return [`[^${label}]: ${first}`, ...lines.map((line) => `    ${line}`)].join('\n')
}

function hasFootnoteLink(mark: Mark): boolean {
  return mark.type.name === 'link' && Boolean(mark.attrs.footnoteRef || mark.attrs.footnoteBackref)
}

interface DirectMarkdownSerializer {
  serialize: (node: ProseMirrorNode, docDir: string | null) => string
}

function createMarkdownSerializer(schema: Schema): DirectMarkdownSerializer {
  let serializer: MarkdownSerializer
  let currentDocDir: string | null = null
  const serializeContent = (node: ProseMirrorNode) => serializer
    .serialize(schema.topNodeType.create(null, node.content))
    .trim()

  serializer = new MarkdownSerializer({
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },
    bulletList(state, node) {
      const marker = ['*', '+', '-'].includes(node.attrs.marker) ? node.attrs.marker : '-'
      state.renderList(node, '  ', () => `${marker} `)
    },
    codeBlock: renderCodeBlock,
    hardBreak(state, node, parent, index) {
      for (let next = index + 1; next < parent.childCount; next += 1) {
        if (parent.child(next).type !== node.type) {
          state.write('\\\n')
          return
        }
      }
    },
    heading(state, node) {
      state.write(`${'#'.repeat(Number(node.attrs.level) || 1)} `)
      state.renderInline(node)
      state.closeBlock(node)
    },
    horizontalRule(state, node) {
      state.write('---')
      state.closeBlock(node)
    },
    image(state, node) {
      state.write(imageMarkdown(node.attrs, currentDocDir))
    },
    imageUpload(state, node) {
      if (node.attrs.status === 'done' && node.attrs.src) {
        state.write(imageMarkdown({ ...node.attrs, alt: node.attrs.name }, currentDocDir))
      }
    },
    listItem(state, node) {
      state.renderContent(node)
    },
    mathBlock(state, node) {
      state.write(`$$\n${String(node.attrs.tex ?? '')}\n$$`)
      state.closeBlock(node)
    },
    mathInline(state, node) {
      state.write(`\\(${String(node.attrs.tex ?? '')}\\)`)
    },
    orderedList(state, node) {
      if (node.attrs.footnotes) {
        const definitions: string[] = []
        node.forEach((item, _offset, index) => {
          const label = String(item.attrs.footnoteLabel || index + 1)
          definitions.push(formatFootnoteDefinition(label, serializeContent(item)))
        })
        state.write(definitions.join('\n'))
        state.closeBlock(node)
        return
      }
      const start = Number(node.attrs.start) || 1
      const maxWidth = String(start + node.childCount - 1).length
      state.renderList(node, ' '.repeat(maxWidth + 2), (index) => {
        const value = String(start + index)
        return `${' '.repeat(maxWidth - value.length)}${value}. `
      })
    },
    paragraph(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },
    table(state, node) {
      state.write(renderTable(node, serializeContent))
      state.closeBlock(node)
    },
    tableCell() {},
    tableHeader() {},
    tableRow() {},
    taskItem(state, node) {
      state.renderContent(node)
    },
    taskList(state, node) {
      state.renderList(node, '  ', (index) => node.child(index).attrs.checked ? '- [x] ' : '- [ ] ')
    },
    text(state, node) {
      if (node.marks.some(hasFootnoteLink)) return
      state.text(node.text ?? '', true)
    },
  }, {
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    code: {
      open: (_state, _mark, parent, index) => inlineCodeFence(parent.child(index), -1),
      close: (_state, _mark, parent, index) => inlineCodeFence(parent.child(index - 1), 1),
      escape: false,
    },
    documentTag: { open: '', close: '', mixable: true },
    highlight: { open: '==', close: '==', mixable: true },
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open: (_state, mark) => mark.attrs.footnoteRef ? `[^${mark.attrs.footnoteRef}]` : mark.attrs.footnoteBackref ? '' : '[',
      close: (_state, mark) => {
        if (mark.attrs.footnoteRef || mark.attrs.footnoteBackref) return ''
        const href = escapeLinkDestination(String(mark.attrs.href ?? ''))
        const title = mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : ''
        return `](${href}${title})`
      },
      mixable: true,
    },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    textStyle: { open: '', close: '', mixable: true },
    underline: { open: '<u>', close: '</u>', mixable: true },
  }, {
    escapeExtraCharacters: /[|]/g,
  })
  return {
    serialize(node, docDir) {
      currentDocDir = docDir
      return serializer.serialize(node, { tightLists: true })
    },
  }
}

function fallbackBlockToMarkdown(
  block: ProseMirrorNode,
  domSerializer: DOMSerializer,
  docDir: string | null,
): string {
  const container = document.createElement('div')
  container.appendChild(domSerializer.serializeNode(block))
  return htmlToMarkdown(container.innerHTML, docDir).trim()
}

export function createProseMirrorMarkdownSerializer(schema: Schema): ProseMirrorMarkdownSerializer {
  let cache = new WeakMap<ProseMirrorNode, CachedMarkdownBlock>()
  const serializer = createMarkdownSerializer(schema)
  const domSerializer = DOMSerializer.fromSchema(schema)

  interface SerializationState {
    blocks: string[]
    fallbackNodeTypes: Set<string>
    omittedNodeTypes: Set<string>
    cacheHits: number
    cacheMisses: number
    fallbackBlocks: number
  }

  const createState = (): SerializationState => ({
    blocks: [],
    fallbackNodeTypes: new Set<string>(),
    omittedNodeTypes: new Set<string>(),
    cacheHits: 0,
    cacheMisses: 0,
    fallbackBlocks: 0,
  })

  const appendBlock = (state: SerializationState, block: ProseMirrorNode, docDir: string | null) => {
    let cached = cache.get(block)
    if (!cached || cached.docDir !== docDir) {
      const support = inspectBlockSupport(block)
      const markdown = support.fallbackNodeTypes.length > 0
        ? fallbackBlockToMarkdown(block, domSerializer, docDir)
        : serializer.serialize(schema.topNodeType.create(null, block), docDir).trim()
      cached = {
        docDir,
        markdown,
        fallbackNodeTypes: support.fallbackNodeTypes,
        omittedNodeTypes: support.omittedNodeTypes,
      }
      cache.set(block, cached)
      state.cacheMisses += 1
    } else {
      state.cacheHits += 1
    }

    if (cached.fallbackNodeTypes.length > 0) state.fallbackBlocks += 1
    cached.fallbackNodeTypes.forEach((type) => state.fallbackNodeTypes.add(type))
    cached.omittedNodeTypes.forEach((type) => state.omittedNodeTypes.add(type))
    state.blocks.push(cached.markdown)
  }

  const finish = (
    documentNode: ProseMirrorNode,
    state: SerializationState,
    yieldCount: number,
  ): ProseMirrorMarkdownResult => {
    const combinedBlocks: string[] = []
    for (const block of state.blocks) {
      const previous = combinedBlocks.at(-1)
      if (previous && /^!\[[^\n]*\]\([^\n]*\)$/.test(previous) && /^<!--\s*size:[^\n]*-->$/.test(block)) {
        combinedBlocks[combinedBlocks.length - 1] = `${previous} ${block}`
      } else {
        combinedBlocks.push(block)
      }
    }
    const markdown = restoreWikiLinksFromMarkdown(combinedBlocks.join('\n\n').trim())
    return {
      markdown,
      metrics: {
        blockCount: documentNode.childCount,
        cacheHits: state.cacheHits,
        cacheMisses: state.cacheMisses,
        fallbackBlocks: state.fallbackBlocks,
        fallbackNodeTypes: [...state.fallbackNodeTypes].sort(),
        omittedNodeTypes: [...state.omittedNodeTypes].sort(),
        outputCharacters: markdown.length,
        yieldCount,
      },
    }
  }

  return {
    serialize(documentNode, docDir) {
      const state = createState()
      documentNode.forEach((block) => appendBlock(state, block, docDir))
      return finish(documentNode, state, 0)
    },
    async serializeAsync(documentNode, docDir, yieldControl) {
      const state = createState()
      let sliceStartedAt = performance.now()
      let blocksInSlice = 0
      let yieldCount = 0

      for (let index = 0; index < documentNode.childCount; index += 1) {
        appendBlock(state, documentNode.child(index), docDir)
        blocksInSlice += 1
        if (index === documentNode.childCount - 1) continue
        if (
          blocksInSlice < ASYNC_SERIALIZATION_BATCH_SIZE
          && performance.now() - sliceStartedAt < ASYNC_SERIALIZATION_BUDGET_MS
        ) continue

        await yieldControl()
        yieldCount += 1
        blocksInSlice = 0
        sliceStartedAt = performance.now()
      }

      return finish(documentNode, state, yieldCount)
    },
    clearCache() {
      cache = new WeakMap<ProseMirrorNode, CachedMarkdownBlock>()
    },
  }
}
