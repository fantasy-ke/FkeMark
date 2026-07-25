import { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { describe, expect, it, vi } from 'vitest'
import {
  createIncrementalLowlightPlugin,
  type IncrementalLowlight,
} from '../src/components/editor/incrementalLowlight'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    codeBlock: {
      attrs: { language: { default: null } },
      code: true,
      content: 'text*',
      defining: true,
      group: 'block',
      marks: '',
    },
    text: { group: 'inline' },
  },
})

function textBlock(type: 'paragraph' | 'codeBlock', text: string, language?: string) {
  return schema.node(type, type === 'codeBlock' ? { language: language ?? null } : null, text ? schema.text(text) : undefined)
}

function createLowlight(): IncrementalLowlight & {
  highlight: ReturnType<typeof vi.fn>
  highlightAuto: ReturnType<typeof vi.fn>
} {
  return {
    highlight: vi.fn((_language: string, value: string) => ({
      children: [{ properties: { className: ['hljs-token'] }, value }],
    })),
    highlightAuto: vi.fn((value: string) => ({
      children: [{ properties: { className: ['hljs-token'] }, value }],
    })),
    listLanguages: () => ['javascript', 'plaintext'],
    registered: (language: string) => ['javascript', 'plaintext'].includes(language),
  }
}

function createState(lowlight: IncrementalLowlight) {
  return EditorState.create({
    doc: schema.node('doc', null, [
      textBlock('paragraph', 'outside'),
      textBlock('codeBlock', 'const first = 1', 'javascript'),
      textBlock('codeBlock', 'const second = 2', 'javascript'),
    ]),
    plugins: [createIncrementalLowlightPlugin({
      defaultLanguage: 'plaintext',
      lowlight,
      name: 'codeBlock',
    })],
  })
}

describe('增量代码高亮', () => {
  it('编辑普通段落时不扫描或重新高亮整篇文档', () => {
    const lowlight = createLowlight()
    const state = createState(lowlight)
    lowlight.highlight.mockClear()
    lowlight.highlightAuto.mockClear()
    const descendantsSpy = vi.spyOn(ProseMirrorNode.prototype, 'descendants')

    state.apply(state.tr.insertText('!', 2))

    expect(descendantsSpy).not.toHaveBeenCalled()
    expect(lowlight.highlight).not.toHaveBeenCalled()
    expect(lowlight.highlightAuto).not.toHaveBeenCalled()
    descendantsSpy.mockRestore()
  })

  it('编辑代码块时只重新高亮受影响的代码块', () => {
    const lowlight = createLowlight()
    const state = createState(lowlight)
    lowlight.highlight.mockClear()
    const firstCodeBlockPos = state.doc.child(0).nodeSize

    state.apply(state.tr.insertText('x', firstCodeBlockPos + 2))

    expect(lowlight.highlight).toHaveBeenCalledTimes(1)
    expect(lowlight.highlight.mock.calls[0]?.[1]).toContain('x')
  })
})
