import type { BlockNoteEditor } from '@blocknote/core'
import { normalizeCodeBlockLanguage } from '../../utils/markdown/codeLanguage'
import { prepareWikiLinksForRendering } from '../../utils/markdown/wikiLinks'
import { recordEditorPerformanceOperation } from './useEditorPerformanceDiagnostics'
import {
  tryParseFastMarkdownBlocksOffThread,
  type FastMarkdownParseMetrics,
} from './blockNoteFastMarkdown'
import {
  installBlockNoteDirectMarkdown,
  serializeBlockNoteMarkdown,
  type BlockNoteDirectMarkdownMetrics,
  type DirectMarkdownCapableSerializer,
} from '../../utils/markdown/blockNoteSerializer'

export type AnyBlockNoteEditor = BlockNoteEditor<any, any, any> & DirectMarkdownCapableSerializer
export type BlockNoteBlocks = unknown[]

export interface ParsedBlockNoteDocument {
  blocks: BlockNoteBlocks
  frontMatterPrefix: string
  parseMetrics: FastMarkdownParseMetrics & { parser: 'fast' | 'blocknote' }
}

const FAST_PARSE_THRESHOLD_BYTES = 16 * 1024
const FAST_PARSE_THRESHOLD_LINES = 320
const EMPTY_CHECKLIST_ITEM_FILLER = '\u200B'
const EMPTY_CHECKLIST_ITEM_LINE_RE = /^([ \t]*[-*+][ \t]+\[[ xX]\])[ \t]*$/u
const FRONT_MATTER_RE = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u
const sourceEncoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder()

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function sourceBytes(content: string): number {
  return sourceEncoder ? sourceEncoder.encode(content).byteLength : content.length
}

export function splitBlockNoteFrontMatter(content: string): {
  body: string
  frontMatterPrefix: string
} {
  const match = content.match(FRONT_MATTER_RE)
  return match
    ? { frontMatterPrefix: match[0], body: content.slice(match[0].length) }
    : { frontMatterPrefix: '', body: content }
}

function preProcessEmptyChecklistItems(markdown: string): string {
  return markdown.split(/(\r?\n)/u).map((part) => {
    if (part === '\n' || part === '\r\n') return part
    const match = EMPTY_CHECKLIST_ITEM_LINE_RE.exec(part)
    return match ? `${match[1]} ${EMPTY_CHECKLIST_ITEM_FILLER}` : part
  }).join('')
}

function normalizeSerializedBody(markdown: string): string {
  return markdown
    .split(EMPTY_CHECKLIST_ITEM_FILLER).join('')
    .replace(/[ \t]+$/gmu, '')
    .replace(/\n{3,}/gu, '\n\n')
}

function emptyParagraphBlocks(): BlockNoteBlocks {
  return [{ type: 'paragraph', content: [], children: [] }]
}

function normalizeParsedCodeLanguages(blocks: BlockNoteBlocks): BlockNoteBlocks {
  return blocks.map(normalizeParsedCodeBlock)
}

function normalizeParsedCodeBlock(block: unknown): unknown {
  if (!block || typeof block !== 'object') return block
  const source = block as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] }
  const children = Array.isArray(source.children) ? source.children : null
  let normalizedChildren = source.children
  let childrenChanged = false
  if (children) {
    normalizedChildren = children.map(normalizeParsedCodeBlock)
    childrenChanged = normalizedChildren.some((child, index) => child !== children[index])
  }
  if (source.type !== 'codeBlock') {
    return childrenChanged ? { ...source, children: normalizedChildren } : block
  }

  const props = source.props ?? {}
  const language = normalizeCodeBlockLanguage(props.language)
  return language === props.language && !childrenChanged
    ? block
    : { ...source, props: { ...props, language }, children: normalizedChildren }
}

function readDirectMetrics(editor: AnyBlockNoteEditor): BlockNoteDirectMarkdownMetrics | undefined {
  return editor.__fkeMarkLastDirectMarkdownMetrics
}

export function installFkeMarkBlockNoteSerializer(editor: AnyBlockNoteEditor): void {
  installBlockNoteDirectMarkdown(editor)
}

export async function parseBlockNoteDocument(
  editor: AnyBlockNoteEditor,
  content: string,
): Promise<ParsedBlockNoteDocument> {
  const { body, frontMatterPrefix } = splitBlockNoteFrontMatter(content)
  const preparedBody = preProcessEmptyChecklistItems(prepareWikiLinksForRendering(body))
  const bytes = sourceBytes(preparedBody)
  const sourceLines = preparedBody ? preparedBody.split('\n').length : 1
  const shouldUseFastParser = bytes >= FAST_PARSE_THRESHOLD_BYTES || sourceLines >= FAST_PARSE_THRESHOLD_LINES
  const startedAt = now()

  if (shouldUseFastParser) {
    const fastResult = await tryParseFastMarkdownBlocksOffThread(preparedBody)
    if (fastResult.supported) {
      recordEditorPerformanceOperation('blocknote.parse.fast', now() - startedAt, {
        ...fastResult.metrics,
        sourceCharacters: preparedBody.length,
        sourceLines,
      })
      return {
        blocks: fastResult.blocks.length ? normalizeParsedCodeLanguages(fastResult.blocks) : emptyParagraphBlocks(),
        frontMatterPrefix,
        parseMetrics: { ...fastResult.metrics, parser: 'fast' },
      }
    }
  }

  const parseStartedAt = now()
  const blocks = normalizeParsedCodeLanguages(editor.tryParseMarkdownToBlocks(preparedBody))
  const durationMs = now() - parseStartedAt
  const metrics: FastMarkdownParseMetrics & { parser: 'blocknote' } = {
    blockCount: blocks.length,
    durationMs,
    fallbackReason: shouldUseFastParser ? 'fast-parser-unsupported' : null,
    sourceBytes: bytes,
    parser: 'blocknote',
  }
  recordEditorPerformanceOperation('blocknote.parse.fallback', durationMs, {
    ...metrics,
    sourceCharacters: preparedBody.length,
    sourceLines,
  })
  return {
    blocks: blocks.length ? blocks : emptyParagraphBlocks(),
    frontMatterPrefix,
    parseMetrics: metrics,
  }
}

export function serializeBlockNoteDocument(options: {
  blocks: BlockNoteBlocks
  editor: AnyBlockNoteEditor
  sourceContent: string
}): string {
  const { blocks, editor, sourceContent } = options
  const startedAt = now()
  delete editor.__fkeMarkLastDirectMarkdownMetrics
  const body = normalizeSerializedBody(serializeBlockNoteMarkdown(editor, blocks))
  const metrics = readDirectMetrics(editor)
  const durationMs = now() - startedAt
  recordEditorPerformanceOperation('blocknote.serialize', durationMs, {
    blockCount: metrics?.blockCount ?? blocks.length,
    cacheHits: metrics?.cacheHits ?? null,
    cacheMisses: metrics?.cacheMisses ?? null,
    fallbackReason: metrics?.fallbackReason ?? null,
    sourceCharacters: sourceContent.length,
    sourceLines: sourceContent ? sourceContent.split(/\r?\n/u).length : 1,
  })
  return `${splitBlockNoteFrontMatter(sourceContent).frontMatterPrefix}${body}`
}
