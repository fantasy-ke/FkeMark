import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LineNumbers } from '../src/components/editor/LineNumbers'
import {
  getVisibleSourceLineNumberMarkers,
  SOURCE_LINE_HEIGHT,
} from '../src/components/editor/sourceLineNumbers'

describe('源码视图行号', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root.unmount())
    container.remove()
  })

  it('长文档只生成视口附近的行号并能覆盖文档末行', () => {
    const lineCount = 100_000
    const scrollTop = (lineCount - 1) * SOURCE_LINE_HEIGHT
    const markers = getVisibleSourceLineNumberMarkers(lineCount, scrollTop, 600)

    expect(markers.length).toBeLessThan(100)
    expect(markers.at(-1)?.lineNumber).toBe(lineCount)
    expect(markers.at(-1)?.top).toBe((lineCount - 1) * SOURCE_LINE_HEIGHT)
  })

  it('源码空行仍然拥有独立行号', async () => {
    await act(async () => {
      root.render(<LineNumbers content={'first\n\nthird\n'} />)
    })

    const gutter = container.querySelector('.editor-line-numbers')
    expect(gutter?.getAttribute('data-line-count')).toBe('4')
    expect(gutter?.querySelector('[data-line-number="2"]')).not.toBeNull()
    expect(gutter?.querySelector('[data-line-number="4"]')).not.toBeNull()
  })

  it('长文档内容变化时合并延迟更新行号总数', async () => {
    vi.useFakeTimers()
    await act(async () => {
      root.render(<LineNumbers content={'first\nsecond'} deferUpdates />)
    })
    const gutter = () => container.querySelector('.editor-line-numbers')
    expect(gutter()?.getAttribute('data-line-count')).toBe('2')

    await act(async () => {
      root.render(<LineNumbers content={'first\nsecond\n\nfourth'} deferUpdates />)
    })
    expect(gutter()?.getAttribute('data-line-count')).toBe('2')

    await act(async () => { vi.advanceTimersByTime(299) })
    expect(gutter()?.getAttribute('data-line-count')).toBe('2')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(gutter()?.getAttribute('data-line-count')).toBe('4')
  })
})
