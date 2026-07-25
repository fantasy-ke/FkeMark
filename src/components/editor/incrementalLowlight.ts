import { getChangedRanges } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface HighlightNode {
  value?: unknown
  properties?: { className?: unknown }
  children?: unknown
}

interface HighlightResult {
  children?: unknown[]
}

export interface IncrementalLowlight {
  highlight: (language: string, value: string) => HighlightResult
  highlightAuto: (value: string) => HighlightResult
  registered?: (language: string) => boolean
  listLanguages: () => string[]
}

interface IncrementalLowlightOptions {
  defaultLanguage?: string | null
  lowlight: IncrementalLowlight
  name: string
}

interface HighlightToken {
  classes: string[]
  text: string
}

interface CodeBlockRange {
  from: number
  node: ProseMirrorNode
  to: number
}

function flattenHighlightNodes(nodes: unknown[], classes: string[] = []): HighlightToken[] {
  return nodes.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const node = value as HighlightNode
    const classNames = Array.isArray(node.properties?.className)
      ? node.properties.className.filter((className): className is string => typeof className === 'string')
      : []
    const nextClasses = [...classes, ...classNames]
    if (Array.isArray(node.children)) return flattenHighlightNodes(node.children, nextClasses)
    return typeof node.value === 'string' ? [{ classes: nextClasses, text: node.value }] : []
  })
}

function highlightCodeBlock(
  block: CodeBlockRange,
  lowlight: IncrementalLowlight,
  defaultLanguage?: string | null,
): Decoration[] {
  const language = block.node.attrs.language || defaultLanguage
  const registered = language
    ? lowlight.registered?.(language) ?? lowlight.listLanguages().includes(language)
    : false
  const result = registered
    ? lowlight.highlight(language, block.node.textContent)
    : lowlight.highlightAuto(block.node.textContent)
  const decorations: Decoration[] = []
  let from = block.from + 1

  flattenHighlightNodes(result.children ?? []).forEach((token) => {
    const to = from + token.text.length
    if (token.classes.length > 0 && to > from) {
      decorations.push(Decoration.inline(from, to, { class: token.classes.join(' ') }))
    }
    from = to
  })

  return decorations
}

function collectCodeBlocks(
  doc: ProseMirrorNode,
  name: string,
  from = 0,
  to = doc.content.size,
): CodeBlockRange[] {
  const blocks = new Map<number, CodeBlockRange>()
  if (to < from) return []

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== name) return true
    blocks.set(pos, { from: pos, node, to: pos + node.nodeSize })
    return false
  })
  return [...blocks.values()]
}

function containingCodeBlock(doc: ProseMirrorNode, name: string, pos: number): CodeBlockRange | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (node.type.name !== name) continue
    const from = resolved.before(depth)
    return { from, node, to: from + node.nodeSize }
  }
  return null
}

function affectedCodeBlocks(
  doc: ProseMirrorNode,
  name: string,
  ranges: Array<{ from: number; to: number }>,
): CodeBlockRange[] {
  const blocks = new Map<number, CodeBlockRange>()

  ranges.forEach((range) => {
    const from = Math.max(0, Math.min(range.from, doc.content.size))
    const to = Math.max(from, Math.min(range.to, doc.content.size))
    const scanFrom = Math.max(0, from - 1)
    const scanTo = Math.min(doc.content.size, Math.max(scanFrom, to + 1))

    collectCodeBlocks(doc, name, scanFrom, scanTo).forEach((block) => blocks.set(block.from, block))
    const startBlock = containingCodeBlock(doc, name, from)
    const endBlock = containingCodeBlock(doc, name, to)
    if (startBlock) blocks.set(startBlock.from, startBlock)
    if (endBlock) blocks.set(endBlock.from, endBlock)
  })

  return [...blocks.values()]
}

function mergeRanges(ranges: Array<{ from: number; to: number }>) {
  const sorted = ranges
    .map(({ from, to }) => ({ from: Math.min(from, to), to: Math.max(from, to) }))
    .sort((left, right) => left.from - right.from)
  const merged: Array<{ from: number; to: number }> = []

  sorted.forEach((range) => {
    const previous = merged.at(-1)
    if (!previous || range.from > previous.to + 1) {
      merged.push({ ...range })
      return
    }
    previous.to = Math.max(previous.to, range.to)
  })
  return merged
}

function buildDecorations(
  doc: ProseMirrorNode,
  blocks: CodeBlockRange[],
  lowlight: IncrementalLowlight,
  defaultLanguage?: string | null,
) {
  return DecorationSet.create(
    doc,
    blocks.flatMap((block) => highlightCodeBlock(block, lowlight, defaultLanguage)),
  )
}

/**
 * 仅重新高亮 transaction 涉及的代码块，避免每次输入都遍历整篇 ProseMirror 文档。
 */
export function createIncrementalLowlightPlugin({
  defaultLanguage,
  lowlight,
  name,
}: IncrementalLowlightOptions) {
  const key = new PluginKey<DecorationSet>('incrementalLowlight')

  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => buildDecorations(
        state.doc,
        collectCodeBlocks(state.doc, name),
        lowlight,
        defaultLanguage,
      ),
      apply: (transaction, decorations) => {
        if (!transaction.docChanged) return decorations

        const changedRanges = getChangedRanges(transaction).map((change) => change.newRange)
        if (changedRanges.length === 0) {
          return buildDecorations(
            transaction.doc,
            collectCodeBlocks(transaction.doc, name),
            lowlight,
            defaultLanguage,
          )
        }

        const blocks = affectedCodeBlocks(transaction.doc, name, changedRanges)
        const cleanupRanges = mergeRanges([
          ...changedRanges,
          ...blocks.map((block) => ({ from: block.from, to: block.to })),
        ])
        let nextDecorations = decorations.map(transaction.mapping, transaction.doc)
        cleanupRanges.forEach(({ from, to }) => {
          nextDecorations = nextDecorations.remove(nextDecorations.find(from, to))
        })

        return nextDecorations.add(
          transaction.doc,
          blocks.flatMap((block) => highlightCodeBlock(block, lowlight, defaultLanguage)),
        )
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)
      },
    },
  })
}
