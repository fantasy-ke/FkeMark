/**
 * FkeMark Markdown 往返保真测试（黄金基线）
 *
 * 目的：用现有手写 markdown.ts 建立"黄金"往返输出，作为后续
 * 迁移到 markdown-it + turndown 时的对比基准。
 *
 * 覆盖的无损往返关键特性（这些属性 TipTap 解析依赖，丢失即渲染错乱）：
 *  - 任务列表：<ul data-type="taskList"> / <li data-type="taskItem" data-checked>
 *  - 数学公式：data-tex（块级 $$...$$ / 行内 \(...\)）
 *  - 表格：data-separators（保留对齐冒号与原分隔行）
 *  - 列表符号：data-marker（保留 * / - / +）
 *  - 图片尺寸：<!-- size:WxH -->
 *
 * 断言策略：
 *  1) markdownToHtml(md) 产出含关键 TipTap 兼容标记的 HTML
 *  2) 完整循环 markdownToHtml(md) → htmlToMarkdown → markdownToHtml 后，
 *     关键标记仍保留（证明 MD→HTML→MD→HTML 无损）
 */
import { describe, it, expect } from 'vitest'
import { markdownToHtml, htmlToMarkdown } from '../src/utils/markdown'

// 完整循环：MD → HTML → MD → HTML，返回第二轮 HTML
const roundTripHtml = (md: string): string => {
  const html1 = markdownToHtml(md)
  const md2 = htmlToMarkdown(html1)
  return markdownToHtml(md2)
}

describe('Markdown 往返保真基线（现有手写实现）', () => {
  describe('标题与行内格式', () => {
    it('h1-h6 与粗体/斜体/删除线/下划线/高亮', () => {
      const md = '# 标题\n\n**粗** *斜* ~~删~~ <u>下</u> ==高亮== `码`'
      const html = markdownToHtml(md)
      expect(html).toContain('<h1>')
      expect(html).toContain('<strong>')
      expect(html).toContain('<em>')
      expect(html).toContain('<s>')
      expect(html).toContain('<u>')
      expect(html).toContain('<mark>')
      expect(html).toContain('<code>')
    })
  })

  describe('任务列表（data-type / data-checked 无损）', () => {
    it('未选与已选任务项两轮后仍保留', () => {
      const md = '- [ ] 待办\n- [x] 已完成'
      const html = markdownToHtml(md)
      expect(html).toContain('data-type="taskList"')
      expect(html).toContain('data-type="taskItem"')
      expect(html).toContain('data-checked="false"')
      expect(html).toContain('data-checked="true"')
      // 完整循环后关键标记仍在
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-type="taskList"')
      expect(rt).toContain('data-checked="true"')
      expect(rt).toContain('data-checked="false"')
    })
  })

  describe('数学公式（data-tex 无损）', () => {
    it('块级 $$...$$ 两轮后仍保留 data-tex', () => {
      const md = '$$\\int_0^1 x^2\\,dx$$'
      const html = markdownToHtml(md)
      expect(html).toContain('data-tex="\\int_0^1 x^2\\,dx"')
      expect(html).toContain('data-display="true"')
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-tex="\\int_0^1 x^2\\,dx"')
    })
    it('行内 \\(...\\) 两轮后仍保留 data-tex 且 display=false', () => {
      const md = '质能方程 \\(E=mc^2\\) 很重要'
      const html = markdownToHtml(md)
      expect(html).toContain('data-tex="E=mc^2"')
      expect(html).toContain('data-display="false"')
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-tex="E=mc^2"')
    })
  })

  describe('表格（data-separators 对齐无损）', () => {
    it('含右对齐列的表格两轮后保留 data-separators', () => {
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
      expect(rt).toMatch(/data-separators="[^"]*---:/)
    })
  })

  describe('列表符号（data-marker 无损）', () => {
    it('使用 * 作为无序列表符号两轮后保留', () => {
      const md = '* 星号项\n* 第二项'
      const html = markdownToHtml(md)
      expect(html).toContain('data-marker="*"')
      const rt = roundTripHtml(md)
      expect(rt).toContain('data-marker="*"')
    })
  })

  describe('图片尺寸（<!-- size:WxH --> 无损）', () => {
    it('MD→HTML 首轮保留 size 注释（已知限制：完整往返会丢）', () => {
      // 已知限制（待 Phase 1 修复）：当前手写实现
      //  1) markdownToHtml 不把 <!-- size --> 转成 img 的 width 样式，仅字面透传
      //  2) htmlToMarkdown 把 <!-- --> 当 COMMENT_NODE 忽略（inlineToMd 只处理 TEXT/ELEMENT）
      // 因此 size 在 MD→HTML→MD 方向丢失；只在 HTML→MD（读 img style）方向可保留。
      // 基线仅断言 MD→HTML 首轮透传该注释，并记录此为迁移需修复项。
      const md = '![封面](cover.png) <!-- size:200px x -->'
      const html = markdownToHtml(md)
      expect(html).toContain('<!-- size:200px x -->')
    })
  })

  describe('代码块（语言标识）', () => {
    it('带语言标识的代码块两轮后保留 language-xxx', () => {
      const md = '```ts\nconst a = 1\n```'
      const html = markdownToHtml(md)
      expect(html).toContain('language-ts')
      const rt = roundTripHtml(md)
      expect(rt).toContain('language-ts')
    })
  })

  describe('嵌套引用', () => {
    it('多层引用两轮后仍可解析', () => {
      const md = '> 外层\n>\n> > 内层'
      const html = markdownToHtml(md)
      expect(html).toContain('<blockquote>')
      const rt = roundTripHtml(md)
      expect(rt).toContain('<blockquote>')
    })
  })
})
