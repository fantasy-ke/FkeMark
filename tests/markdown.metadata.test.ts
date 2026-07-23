import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DocumentTag } from '../src/components/extensions/DocumentTag'
import { extractDocumentMetadata } from '../src/utils/markdown/metadata'
import { markdownToHtml as builtinToHtml, htmlToMarkdown as builtinToMarkdown } from '../src/utils/markdown/builtin'
import { markdownToHtml as thirdToHtml, htmlToMarkdown as thirdToMarkdown } from '../src/utils/markdown/third'

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('YAML Front Matter 文档元数据', () => {
  it('解析 YAML 字段并合并 Front Matter 与正文标签', () => {
    const markdown = [
      '---',
      'title: Docker 基础',
      'tags:',
      '  - Docker',
      '  - DevOps',
      'published: true',
      'weight: 2',
      'aliases: [容器, runtime]',
      '---',
      '',
      '正文 #Docker #容器',
    ].join('\n')

    const metadata = extractDocumentMetadata(markdown)

    expect(metadata.frontMatter).toMatchObject({
      title: 'Docker 基础',
      tags: ['Docker', 'DevOps'],
      published: true,
      weight: 2,
      aliases: ['容器', 'runtime'],
    })
    expect(metadata.frontMatterTags).toEqual(['Docker', 'DevOps'])
    expect(metadata.inlineTags).toEqual(['Docker', '容器'])
    expect(metadata.tags).toEqual(['Docker', 'DevOps', '容器'])
    expect(metadata.parseError).toBeNull()
  })

  it('YAML 无效时返回错误但保留原始文档头', () => {
    const metadata = extractDocumentMetadata('---\ntags: [Docker\n---\n\n正文 #tag')

    expect(metadata.frontMatter).toEqual({})
    expect(metadata.rawFrontMatter).toBe('tags: [Docker')
    expect(metadata.inlineTags).toEqual(['tag'])
    expect(metadata.parseError).toEqual(expect.any(String))
  })
})

describe.each([
  ['内置引擎', builtinToHtml, builtinToMarkdown],
  ['第三方引擎', thirdToHtml, thirdToMarkdown],
] as const)('%s 正文标签', (_name, toHtml, toMarkdown) => {
  it('渲染中英文标签并在保存时保留原始语法', () => {
    const markdown = '正文 #Docker 与 #容器-runtime。'
    const html = toHtml(markdown)

    expect(html).toContain('data-doc-tag="Docker"')
    expect(html).toContain('data-doc-tag="容器-runtime"')
    expect(toMarkdown(html)).toBe(markdown)
  })

  it('不把标题、代码、链接锚点和转义内容识别为标签', () => {
    const markdown = [
      '# 标题 #heading',
      '',
      '有效 #tag，行内代码 `#code`，链接 [章节](#anchor)，转义 \\#escaped。',
      '',
      '```md',
      '#fenced',
      '```',
      '',
      '    #indented',
    ].join('\n')
    const html = toHtml(markdown)

    expect(html.match(/data-doc-tag=/g)).toHaveLength(1)
    expect(html).toContain('data-doc-tag="tag"')
    expect(html).not.toContain('data-doc-tag="heading"')
    expect(html).not.toContain('data-doc-tag="code"')
    expect(html).not.toContain('data-doc-tag="anchor"')
    expect(html).not.toContain('data-doc-tag="escaped"')
    expect(html).not.toContain('data-doc-tag="fenced"')
    expect(html).not.toContain('data-doc-tag="indented"')
  })
})

describe('编辑器标签元数据', () => {
  it('经过 TipTap 解析与序列化后仍保留标签语义', () => {
    const markdown = '正文 #Docker 与 #容器。'
    editor = new Editor({
      extensions: [StarterKit, DocumentTag],
      content: thirdToHtml(markdown),
    })

    const html = editor.getHTML()

    expect(html).toContain('data-doc-tag="Docker"')
    expect(html).toContain('data-doc-tag="容器"')
    expect(thirdToMarkdown(html)).toBe(markdown)
  })
})
