import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMermaidLanguage } from '../src/utils/markdown/codeLanguage'
import { isMermaidSource, shouldRenderMermaid } from '../src/utils/markdown/mermaid'
import { bindMermaidDiagrams } from '../src/components/editor/useMermaidDiagrams'

vi.mock('../src/utils/markdown/mermaid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/markdown/mermaid')>()
  return {
    ...actual,
    renderMermaidSvg: vi.fn(async (source: string) => `<svg data-mermaid-svg="true"><title>${source.slice(0, 24)}</title></svg>`),
  }
})

async function flushRender() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

describe('isMermaidLanguage', () => {
  it('accepts mermaid aliases regardless of case', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true)
    expect(isMermaidLanguage('Mermaid')).toBe(true)
    expect(isMermaidLanguage('mmd')).toBe(true)
    expect(isMermaidLanguage('javascript')).toBe(false)
  })
})

describe('isMermaidSource', () => {
  it('recognizes erDiagram and other diagram headers', () => {
    expect(isMermaidSource('erDiagram\n  A ||--o{ B : has')).toBe(true)
    expect(isMermaidSource('flowchart LR\n  A-->B')).toBe(true)
    expect(isMermaidSource('const a = 1')).toBe(false)
    expect(shouldRenderMermaid('', 'erDiagram\n  A ||--o{ B : has')).toBe(true)
    expect(shouldRenderMermaid('javascript', 'const a = 1')).toBe(false)
  })
})

describe('bindMermaidDiagrams', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders a BlockNote mermaid code block as a diagram', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="bn-block-content" data-content-type="codeBlock">
        <div contenteditable="false"><select><option value="mermaid" selected>Mermaid</option></select></div>
        <pre><code>erDiagram\n  A ||--o{ B : has</code></pre>
      </div>
    `
    document.body.appendChild(root)
    const cleanup = bindMermaidDiagrams(root, 'blocknote', false, 'Failed to render diagram')
    await flushRender()

    const block = root.querySelector<HTMLElement>('[data-content-type="codeBlock"]')!
    expect(block.getAttribute('data-mermaid-rendered')).toBe('true')
    expect(block.querySelector('.mermaid-diagram svg')).not.toBeNull()
    cleanup()
  })

  it('renders from data-language when the language select is missing', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="bn-block-content" data-content-type="codeBlock" data-language="mermaid">
        <pre><code>erDiagram\n  A ||--o{ B : has</code></pre>
      </div>
    `
    document.body.appendChild(root)
    const cleanup = bindMermaidDiagrams(root, 'blocknote', false, 'Failed to render diagram')
    await flushRender()

    const block = root.querySelector<HTMLElement>('[data-content-type="codeBlock"]')!
    expect(block.getAttribute('data-mermaid-rendered')).toBe('true')
    expect(block.querySelector('.mermaid-diagram svg')).not.toBeNull()
    cleanup()
  })

  it('renders erDiagram source even without a mermaid language mark', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="bn-block-content" data-content-type="codeBlock">
        <pre><code>erDiagram\n  A ||--o{ B : has</code></pre>
      </div>
    `
    document.body.appendChild(root)
    const cleanup = bindMermaidDiagrams(root, 'blocknote', false, 'Failed to render diagram')
    await flushRender()

    const block = root.querySelector<HTMLElement>('[data-content-type="codeBlock"]')!
    expect(block.getAttribute('data-mermaid-rendered')).toBe('true')
    expect(block.querySelector('.mermaid-diagram svg')).not.toBeNull()
    cleanup()
  })

  it('does not render non-mermaid code blocks', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="bn-block-content" data-content-type="codeBlock">
        <div><select><option value="javascript" selected>JavaScript</option></select></div>
        <pre><code>const a = 1</code></pre>
      </div>
    `
    document.body.appendChild(root)
    const cleanup = bindMermaidDiagrams(root, 'blocknote', false, 'Failed to render diagram')
    await flushRender()
    expect(root.querySelector('.mermaid-diagram')).toBeNull()
    cleanup()
  })

  it('renders preview mermaid fences inside a dedicated shell', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="editor-preview-inner">
        <pre><code class="language-mermaid">flowchart LR\n  A-->B</code></pre>
      </div>
    `
    document.body.appendChild(root)
    const cleanup = bindMermaidDiagrams(root, 'preview', false, 'Failed to render diagram')
    await flushRender()

    const shell = root.querySelector('.mermaid-preview-shell') as HTMLElement
    expect(shell).not.toBeNull()
    expect(shell.getAttribute('data-mermaid-rendered')).toBe('true')
    expect(shell.querySelector('.mermaid-diagram svg')).not.toBeNull()
    cleanup()
    expect(root.querySelector('.mermaid-diagram')).toBeNull()
  })
})
