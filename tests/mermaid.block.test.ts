import { afterEach, describe, expect, it, vi } from 'vitest'
import { blocksToMarkdownDirect } from '../src/utils/markdown/blockNoteSerializer'
import { mermaidBlockFromCodeBlock, createMermaidBlockSpec } from '../src/components/editor/mermaidBlock'
import { createMermaidBlockView } from '../src/components/editor/mermaidBlockView'

vi.mock('../src/utils/markdown/mermaid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/markdown/mermaid')>()
  return {
    ...actual,
    renderMermaidSvg: vi.fn(async () => '<svg data-mermaid-svg="true"></svg>'),
  }
})

async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

describe('mermaid block', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('promotes mermaid code blocks and serializes back to a fence', () => {
    const promoted = mermaidBlockFromCodeBlock({
      type: 'codeBlock',
      props: { language: 'mermaid' },
      content: [{ text: 'erDiagram\n  A ||--o{ B : has' }],
      children: [],
    })
    expect(promoted?.type).toBe('mermaid')
    expect(promoted?.props.source).toContain('erDiagram')

    const result = blocksToMarkdownDirect([{
      type: 'mermaid',
      props: { source: 'erDiagram\n  A ||--o{ B : has' },
      children: [],
    }])
    expect(result.supported).toBe(true)
    expect(result.markdown).toContain('```mermaid')
    expect(result.markdown).toContain('erDiagram')
  })

  it('parses mermaid pre/code HTML before generic code blocks', () => {
    const spec = createMermaidBlockSpec()
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'language-mermaid'
    code.textContent = 'flowchart LR\n  A-->B'
    pre.appendChild(code)
    expect(spec.implementation.parse?.(pre)).toEqual({ source: 'flowchart LR\n  A-->B' })
  })

  it('renders a diagram widget with source editing and viewer controls', async () => {
    const editor = { isEditable: true, updateBlock: vi.fn() }
    const view = createMermaidBlockView({ id: 'm1', props: { source: 'flowchart LR\n  A-->B' } }, editor)
    document.body.appendChild(view.dom)
    await flush()

    expect(view.dom.querySelector('svg')).not.toBeNull()
    const labeled = (name: string) => Array.from(view.dom.querySelectorAll('button')).find((button) => button.textContent === name)
    labeled('放大查看')?.click()
    expect(document.querySelector('.mermaid-viewer-overlay')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.mermaid-viewer-overlay .mermaid-viewer-button:last-child')?.click()
    expect(document.querySelector('.mermaid-viewer-overlay')).toBeNull()

    labeled('编辑源码')?.click()
    const source = view.dom.querySelector('textarea')
    expect(source?.hidden).toBe(false)
    if (source) source.value = 'flowchart LR\\n  A-->C'
    labeled('完成')?.click()
    expect(editor.updateBlock).toHaveBeenCalledWith('m1', { props: { source: 'flowchart LR\\n  A-->C' } })
    view.destroy?.()
  })

})
