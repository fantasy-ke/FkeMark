import { describe, expect, it, vi } from 'vitest'
import { extractTocItems, findTocHeadingElement } from '../src/utils/markdown/outline'

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
})
