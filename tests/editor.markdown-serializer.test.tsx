import { describe, expect, it, vi } from 'vitest'
import {
  blocksToMarkdownDirect,
  installBlockNoteDirectMarkdown,
  serializeBlockNoteMarkdown,
  type DirectMarkdownCapableSerializer,
} from '../src/utils/markdown/blockNoteSerializer'
import {
  parseBlockNoteDocument,
  serializeBlockNoteDocument,
  type AnyBlockNoteEditor,
} from '../src/components/editor/blockNoteMarkdown'

function makeEditor(document: unknown[]): DirectMarkdownCapableSerializer & { document: unknown[] } {
  return {
    document,
    blocksToMarkdownLossy: vi.fn(() => 'legacy markdown'),
  }
}

describe('BlockNote direct Markdown serialization', () => {
  it('serializes standard blocks, links, wiki links, lists, code, tables, and images without HTML', () => {
    const blocks = [
      {
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: 'Title', styles: {} }],
        children: [],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Bold', styles: { bold: true } },
          { type: 'text', text: ' and ', styles: {} },
          {
            type: 'link',
            props: { href: '#fkemark-wiki:%E9%A1%B9%E7%9B%AE%20A' },
            content: [{ type: 'text', text: 'Project A', styles: {} }],
          },
          { type: 'text', text: ' plus ', styles: {} },
          {
            type: 'link',
            props: { href: 'https://example.com' },
            content: [{ type: 'text', text: 'docs', styles: {} }],
          },
        ],
        children: [],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Item', styles: {} }],
        children: [{
          type: 'checkListItem',
          props: { checked: true },
          content: [{ type: 'text', text: 'Done', styles: {} }],
          children: [],
        }],
      },
      {
        type: 'codeBlock',
        props: { language: 'ts' },
        content: [{ type: 'text', text: 'const answer = 42', styles: {} }],
        children: [],
      },
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [
            { cells: ['Name', 'Value'] },
            { cells: ['A', '1'] },
          ],
        },
        children: [],
      },
      {
        type: 'image',
        props: { name: 'Cover', url: 'cover image.png' },
        children: [],
      },
    ]

    expect(blocksToMarkdownDirect(blocks).markdown).toBe([
      '# Title',
      '',
      '**Bold** and [[\u9879\u76ee A]] plus [docs](https://example.com)',
      '',
      '- Item',
      '  - [x] Done',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| A | 1 |',
      '',
      '![Cover](<cover image.png>)',
    ].join('\n'))
  })

  it('omits plain text language markers for code blocks', () => {
    expect(blocksToMarkdownDirect([{
      type: 'codeBlock',
      props: { language: 'plaintext' },
      content: [{ type: 'text', text: 'plain', styles: {} }],
      children: [],
    }]).markdown).toBe('```\nplain\n```')

    expect(blocksToMarkdownDirect([{
      type: 'codeBlock',
      props: { language: 'text' },
      content: [{ type: 'text', text: 'plain', styles: {} }],
      children: [],
    }]).markdown).toBe('```\nplain\n```')
  })

  it('normalizes C# code fences to csharp', async () => {
    expect(blocksToMarkdownDirect([{
      type: 'codeBlock',
      props: { language: 'C#' },
      content: [{ type: 'text', text: 'var answer = 42;', styles: {} }],
      children: [],
    }]).markdown).toBe('```csharp\nvar answer = 42;\n```')

    const editor = makeEditor([]) as DirectMarkdownCapableSerializer & {
      document: unknown[]
      tryParseMarkdownToBlocks: ReturnType<typeof vi.fn>
    }
    editor.tryParseMarkdownToBlocks = vi.fn(() => [{
      type: 'codeBlock',
      props: { language: 'C#' },
      content: [{ type: 'text', text: 'var answer = 42;', styles: {} }],
      children: [],
    }])

    const parsed = await parseBlockNoteDocument(editor as AnyBlockNoteEditor, '```C#\nvar answer = 42;\n```')
    expect((parsed.blocks[0] as { props?: { language?: string } }).props?.language).toBe('csharp')
  })

  it('keeps consecutive list items compact after opening Markdown', () => {
    expect(blocksToMarkdownDirect([
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Alpha', styles: {} }],
        children: [],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Beta', styles: {} }],
        children: [],
      },
      {
        type: 'checkListItem',
        props: { checked: true },
        content: [{ type: 'text', text: 'Done', styles: {} }],
        children: [],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'After list', styles: {} }],
        children: [],
      },
    ]).markdown).toBe('- Alpha\n- Beta\n- [x] Done\n\nAfter list')
  })

  it('keeps front matter and falls back for custom blocks unsupported by the default schema', () => {
    const supportedBlocks = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Body', styles: {} }],
      children: [],
    }]
    const supportedEditor = makeEditor(supportedBlocks)
    installBlockNoteDirectMarkdown(supportedEditor)

    expect(serializeBlockNoteDocument({
      blocks: supportedBlocks,
      editor: supportedEditor as AnyBlockNoteEditor,
      sourceContent: '---\ntitle: Test\n---\n\nOld body',
    })).toBe('---\ntitle: Test\n---\nBody')

    const unsupportedBlocks = [{ type: 'mathBlock', children: [] }]
    const fallbackEditor = makeEditor(unsupportedBlocks)
    installBlockNoteDirectMarkdown(fallbackEditor)

    expect(serializeBlockNoteMarkdown(fallbackEditor, unsupportedBlocks)).toBe('legacy markdown')
    expect(fallbackEditor.blocksToMarkdownLossy).toHaveBeenCalledWith(unsupportedBlocks)
    expect(fallbackEditor.__fkeMarkLastDirectMarkdownMetrics?.fallbackReason).toBe('unsupported:mathBlock')
  })

  it('caches unchanged block identities and serializes only a replaced block again', () => {
    const firstBlock = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'First', styles: {} }],
      children: [],
    }
    const secondBlock = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Second', styles: {} }],
      children: [],
    }
    const cache = new WeakMap<object, Map<string, string>>()

    const first = blocksToMarkdownDirect([firstBlock, secondBlock], cache)
    const second = blocksToMarkdownDirect([firstBlock, secondBlock], cache)
    const changed = blocksToMarkdownDirect([
      firstBlock,
      { ...secondBlock, content: [{ type: 'text', text: 'Changed', styles: {} }] },
    ], cache)

    expect(first.metrics.cacheMisses).toBe(2)
    expect(second.metrics.cacheHits).toBe(2)
    expect(second.metrics.cacheMisses).toBe(0)
    expect(changed.metrics.cacheHits).toBe(1)
    expect(changed.metrics.cacheMisses).toBe(1)
    expect(changed.markdown).toContain('Changed')
  })

  it('uses the fast parser for 800-line Markdown and reuses every block on the next save', async () => {
    const content = Array.from(
      { length: 800 },
      (_, index) => `## Line ${index + 1}\n\nBody ${index + 1}`,
    ).join('\n\n')
    const editor = makeEditor([]) as DirectMarkdownCapableSerializer & {
      document: unknown[]
      tryParseMarkdownToBlocks: ReturnType<typeof vi.fn>
    }
    editor.tryParseMarkdownToBlocks = vi.fn(() => [])

    const parsed = await parseBlockNoteDocument(editor as AnyBlockNoteEditor, content)
    expect(parsed.parseMetrics.parser).toBe('fast')
    expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()
    expect(parsed.blocks.length).toBe(1_600)

    installBlockNoteDirectMarkdown(editor)
    const first = blocksToMarkdownDirect(parsed.blocks, editor.__fkeMarkDirectMarkdownCache)
    const second = blocksToMarkdownDirect(parsed.blocks, editor.__fkeMarkDirectMarkdownCache)
    expect(first.supported).toBe(true)
    expect(first.metrics.blockCount).toBe(1_600)
    expect(second.metrics.cacheHits).toBe(1_600)
    expect(second.metrics.cacheMisses).toBe(0)
    expect(second.markdown).toContain('## Line 800')
  })
})
