import { afterEach, describe, expect, it } from 'vitest'
import {
  htmlToMarkdown,
  htmlToMarkdownDeferred,
  setMarkdownEngine,
  type MarkdownEngine,
} from '../src/utils/markdown/engine'

const html = [
  ...Array.from({ length: 85 }, (_, index) => `<p>第 ${index + 1} 段 <strong>正文</strong></p>`),
  `<p>${Array.from({ length: 170 }, (_, index) => index === 90 ? 'soft &lt;tag&gt; &amp; value' : `soft line ${index + 1}`).join('<br>')}</p>`,
  '<blockquote><p>引用内容</p></blockquote>',
  '<ul data-marker="*"><li><p>列表项</p></li></ul>',
  '<p>脚注引用<a data-footnote-ref="note">1</a></p>',
  '<ol data-footnotes><li data-footnote-label="note"><p>脚注定义</p><a data-footnote-backref="note">↩</a></li></ol>',
].join('')

describe('分片 HTML 转 Markdown', () => {
  afterEach(() => localStorage.removeItem('markdown-engine'))

  for (const engine of ['third', 'builtin'] satisfies MarkdownEngine[]) {
    it(`${engine} 引擎的分片结果与同步转换一致`, async () => {
      setMarkdownEngine(engine)

      await expect(htmlToMarkdownDeferred(html)).resolves.toBe(htmlToMarkdown(html))
    })
  }

  it('切回实时视图时可以取消尚未完成的分片转换', async () => {
    setMarkdownEngine('third')
    const controller = new AbortController()
    const conversion = htmlToMarkdownDeferred(html, null, controller.signal)

    controller.abort()

    await expect(conversion).rejects.toMatchObject({ name: 'AbortError' })
  })
})
