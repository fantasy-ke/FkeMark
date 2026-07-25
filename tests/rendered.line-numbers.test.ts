import { describe, expect, it, vi } from 'vitest'
import {
  collectRenderedLineLayout,
  createFallbackRenderedLineLayout,
  getVisibleRenderedLineMarkers,
} from '../src/components/editor/renderedLineNumbers'

function rect(top: number, height = 20): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function setRect(element: Element, top: number, height = 20) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(top, height))
}

describe('rendered line number layout', () => {
  it('keeps a heading on one number and places the blank source line between blocks', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h1>Heading</h1><p>Paragraph</p>'
    const heading = root.querySelector('h1')!
    const paragraph = root.querySelector('p')!
    setRect(root, 100, 300)
    setRect(heading, 140, 44)
    setRect(paragraph, 260, 30)
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 300 })

    const layout = collectRenderedLineLayout(root, '# Heading\n\nParagraph')

    expect(layout.markers).toEqual([
      { lineNumber: 1, top: 40 },
      { lineNumber: 2, top: 100 },
      { lineNumber: 3, top: 160 },
    ])
  })

  it('assigns numbers to rendered empty paragraphs', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p><br></p><p><br></p><p><br></p>'
    const paragraphs = Array.from(root.querySelectorAll('p'))
    setRect(root, 100, 160)
    paragraphs.forEach((paragraph, index) => setRect(paragraph, 120 + index * 36, 30))
    paragraphs.forEach((paragraph) => {
      const br = paragraph.querySelector('br')!
      setRect(br, 0, 0)
    })
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 160 })

    const layout = collectRenderedLineLayout(root, '\n\n')

    expect(layout.markers.map(({ lineNumber, top }) => ({ lineNumber, top }))).toEqual([
      { lineNumber: 1, top: 20 },
      { lineNumber: 2, top: 56 },
      { lineNumber: 3, top: 92 },
    ])
  })

  it('keeps the final number at the final rendered block and virtualizes off-screen markers', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h1>Heading</h1><p>Paragraph</p>'
    const heading = root.querySelector('h1')!
    const paragraph = root.querySelector('p')!
    setRect(root, 100, 1200)
    setRect(heading, 140, 44)
    setRect(paragraph, 1180, 30)
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 1200 })

    const layout = collectRenderedLineLayout(root, '# Heading\n\nParagraph')
    const visible = getVisibleRenderedLineMarkers(layout.markers, 950, 300, 40, 0)

    expect(layout.markers.at(-1)).toEqual({ lineNumber: 3, top: 1080 })
    expect(layout.height).toBe(1200)
    expect(visible.map((marker) => marker.lineNumber)).toEqual([3])
  })

  it('anchors the gutter to the rendered root inside its scroll container', () => {
    const scroll = document.createElement('div')
    const root = document.createElement('div')
    root.innerHTML = '<p>Paragraph</p>'
    setRect(scroll, 20, 400)
    setRect(root, 84, 200)
    setRect(root.querySelector('p')!, 84, 30)
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, value: 100 })
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 200 })

    const layout = collectRenderedLineLayout(root, 'Paragraph', undefined, scroll)

    expect(layout.top).toBe(164)
  })

  it('creates a bounded fallback layout before rendered DOM is available', () => {
    const layout = createFallbackRenderedLineLayout(805, 64)

    expect(layout.markers).toHaveLength(805)
    expect(layout.top).toBe(64)
    expect(layout.markers.at(-1)?.lineNumber).toBe(805)
    expect(getVisibleRenderedLineMarkers(layout.markers, 0, 0, 40)).toHaveLength(200)
  })
})
