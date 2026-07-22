import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { FootnoteMetadata } from '../src/components/extensions/FootnoteMetadata'
import { markdownToHtml, htmlToMarkdown } from '../src/utils/markdown.third'

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('编辑器脚注元数据', () => {
  it('经过 TipTap 解析与序列化后仍可还原脚注语法', () => {
    const markdown = '正文[^1]，再次引用[^1]。\n\n[^1]: 参考内容'
    editor = new Editor({
      extensions: [StarterKit, Link, FootnoteMetadata],
      content: markdownToHtml(markdown),
    })

    const html = editor.getHTML()
    const result = htmlToMarkdown(html)

    expect(html.match(/data-footnote-ref="1"/g)).toHaveLength(2)
    expect(html).toContain('data-footnotes="true"')
    expect(html).toContain('data-footnote-label="1"')
    expect(html).toContain('id="fnref-1-2"')
    expect(result).toContain('正文[^1]，再次引用[^1]。')
    expect(result).toContain('[^1]: 参考内容')
  })
})
