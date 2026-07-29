import { createExtension } from '@blocknote/core'
import type { Mark, Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

interface DelimiterDefinition {
  start: string
  end: string
}

const markdownMarkerKey = new PluginKey<DecorationSet>('fkeMarkMarkdownMarkers')
const markDelimiters: Record<string, DelimiterDefinition> = {
  bold: { start: '**', end: '**' },
  italic: { start: '*', end: '*' },
  code: { start: '`', end: '`' },
  strike: { start: '~~', end: '~~' },
  underline: { start: '<u>', end: '</u>' },
  highlight: { start: '==', end: '==' },
  link: { start: '[', end: ']' },
}

function createDelimiterWidget(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'md-delimiter visible'
  span.textContent = text
  span.setAttribute('contenteditable', 'false')
  return span
}

function findMarkRange($pos: ResolvedPos, mark: Mark): { from: number; to: number } | null {
  const parent = $pos.parent
  if (!parent.isTextblock) return null

  let index = $pos.index()
  if ($pos.textOffset === 0 && index > 0) {
    const previous = parent.child(index - 1)
    if (previous.isText && previous.marks.some((candidate) => candidate.eq(mark))) index--
  }

  if (index >= parent.childCount) return null
  const child = parent.child(index)
  if (!child.isText || !child.marks.some((candidate) => candidate.eq(mark))) return null

  let startIndex = index
  while (startIndex > 0) {
    const previous = parent.child(startIndex - 1)
    if (!previous.isText || !previous.marks.some((candidate) => candidate.eq(mark))) break
    startIndex--
  }

  let endIndex = index
  while (endIndex < parent.childCount - 1) {
    const next = parent.child(endIndex + 1)
    if (!next.isText || !next.marks.some((candidate) => candidate.eq(mark))) break
    endIndex++
  }

  const parentStart = $pos.start()
  let from = parentStart
  for (let childIndex = 0; childIndex < startIndex; childIndex++) {
    from += parent.child(childIndex).nodeSize
  }

  let to = from
  for (let childIndex = startIndex; childIndex <= endIndex; childIndex++) {
    to += parent.child(childIndex).nodeSize
  }
  return { from, to }
}

function computeDecorations(
  doc: ProseMirrorNode,
  selection: { empty: boolean; from: number },
): DecorationSet {
  if (!selection.empty) return DecorationSet.empty

  const decorations: Decoration[] = []
  const $from = doc.resolve(selection.from)
  for (const mark of $from.marks()) {
    const delimiter = markDelimiters[mark.type.name]
    if (!delimiter) continue

    const range = findMarkRange($from, mark)
    if (!range) continue
    decorations.push(Decoration.widget(
      range.from,
      () => createDelimiterWidget(delimiter.start),
      { side: -1 },
    ))

    const end = mark.type.name === 'link'
      ? `](${typeof mark.attrs.href === 'string' ? mark.attrs.href : ''})`
      : delimiter.end
    decorations.push(Decoration.widget(
      range.to,
      () => createDelimiterWidget(end),
      { side: 1 },
    ))
  }

  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty
}

export const markdownMarkerExtension = createExtension({
  key: 'fkeMarkMarkdownMarkers',
  prosemirrorPlugins: [
    new Plugin<DecorationSet>({
      key: markdownMarkerKey,
      state: {
        init: (_, state) => computeDecorations(state.doc, state.selection),
        apply(transaction, previous) {
          if (!transaction.docChanged && !transaction.selectionSet) return previous
          return computeDecorations(transaction.doc, transaction.selection)
        },
      },
      props: {
        decorations(state) {
          return markdownMarkerKey.getState(state) ?? DecorationSet.empty
        },
      },
    }),
  ],
})
