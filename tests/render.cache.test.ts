import { afterEach, describe, expect, it, vi } from 'vitest'
import mermaidModule from 'mermaid'
import { readFileSync } from 'node:fs'
import { createRenderCache } from '../src/utils/markdown/renderCache'
import { applyReservedHeight, observeNearViewport, rememberRenderHeight, resetViewportObserver, rewriteSvgIds } from '../src/utils/markdown/heavyRender'
import { loadKatexRenderer } from '../src/utils/markdown/katexRender'
import { markdownToHtml, markdownToPreviewHtml } from '../src/utils/markdown/engine'
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
    const renderKatexHtml = await loadKatexRenderer()
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

  it('replaces formula placeholders without parsing the whole document', async () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString')
    const source = '行内 \\(a+b\\) 与\n\n$$E = mc^2$$'
    const html = markdownToHtml(source)
    expect(html).toContain('data-tex=')
    expect(html).not.toContain('fk-math-rendered')
    const forced = await markdownToPreviewHtml(source)
    expect(forced).toContain('fk-math-rendered')
    expect(forced).toContain('data-tex=')
    expect(forced).toContain('katex')
    expect(forced).not.toContain('<math')
    expect(parse).not.toHaveBeenCalled()
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
    const animated = rewriteSvgIds('<svg><rect id="box"/><animate begin="box.end" href="#box"/></svg>')
    expect(animated).toContain('begin="box-')
    expect(animated).toContain('.end"')
    expect(animated).not.toContain('begin="box.end"')
  })

  it('rewrites #id selectors inside embedded styles so themes keep applying', () => {
    const svg = [
      '<svg id="chart" xmlns="http://www.w3.org/2000/svg">',
      '<style>#chart .node rect{fill:#f1f5f9;stroke:#475569}#chart .edgePaths .path{stroke:url(#chart-gradient)}</style>',
      '<defs><marker id="arrow"><path d="M0 0"/></marker><linearGradient id="chart-gradient"/></defs>',
      '<rect marker-end="url(#arrow)"/>',
      '</svg>',
    ].join('')
    const rewritten = rewriteSvgIds(svg)
    const rootId = rewritten.match(/<svg id="([^"]+)"/)?.[1]
    expect(rootId).toBeTruthy()
    // 样式表作用域必须和改名后的根节点一致，否则主题样式会整体失效
    expect(rewritten).toContain(`#${rootId} .node rect`)
    expect(rewritten).toContain(`#${rootId} .edgePaths .path`)
    // 样式表里的渐变引用和 marker 引用仍指向被改名的定义
    expect(rewritten).toContain('stroke:url(#chart-gradient-')
    expect(rewritten).toMatch(/id="chart-gradient-[^"]+"/)
    expect(rewritten).toMatch(/url\(#arrow-[^"]+\)/)
    expect(rewritten).toMatch(/id="arrow-[^"]+"/)
  })

  it('releases the scroll root only after its last viewport observation ends', () => {
    let notify: IntersectionObserverCallback
    const disconnect = vi.fn()
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) { notify = callback }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const remove = vi.spyOn(window, 'removeEventListener')
    const root = document.createElement('div')
    root.style.overflowY = 'auto'
    const first = root.appendChild(document.createElement('div'))
    const second = root.appendChild(document.createElement('div'))
    document.body.append(root)
    const onFirst = vi.fn()
    try {
      observeNearViewport(first, onFirst)
      const cancelSecond = observeNearViewport(second, () => {})
      notify!([{ target: first, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      expect(onFirst).toHaveBeenCalledOnce()
      expect(disconnect).not.toHaveBeenCalled()
      cancelSecond()
      cancelSecond()
      expect(disconnect).toHaveBeenCalledOnce()
      expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    } finally {
      resetViewportObserver()
      remove.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('drops old heights and does not retain oversized scene sources', () => {
    const measured = document.createElement('div')
    measured.getBoundingClientRect = () => new DOMRect(0, 0, 100, 180)
    const reused = document.createElement('div')
    rememberRenderHeight(measured, 'height-entry-first')
    for (let n = 0; n < 300; n += 1) rememberRenderHeight(measured, `height-entry-${n}`)
    applyReservedHeight(reused, 'height-entry-first')
    expect(reused.style.minHeight).toBe('')
    applyReservedHeight(reused, 'height-entry-299')
    expect(reused.style.minHeight).toBe('180px')
    const huge = 'a'.repeat(256 * 1024)
    rememberRenderHeight(measured, huge)
    reused.style.minHeight = ''
    applyReservedHeight(reused, huge)
    expect(reused.style.minHeight).toBe('')
  })

  it('unobserves removed Mermaid nodes without closing the split preview', async () => {
    const targets = new Set<Element>()
    class FakeObserver {
      observe(target: Element) { targets.add(target) }
      unobserve(target: Element) { targets.delete(target) }
      disconnect() { targets.clear() }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const root = document.createElement('div')
    root.innerHTML = '<div class="editor-preview-inner"><pre><code class="language-mermaid">flowchart LR\n A-->B</code></pre></div>'
    document.body.append(root)
    const cleanup = bindMermaidDiagrams(root, 'preview', false, '失败')
    try {
      const oldTarget = [...targets][0]
      expect(oldTarget).toBe(root.querySelector('.mermaid-preview-shell'))
      root.firstElementChild!.innerHTML = '<pre><code class="language-mermaid">flowchart LR\n C-->D</code></pre>'
      await vi.waitFor(() => {
        expect(targets.has(oldTarget)).toBe(false)
        expect([...targets]).toEqual([root.querySelector('.mermaid-preview-shell')])
      })
    } finally {
      cleanup()
      resetViewportObserver()
      vi.unstubAllGlobals()
    }
  })

  it('does not write a Mermaid result after unbinding a still mounted preview', async () => {
    let finish: (result: { svg: string }) => void
    const render = vi.mocked(mermaidModule.render)
    render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const root = document.createElement('div')
    root.innerHTML = '<div class="editor-preview-inner"><pre><code class="language-mermaid">flowchart LR\n LateResult-->End</code></pre></div>'
    document.body.append(root)
    const cleanup = bindMermaidDiagrams(root, 'preview', false, '失败')
    const host = root.querySelector('.mermaid-preview-shell')!
    try {
      await vi.waitFor(() => expect(finish).toBeDefined())
      cleanup()
      finish!({ svg: '<svg><title>late diagram</title></svg>' })
      // 同一份在途渲染结算后，已绑定的渲染回调也已经消费结果。
      await renderMermaidSvg('flowchart LR\n LateResult-->End', false)
      await Promise.resolve()
      expect(host.querySelector('svg')).toBeNull()
    } finally {
      cleanup()
    }
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
    expect(overlayCss).not.toContain('[data-content-type="codeBlock"] > pre')
  })
})
