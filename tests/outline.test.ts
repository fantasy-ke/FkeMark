import { describe, expect, it, vi } from 'vitest'
import { extractTocItems, extractTocItemsFromBlocks, findTocHeadingElement } from '../src/utils/markdown/outline'

describe('文档大纲定位', () => {
  it('为重复标题保留同级标题出现位置', () => {
    const markdown = [
      '# 一、修复一个问题',
      '## 1.PushHotel缺少国家IS02校验',
      '### 旧逻辑',
      '### 新逻辑',
      '### 判断',
      '### 影响',
      '## 2. PushHotel / PushRoom缺少旧版错误返回行为',
      '### 旧逻辑',
      '### 判断',
      '## 3. DeleteRoom的房型名兜底丢失',
      '### 旧逻辑',
      '### 新逻辑',
      '### 判断',
      '### 影响',
      '### 建议修复',
    ].join('\n')

    const items = extractTocItems(markdown)

    expect(items.filter((item) => item.level === 3 && item.text === '旧逻辑').map((item) => item.index))
      .toEqual([0, 4, 6])
  })

  it('按出现位置定位重复标题，而不是回退到第一个同名标题', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<h3>旧逻辑</h3>',
      '<h3>新逻辑</h3>',
      '<h3>旧逻辑</h3>',
    ].join('')
    const headings = root.querySelectorAll<HTMLElement>('h3')
    headings.forEach((heading) => {
      heading.scrollIntoView = vi.fn()
    })

    const target = findTocHeadingElement(root, { level: 3, text: '旧逻辑', index: 2 })
    target?.scrollIntoView()

    expect(target).toBe(headings[2])
    expect(headings[0].scrollIntoView).not.toHaveBeenCalled()
    expect(headings[2].scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('剥离标题内联 Markdown 后再匹配渲染标题文本', () => {
    const markdown = [
      '# **Important** [Docs](https://example.com) `code` ~~old~~ ==mark==',
      '## ![Alt](demo.png) *Italic*',
    ].join('\n')

    const items = extractTocItems(markdown)
    const root = document.createElement('div')
    root.innerHTML = '<h1>Important Docs code old mark</h1><h2>Alt Italic</h2>'

    expect(items[0]).toMatchObject({ level: 1, text: 'Important Docs code old mark' })
    expect(items[1]).toMatchObject({ level: 2, text: 'Alt Italic' })
    expect(findTocHeadingElement(root, items[0])).toBe(root.querySelector('h1'))
    expect(findTocHeadingElement(root, items[1])).toBe(root.querySelector('h2'))
  })

  it('extracts the outline from the parsed editor document', () => {
    const blocks = [
      {
        type: 'heading',
        props: { level: 1 },
        content: [
          { type: 'text', text: 'First open ', styles: {} },
          { type: 'link', content: [{ type: 'text', text: 'document', styles: {} }] },
        ],
        children: [{
          type: 'heading',
          props: { level: 2 },
          content: [{ type: 'text', text: 'Child heading', styles: {} }],
          children: [],
        }],
      },
      {
        type: 'heading',
        props: { level: 4 },
        content: [{ type: 'text', text: 'Ignored heading', styles: {} }],
        children: [],
      },
      {
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Child heading', styles: {} }],
        children: [],
      },
      {
        type: 'heading',
        props: { level: 3 },
        content: [{ type: 'text', text: 'Escaped *literal* text', styles: {} }],
        children: [],
      },
    ]

    expect(extractTocItemsFromBlocks(blocks)).toEqual([
      { level: 1, text: 'First open document', index: 0 },
      { level: 2, text: 'Child heading', index: 0 },
      { level: 2, text: 'Child heading', index: 1 },
      { level: 3, text: 'Escaped *literal* text', index: 0 },
    ])
  })

  it('ignores Setext-like lines inside front matter', () => {
    const markdown = [
      '---',
      'title: Demo',
      '---',
      '',
      'Actual Title',
      '------------',
    ].join('\n')

    expect(extractTocItems(markdown)).toEqual([
      { level: 2, text: 'Actual Title', index: 0 },
    ])
  })

  it('extracts outline from indented and Setext headings on initial content', () => {
    const markdown = [
      'Document Title',
      '==============',
      '',
      '  ## Inline ATX Heading ##',
      '',
      'Section Title',
      '-------------',
      '',
      '```',
      '# Not Heading',
      '```',
    ].join('\n')

    expect(extractTocItems(markdown).map(({ level, text, index }) => ({ level, text, index }))).toEqual([
      { level: 1, text: 'Document Title', index: 0 },
      { level: 2, text: 'Inline ATX Heading', index: 0 },
      { level: 2, text: 'Section Title', index: 1 },
    ])
  })

  it('精确匹配失败时不使用子串标题兜底', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h2>Data A Analysis</h2>'

    expect(findTocHeadingElement(root, { level: 2, text: 'A' })).toBeNull()
  })
})
