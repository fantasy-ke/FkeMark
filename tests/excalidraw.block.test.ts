import { describe, expect, it, vi } from 'vitest'
import { blocksToMarkdownDirect } from '../src/utils/markdown/blockNoteSerializer'
import { parseExcalidrawScene, renderExcalidrawPreview } from '../src/utils/markdown/excalidraw'
import {
  createExcalidrawBlockSpec,
  excalidrawBlockFromCodeBlock,
  promoteExcalidrawCodeBlocks,
} from '../src/components/editor/excalidrawBlock'
import { bindExcalidrawDiagrams } from '../src/components/editor/useExcalidrawDiagrams'

const SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [{ type: 'rectangle', x: 10, y: 20, width: 80, height: 40, strokeColor: '#1e1e1e' }],
  appState: { viewBackgroundColor: '#fffdf8' },
  files: {},
})

describe('excalidraw block', () => {
  it('promotes an excalidraw fence and serializes it back', () => {
    const promoted = excalidrawBlockFromCodeBlock({
      type: 'codeBlock',
      props: { language: 'excalidraw' },
      content: [{ text: SCENE }],
      children: [],
    })
    expect(promoted?.type).toBe('excalidraw')
    expect(parseExcalidrawScene(promoted?.props.source ?? '')?.elements).toHaveLength(1)

    const result = blocksToMarkdownDirect([{
      type: 'excalidraw',
      props: { source: SCENE },
      children: [],
    }])
    expect(result.supported).toBe(true)
    expect(result.markdown).toContain('```excalidraw')
    expect(result.markdown).toContain('"type":"rectangle"')
  })

  it('converts a live excalidraw code block into an excalidraw block', () => {
    const codeBlock = {
      id: 'sketch',
      type: 'codeBlock',
      props: { language: 'excalidraw' },
      content: [{ text: SCENE }],
      children: [],
    }
    const editor = {
      document: [codeBlock],
      getBlock: vi.fn((id: string) => id === 'sketch' ? codeBlock : undefined),
      replaceBlocks: vi.fn(),
    }
    expect(promoteExcalidrawCodeBlocks(editor)).toBe(true)
    expect(editor.replaceBlocks).toHaveBeenCalledWith([codeBlock], [expect.objectContaining({ type: 'excalidraw' })])
  })

  it('parses excalidraw HTML before a generic code block', () => {
    const spec = createExcalidrawBlockSpec()
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'language-excalidraw'
    code.textContent = SCENE
    pre.appendChild(code)
    expect(spec.implementation.parse?.(pre)).toEqual({ source: SCENE })
  })

  it('renders a static sketch preview and hydrates preview fences', () => {
    expect(renderExcalidrawPreview(SCENE)).toContain('<rect')
    expect(renderExcalidrawPreview('{')).toBeNull()

    const root = document.createElement('div')
    root.innerHTML = `<div class="editor-preview-inner"><pre><code class="language-excalidraw">${SCENE}</code></pre></div>`
    const release = bindExcalidrawDiagrams(root)
    expect(root.querySelector('.excalidraw-preview-shell svg')).not.toBeNull()
    expect(root.querySelector('pre')?.hidden).toBe(true)
    release()
    expect(root.querySelector('pre')?.hidden).toBe(false)
  })
})
