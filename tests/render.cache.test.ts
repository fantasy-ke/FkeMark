import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRenderCache } from '../src/utils/markdown/renderCache'
import { resetViewportObserver, rewriteSvgIds } from '../src/utils/markdown/heavyRender'
import { applyKatexPlaceholders, clearKatexRenderCache, renderKatexHtml } from '../src/utils/markdown/katexRender'
import { markdownToHtml, renderPreviewHtml } from '../src/utils/markdown/engine'
import { clearMermaidRenderCache, renderMermaidSvg } from '../src/utils/markdown/mermaid'
import { bindMermaidDiagrams } from '../src/components/editor/useMermaidDiagrams'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}"><defs><marker id="arrowhead"></marker></defs><path marker-end="url(#arrowhead)"/></svg>`,
    })),
  },
}))

describe('render cache', () => {
  afterEach(() => {
    clearKatexRenderCache()
    clearMermaidRenderCache()
    resetViewportObserver()
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
    document.body.replaceChildren()
  })

  it('drops the oldest entry after the limit', () => {
    const cache = createRenderCache<string>(2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.get('a')
    cache.set('c', '3')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('1')
    expect(cache.get('c')).toBe('3')
  })

  it('renders KaTeX as html and reuses the cached string', async () => {
    const katex = await import('katex')
    const render = vi.spyOn(katex.default, 'renderToString')
    const first = renderKatexHtml('a^2', false)
    const second = renderKatexHtml('a^2', false)
    expect(first).toBe(second)
    expect(first).toContain('katex')
    expect(first).not.toContain('<math')
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0]?.[1]).toMatchObject({ output: 'html' })
    render.mockRestore()
  })

  it('replaces formula placeholders without parsing the whole document', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString')
    const html = markdownToHtml('行内 \\(a+b\\) 与\n\n$$E = mc^2$$')
    expect(renderPreviewHtml(html)).toContain('data-tex=')
    expect(renderPreviewHtml(html)).not.toContain('fk-math-rendered')
    const forced = renderPreviewHtml(html, { force: true })
    expect(forced).toContain('fk-math-rendered')
    expect(forced).toContain('data-tex=')
    expect(forced).toContain('katex')
    expect(forced).not.toContain('<math')
    expect(parse).not.toHaveBeenCalled()
    expect(applyKatexPlaceholders(html)).toBe(forced)
    parse.mockRestore()
  })

  it('rewrites svg ids so two copies do not share markers', async () => {
    const mermaid = await import('mermaid')
    mermaid.default.render.mockClear()
    const source = 'flowchart LR\n  A-->B'
    const [first, second] = await Promise.all([
      renderMermaidSvg(source, false),
      renderMermaidSvg(source, false),
    ])
    expect(mermaid.default.render).toHaveBeenCalledTimes(1)
    expect(first).not.toBe(second)
    expect(first).toContain('url(#arrowhead-')
    expect(second).toContain('url(#arrowhead-')
    expect(first).not.toContain(second.match(/id="arrowhead-[^"]+"/)?.[0] ?? 'missing')
    expect(rewriteSvgIds('<svg id="a"></svg>')).not.toBe(rewriteSvgIds('<svg id="a"></svg>'))
  })

  it('does not render an offscreen mermaid diagram until it enters the viewport', async () => {
    const observed: Element[] = []
    let notify: IntersectionObserverCallback = () => {}
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback
      }
      observe(target: Element) { observed.push(target) }
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver
    resetViewportObserver()

    const root = document.createElement('div')
    root.innerHTML = `
      <div class="editor-preview-inner">
        <pre><code class="language-mermaid">flowchart LR\n  A-->B</code></pre>
      </div>
    `
    document.body.appendChild(root)
    const cleanup = bindMermaidDiagrams(root, 'preview', false, '失败')
    await Promise.resolve()
    expect(root.querySelector('svg')).toBeNull()
    expect(observed.length).toBeGreaterThan(0)

    notify([{ isIntersecting: true, target: observed[0] } as IntersectionObserverEntry], {} as IntersectionObserver)
    await vi.waitFor(() => {
      expect(root.querySelector('svg')).not.toBeNull()
    })
    cleanup()
  })

  it('keeps content-visibility off ProseMirror block shells', () => {
    const editorCss = readFileSync('src/styles/editor.css', 'utf8')
    const overlayCss = readFileSync('src/styles/overlays.css', 'utf8')
    expect(editorCss).not.toContain('.editor-inner--large-document > *')
    expect(overlayCss).toContain('.editor-preview-inner--large > *')
    expect(overlayCss).toContain('.editor-inner--large-document .katex-render')
    expect(overlayCss).not.toContain('.bn-block-outer')
  })
})
