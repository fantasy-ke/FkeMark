/**
 * FkeMark 第三方 Markdown 引擎往返保真测试（markdown-it + turndown）
 *
 * 直接测试 markdown.third.ts（不经路由层），验证：
 *   1. MD→HTML 产出含 TipTap 兼容关键属性
 *   2. MD→HTML→MD 往返后语义等价（列表符号/表格分隔/代码块语言等保持）
 *   3. 与手写引擎基线测试对标的全部场景
 *
 * 覆盖特性：
 * - 标题/行内格式/高亮
 * - 任务列表（data-type="taskList" / data-checked）
 * - 数学公式（data-tex 块级 + 行内）
 * - 表格（data-separators 对齐 + dash 长度保留）
 * - 列表符号（data-marker 星号/减号/加号 保留）
 * - 图片尺寸（<!-- size:WxH -->）
 * - 代码块（语言标识 + 无语言时不加 plaintext）
 * - 嵌套引用
 * - 综合文档往返
 */
import { describe, it, expect } from 'vitest'
import { markdownToHtml, htmlToMarkdown } from '../src/utils/markdown.third'

// 往返：MD → HTML → MD
const roundTripMd = (md: string, docDir?: string | null): string => {
  const html = markdownToHtml(md, docDir)
  return htmlToMarkdown(html, docDir)
}

// 完整循环：MD → HTML → MD → HTML（第二轮 HTML 也应含关键属性）
const roundTripHtml = (md: string): string => {
  const html1 = markdownToHtml(md)
  const md2 = htmlToMarkdown(html1)
  return markdownToHtml(md2)
}

describe('第三方引擎往返保真（markdown-it + turndown）', () => {
  describe('标题与行内格式', () => {
    it('h1-h6 与粗体/斜体/删除线/高亮/行内代码', () => {
      const md = '# 标题一\n\n## 标题二\n\n**粗体** *斜体* ~~删除~~ ==高亮== `代码`'
      const html = markdownToHtml(md)
      expect(html).toContain('<h1>')
      expect(html).toContain('<h2>')
      expect(html).toContain('<strong>')
      expect(html).toContain('<em>')
      expect(html).toContain('<s>')
      expect(html).toContain('<mark>')
      expect(html).toContain('<code>')
    })

    it('标题往返后保留原格式', () => {
      const md = '# 1. 概述\n\n## 2. 背景\n\n### 3. 方案'
      const result = roundTripMd(md)
      expect(result).toContain('# 1. 概述')
      expect(result).toContain('## 2. 背景')
      expect(result).toContain('### 3. 方案')
      // 点号不应被转义
      expect(result).not.toContain('1\\.')
    })
  })

  describe('任务列表（data-type / data-checked 无损）', () => {
    it('未选与已选任务项两轮后仍保留', () => {
      const md = '- [ ] 待办事项\n- [x] 已完成'
      const html = markdownToHtml(md)
      expect(html).toContain('data-type="taskList"')
      expect(html).toContain('data-type="taskItem"')
      expect(html).toContain('data-checked="false"')
      expect(html).toContain('data-checked="true"')
      // 完整循环
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-type="taskList"')
      expect(rt).toContain('data-checked="true"')
      expect(rt).toContain('data-checked="false"')
    })

    it('任务列表往返后语义不变', () => {
      const md = '- [ ] 买牛奶\n- [x] 写代码\n- [ ] 运动'
      const result = roundTripMd(md)
      expect(result).toContain('- [ ] 买牛奶')
      expect(result).toContain('- [x] 写代码')
      expect(result).toContain('- [ ] 运动')
    })
  })

  describe('数学公式（data-tex 无损）', () => {
    it('块级 $$...$$ 两轮后仍保留 data-tex', () => {
      const md = '$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$'
      const html = markdownToHtml(md)
      expect(html).toContain('data-tex=')
      expect(html).toContain('data-display="true"')
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-tex=')
    })

    it('行内 \\(...\\) 两轮后仍保留 data-tex', () => {
      const md = '质能方程 \\(E=mc^2\\) 很著名'
      const html = markdownToHtml(md)
      expect(html).toContain('data-tex=')
      expect(html).toContain('data-display="false"')
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-tex=')
    })

    it('块级数学公式往返保留内容', () => {
      const md = '$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$'
      const result = roundTripMd(md)
      expect(result).toContain('\\sum_{i=1}^{n}')
      expect(result).toContain('$$')
    })

    it('行内数学公式往返保留内容', () => {
      const md = '圆的面积 \\(A = \\pi r^2\\) 公式'
      const result = roundTripMd(md)
      expect(result).toContain('\\(A')
      expect(result).toContain('r^2\\)')
    })
  })

  describe('表格（data-separators 对齐 + dash 长度保留）', () => {
    it('含右对齐列的表格往返保留分隔行格式', () => {
      const md = [
        '| 名称 | 数值 |',
        '|------|----:|',
        '| A | 1 |',
        '| B | 2 |',
      ].join('\n')
      const html = markdownToHtml(md)
      expect(html).toContain('data-separators=')
      expect(html).toContain('<table')
      // 右对齐冒号应出现在 data-separators 中
      expect(html).toMatch(/data-separators="[^"]*---:/)
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-separators=')
    })

    it('表格往返保留 dash 长度', () => {
      const md = [
        '| 列 A | 列 B | 列 C |',
        '|------|------|------|',
        '| 1 | 2 | 3 |',
      ].join('\n')
      const result = roundTripMd(md)
      // 分隔行应保留原始 dash 数量
      expect(result).toMatch(/\|------\|------\|------\|/)
    })

    it('居中对齐往返保留', () => {
      const md = [
        '| 左 | 中 | 右 |',
        '|:---|:---:|---:|',
        '| a | b | c |',
      ].join('\n')
      const result = roundTripMd(md)
      expect(result).toContain(':---')
      expect(result).toContain(':---:')
      expect(result).toContain('---:')
    })

    it('表格单元格行内格式往返保留', () => {
      const md = [
        '| 名称 | 描述 |',
        '|------|------|',
        '| **粗体** | `代码` |',
      ].join('\n')
      const result = roundTripMd(md)
      expect(result).toContain('**粗体**')
      expect(result).toContain('`代码`')
    })
  })

  describe('列表符号（data-marker 保留）', () => {
    it('* 列表往返保留星号', () => {
      const md = '* 星号项\n* 第二项\n* 第三项'
      const html = markdownToHtml(md)
      expect(html).toContain('data-marker="*"')
      const result = roundTripMd(md)
      expect(result).toContain('* 星号项')
      expect(result).toContain('* 第二项')
      // 不应变成 -
      expect(result).not.toMatch(/^- 星号项/m)
    })

    it('+ 列表往返保留加号', () => {
      const md = '+ 加号项\n+ 另一项'
      const result = roundTripMd(md)
      expect(result).toContain('+ 加号项')
    })

    it('- 列表往返保留减号', () => {
      const md = '- 减号项\n- 另一项'
      const result = roundTripMd(md)
      expect(result).toContain('- 减号项')
    })

    it('有序列表往返保留序号', () => {
      const md = '1. 第一\n2. 第二\n3. 第三'
      const result = roundTripMd(md)
      expect(result).toContain('1. 第一')
      expect(result).toContain('2. 第二')
      expect(result).toContain('3. 第三')
    })
  })

  describe('图片尺寸', () => {
    it('带尺寸的图片往返保留 size 注释', () => {
      const md = '![封面](cover.png) <!-- size:200pxx300px -->'
      const result = roundTripMd(md)
      expect(result).toContain('size:200')
      expect(result).toContain('200px')
    })

    it('无尺寸的图片往返不受影响', () => {
      const md = '![普通图片](normal.png)'
      const result = roundTripMd(md)
      expect(result).toContain('![普通图片](normal.png)')
    })
  })

  describe('代码块', () => {
    it('带语言标识的代码块往返保留 language-xxx', () => {
      const md = '```ts\nconst a = 1\n```'
      const html = markdownToHtml(md)
      expect(html).toContain('language-ts')
      const rt = roundTripHtml(md)
      expect(rt).toContain('language-ts')
    })

    it('代码块往返保留语言标识', () => {
      const md = '```python\nprint("hello")\n```'
      const result = roundTripMd(md)
      expect(result).toContain('```python')
      expect(result).toContain('print("hello")')
    })

    it('无语言代码块不添加 plaintext 标记', () => {
      const md = '```\nplain code\n```'
      const result = roundTripMd(md)
      // 不应出现 plaintext 语言标记
      expect(result).not.toMatch(/```plaintext/)
      expect(result).not.toMatch(/```text/)
      // 应该保持无语言或仅 ```
      expect(result).toMatch(/```\nplain code/)
    })

    it('多种语言代码块往返均保留', () => {
      const md = [
        '```js',
        'const x = 1',
        '```',
        '',
        '```rust',
        'let y = 2;',
        '```',
      ].join('\n')
      const result = roundTripMd(md)
      expect(result).toContain('```js')
      expect(result).toContain('```rust')
      expect(result).toContain('const x = 1')
      expect(result).toContain('let y = 2;')
    })
  })

  describe('嵌套引用', () => {
    it('多层引用往返保留结构', () => {
      const md = '> 外层引用\n>\n> > 嵌套内层'
      const html = markdownToHtml(md)
      expect(html).toContain('<blockquote>')
      const rt = roundTripHtml(md)
      expect(rt).toContain('<blockquote>')
    })

    it('引用块往返语义不变', () => {
      const md = '> 这是一段引用文字'
      const result = roundTripMd(md)
      expect(result).toContain('这是一段引用文字')
    })
  })

  describe('综合文档往返', () => {
    it('混合多种元素的完整文档往返保持结构', () => {
      const md = [
        '# FkeMark 测试文档',
        '',
        '这是一个包含**多种元素**的综合文档。',
        '',
        '## 任务列表',
        '',
        '- [ ] 完成测试',
        '- [x] 修复 bug',
        '',
        '## 代码示例',
        '',
        '```ts',
        'function hello(): string {',
        '  return "Hello, World!"',
        '}',
        '```',
        '',
        '## 数据表格',
        '',
        '| 项目 | 状态 | 优先级 |',
        '|------|------|-------:|',
        '| 引擎测试 | 进行中 | 1 |',
        '| 样式优化 | **完成** | 2 |',
        '',
        '## 列表',
        '',
        '* 无序项 A',
        '* 无序项 B',
        '',
        '1. 有序项 1',
        '2. 有序项 2',
        '',
        '## 数学公式',
        '',
        '行内公式 \\(x^2 + y^2 = z^2\\) 和块级公式：',
        '',
        '$$',
        '\\frac{d}{dx}f(x) = \\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}',
        '$$',
      ].join('\n')

      const html = markdownToHtml(md)
      // 关键 TipTap 属性存在
      expect(html).toContain('data-type="taskList"')
      expect(html).toContain('data-checked')
      expect(html).toContain('data-separators')
      expect(html).toContain('data-marker')
      expect(html).toContain('data-tex')

      // 往返后关键元素保持
      const result = roundTripMd(md)
      expect(result).toContain('# FkeMark 测试文档')
      expect(result).toContain('- [ ] 完成测试')
      expect(result).toContain('- [x] 修复 bug')
      expect(result).toContain('```ts')
      expect(result).toContain('* 无序项 A')
      expect(result).toContain('1. 有序项 1')
      expect(result).toContain('\\(x^2')
      expect(result).toContain('$$')
      expect(result).toContain('**完成**')
    })

    it('往返不产生多余空行（连续空行不超过 1 个）', () => {
      const md = '# 标题\n\n段落一\n\n段落二\n\n```js\ncode\n```\n\n* 列表'
      const result = roundTripMd(md)
      // 不应有 3 个以上连续换行
      expect(result).not.toMatch(/\n{4,}/)
      // 不应有 3 个连续换行（即 2 个空行）
      expect(result).not.toMatch(/\n{3}/)
    })

    it('往返不破坏链接', () => {
      const md = '查看 [GitHub](https://github.com) 了解更多'
      const result = roundTripMd(md)
      expect(result).toContain('[GitHub](https://github.com)')
    })
  })
})

describe('网络图片地址', () => {
  it('保留 HTTP 和 HTTPS 图片地址，不改写为本地资源协议', () => {
    const html = markdownToHtml(
      '![secure](https://example.com/a.png)\n\n![plain](http://example.com/b.jpg)\n\n![caps](HTTPS://example.com/c.webp)',
      'C:\\docs',
    )
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('src="http://example.com/b.jpg"')
    expect(html).toContain('src="HTTPS://example.com/c.webp"')
    expect(html).not.toContain('asset.localhost')
  })
})
