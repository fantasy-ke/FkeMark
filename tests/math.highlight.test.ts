import { describe, expect, it } from 'vitest'
import { BlockNoteEditor } from '@blocknote/core'
import { fkeMarkBlockNoteSchema } from '../src/components/editor/blockNoteSchema'
import {
  installFkeMarkBlockNoteSerializer,
  parseBlockNoteDocument,
  serializeBlockNoteDocument,
} from '../src/components/editor/blockNoteMarkdown'
import {
  applyMathAndHighlight,
  protectInlineMathEscapes,
} from '../src/utils/markdown/mathHighlight'

function block(type: string, content: unknown[], extra: Record<string, unknown> = {}) {
  return { type, props: {}, content, children: [], ...extra }
}

function text(value: string, styles: Record<string, unknown> = {}) {
  return { type: 'text', text: value, styles }
}

describe('protectInlineMathEscapes', () => {
  it('把行内公式的反斜杠翻倍，避免被 Markdown 解析器当作转义吃掉', () => {
    expect(protectInlineMathEscapes('a \\(x^2\\) b')).toBe('a \\\\(x^2\\\\) b')
  })

  it('代码围栏内的反斜杠保持原样', () => {
    const source = '```\n\\(x^2\\)\n```'
    expect(protectInlineMathEscapes(source)).toBe(source)
  })

  it('行内代码内的反斜杠保持原样', () => {
    const source = '`\\(x^2\\)` 与 \\(y\\)'
    expect(protectInlineMathEscapes(source)).toBe('`\\(x^2\\)` 与 \\\\(y\\\\)')
  })

  it('Front Matter 内的反斜杠保持原样', () => {
    const source = '---\ntitle: \\(raw\\)\n---\n\n\\(x\\)'
    expect(protectInlineMathEscapes(source)).toBe('---\ntitle: \\(raw\\)\n---\n\n\\\\(x\\\\)')
  })
})

describe('applyMathAndHighlight', () => {
  it('把行内公式改写成 mathInline 节点', () => {
    const result = applyMathAndHighlight([block('paragraph', [text('a \\(x^2\\) b')])])

    expect(result.transformed).toBe(true)
    expect(result.blocks).toEqual([
      block('paragraph', [
        text('a '),
        { type: 'mathInline', props: { tex: 'x^2' } },
        text(' b'),
      ]),
    ])
  })

  it('把 ==高亮== 改写成 highlight 样式并保留其它样式', () => {
    const result = applyMathAndHighlight([block('paragraph', [text('==重点==', { bold: true })])])

    expect(result.transformed).toBe(true)
    expect(result.blocks).toEqual([
      block('paragraph', [text('重点', { bold: true, highlight: true })]),
    ])
  })

  it('把单行块级公式改写成 mathBlock', () => {
    const result = applyMathAndHighlight([block('paragraph', [text('$$x^2$$')], { id: 'b1' })])

    expect(result.transformed).toBe(true)
    expect(result.blocks).toEqual([
      { id: 'b1', type: 'mathBlock', props: { tex: 'x^2' }, children: [] },
    ])
  })

  it('把多行 $$ 包裹的内容合并成 mathBlock', () => {
    const result = applyMathAndHighlight([
      block('paragraph', [text('$$')]),
      block('paragraph', [text('E = mc^2')]),
      block('paragraph', [text('$$')]),
    ])

    expect(result.transformed).toBe(true)
    expect(result.blocks).toEqual([
      { id: undefined, type: 'mathBlock', props: { tex: 'E = mc^2' }, children: [] },
    ])
  })

  it('代码块内的字面语法保持原样', () => {
    const source = [block('codeBlock', [text('==not== \\(math\\) $$x$$')], { props: { language: 'text' } })]
    const result = applyMathAndHighlight(source)

    expect(result.transformed).toBe(false)
    expect(result.blocks).toEqual(source)
  })

  it('行内代码内的字面语法保持原样', () => {
    const source = [block('paragraph', [text('==code==', { code: true }), text(' and ==real==')])]
    const result = applyMathAndHighlight(source)

    expect(result.transformed).toBe(true)
    expect(result.blocks).toEqual([
      block('paragraph', [
        text('==code==', { code: true }),
        text(' and '),
        text('real', { highlight: true }),
      ]),
    ])
  })

  it('不把 $...$ 当作行内公式，避免误伤普通文本', () => {
    const source = [block('paragraph', [text('a $x^2$ b')])]
    const result = applyMathAndHighlight(source)

    expect(result.transformed).toBe(false)
    expect(result.blocks).toEqual(source)
  })

  it('没有公式或高亮时原样返回', () => {
    const source = [block('paragraph', [text('plain text')])]
    expect(applyMathAndHighlight(source)).toEqual({ blocks: source, transformed: false })
  })
})

describe('公式与高亮的 Markdown 往返', () => {
  const editor = BlockNoteEditor.create({ schema: fkeMarkBlockNoteSchema })
  installFkeMarkBlockNoteSerializer(editor)

  async function roundTrip(markdown: string) {
    const parsed = await parseBlockNoteDocument(editor, markdown)
    return serializeBlockNoteDocument({ blocks: parsed.blocks, editor, sourceContent: markdown })
  }

  it.each([
    ['行内公式', 'a \\(x^2\\) b'],
    ['高亮', 'a ==hi== b'],
    ['块级公式', '$$\nE = mc^2\n$$'],
    ['行内公式与高亮混排', '==重点== 与 \\(a+b\\)'],
  ])('%s 往返保持稳定', async (_label, markdown) => {
    expect(await roundTrip(markdown)).toBe(markdown)
  })

  it('代码围栏内的字面语法不被改写', async () => {
    const markdown = '```\n==not== \\(math\\)\n```'
    expect(await roundTrip(markdown)).toBe(markdown)
  })

  it('解析结果里包含真实的公式节点', async () => {
    const parsed = await parseBlockNoteDocument(editor, '前 \\(x^2\\) 后\n\n$$a+b$$')
    const blocks = parsed.blocks as Array<{ type: string; content?: unknown[]; props?: Record<string, unknown> }>

    expect(blocks[0].content).toContainEqual({ type: 'mathInline', props: { tex: 'x^2' } })
    expect(blocks[1].type).toBe('mathBlock')
    expect(blocks[1].props?.tex).toBe('a+b')
  })

  // 回归保护：显式传入 styleSpecs / inlineContentSpecs 会整体替换默认值，
  // 必须确认内置样式与链接内联内容没有被自定义 spec 挤掉。
  it('保留 BlockNote 内置样式与链接内联内容', async () => {
    expect(await roundTrip('a **bold** b')).toBe('a **bold** b')
    expect(await roundTrip('a `code` b')).toBe('a `code` b')
    expect(await roundTrip('a ~~strike~~ b')).toBe('a ~~strike~~ b')
    expect(await roundTrip('[label](https://example.com)')).toBe('[label](https://example.com)')
  })
})
