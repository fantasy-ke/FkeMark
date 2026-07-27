import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings, EditorMode } from '../src/types'
import { Editor, type EditorHandle } from '../src/components/Editor'

const { renderPreviewHtmlSpy } = vi.hoisted(() => ({
  renderPreviewHtmlSpy: vi.fn(),
}))

vi.mock('../src/utils/markdown/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/markdown/engine')>()
  return {
    ...actual,
    renderPreviewHtml: (...args: Parameters<typeof actual.renderPreviewHtml>) => {
      renderPreviewHtmlSpy(...args)
      return actual.renderPreviewHtml(...args)
    },
  }
})

interface RenderEditorOptions {
  editorRef?: RefObject<EditorHandle | null>
  onChange?: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
  settings?: Partial<AppSettings>
  filePath?: string | null
}

function renderEditor(
  root: Root,
  content: string,
  editorMode: EditorMode,
  options: RenderEditorOptions = {},
) {
  root.render(
    <Editor
      ref={options.editorRef}
      content={content}
      onChange={options.onChange ?? (() => {})}
      onDirty={options.onDirty}
      onLineCountChange={options.onLineCountChange}
      settings={{ ...DEFAULT_SETTINGS, autoSave: false, ...options.settings }}
      filePath={options.filePath}
      editorMode={editorMode}
      onEditorModeChange={() => {}}
      onSlashCommand={() => {}}
      findReplaceVisible={false}
      findReplaceMode="find"
      onFindReplaceClose={() => {}}
      onFindReplaceModeChange={() => {}}
    />,
  )
}

async function settleEditor(ms = 30) {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

async function waitForEditable(editorRef: RefObject<EditorHandle | null>, timeoutMs = 2_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (editorRef.current?.getEditor()?.isEditable) return
    await settleEditor(20)
  }
  throw new Error('BlockNote editor did not finish applying the document')
}

describe('Tolaria-style large-document rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    renderPreviewHtmlSpy.mockClear()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('reuses one BlockNote instance and DOM across live, read, and split modes', async () => {
    const editorRef = createRef<EditorHandle>()
    const content = '# View switch\n\nBody'
    await act(async () => renderEditor(root, content, 'live', { editorRef }))
    await settleEditor()
    const editor = editorRef.current?.getEditor()
    const editorDom = editor?.domElement
    expect(editor).toBeTruthy()
    expect(editorDom?.isConnected).toBe(true)

    await act(async () => renderEditor(root, content, 'read', { editorRef }))
    await settleEditor()
    expect(editorRef.current?.getEditor()).toBe(editor)
    expect(editorRef.current?.getEditor()?.domElement).toBe(editorDom)

    vi.useFakeTimers()
    await act(async () => renderEditor(root, content, 'split', { editorRef }))
    expect(editorRef.current?.getEditor()).toBe(editor)
    expect(editorDom?.isConnected).toBe(true)
    expect(renderPreviewHtmlSpy).not.toHaveBeenCalled()
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(renderPreviewHtmlSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps the current split preview mounted while the next render is pending', async () => {
    vi.useFakeTimers()
    await act(async () => renderEditor(root, '# Before\n\nCurrent section', 'split'))
    await act(async () => { await vi.runOnlyPendingTimersAsync() })

    const preview = container.querySelector('.split-preview') as HTMLDivElement | null
    expect(preview?.textContent).toContain('Before')
    if (!preview) throw new Error('Split preview was not rendered')
    preview.scrollTop = 180

    await act(async () => renderEditor(root, '# After\n\nCurrent section updated', 'split'))

    expect(container.querySelector('.split-preview')).toBe(preview)
    expect(preview.textContent).toContain('Before')
    expect(preview.scrollTop).toBe(180)

    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(preview.textContent).toContain('After')
    expect(preview.scrollTop).toBe(180)
  })

  it('does not mark an opened markdown file dirty while applying live editor content', async () => {
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onDirty = vi.fn()
    const content = '# Opened\n\nBody'

    await act(async () => renderEditor(root, content, 'live', {
      editorRef,
      onChange,
      onDirty,
      filePath: 'D:/docs/opened.md',
    }))
    await waitForEditable(editorRef)
    await settleEditor(80)

    expect(onDirty).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(editorRef.current?.getContent()).toBe(content)
  })

  it('marks dirty once and serializes once after 1.5 seconds of idle time', async () => {
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onDirty = vi.fn()
    await act(async () => renderEditor(root, '# Input\n\nBody', 'live', { editorRef, onChange, onDirty }))
    await settleEditor()
    const editor = editorRef.current?.getEditor()
    if (!editor?.blocksToMarkdownDirect) throw new Error('BlockNote editor was not initialized')
    const directSerializer = vi.fn(editor.blocksToMarkdownDirect)
    editor.blocksToMarkdownDirect = directSerializer
    vi.useFakeTimers()

    await act(async () => {
      editor.insertInlineContent('A')
      editor.insertInlineContent('B')
    })

    expect(onDirty).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(directSerializer).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_499) })
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(directSerializer).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toContain('AB')
  })

  it('switches an 800-line document to split mode and then saves without synchronous serialization', async () => {
    const content = Array.from(
      { length: 400 },
      (_, index) => `## Section ${index + 1}\nBody ${index + 1}`,
    ).join('\n')
    expect(content.split('\n')).toHaveLength(800)
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onDirty = vi.fn()
    await act(async () => renderEditor(root, content, 'live', { editorRef, onChange, onDirty }))
    await waitForEditable(editorRef)
    const editor = editorRef.current?.getEditor()
    if (!editor?.blocksToMarkdownDirect) throw new Error('BlockNote editor was not initialized')
    const editorDom = editor.domElement
    const directSerializer = vi.fn(editor.blocksToMarkdownDirect)
    editor.blocksToMarkdownDirect = directSerializer

    await act(async () => { editor.insertInlineContent('pending-save') })
    expect(onDirty).toHaveBeenCalledTimes(1)
    expect(directSerializer).not.toHaveBeenCalled()

    await act(async () => renderEditor(root, content, 'split', { editorRef, onChange, onDirty }))
    expect(editorRef.current?.getEditor()).toBe(editor)
    expect(editorDom?.isConnected).toBe(true)
    expect(directSerializer).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()

    const saved = await editorRef.current?.getContentDeferred()
    expect(saved).toContain('pending-save')
    expect(directSerializer).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('yields once before save serialization and does not convert through HTML', async () => {
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    await act(async () => renderEditor(root, '# Save\n\nBody', 'live', { editorRef, onChange }))
    await settleEditor()
    const editor = editorRef.current?.getEditor()
    if (!editor?.blocksToMarkdownDirect) throw new Error('BlockNote editor was not initialized')
    const directSerializer = vi.fn(editor.blocksToMarkdownDirect)
    const lossySerializer = vi.spyOn(editor, 'blocksToMarkdownLossy')
    editor.blocksToMarkdownDirect = directSerializer

    await act(async () => { editor.insertInlineContent('pending-save') })
    const current = await editorRef.current?.getContentDeferred()

    expect(current).toContain('pending-save')
    expect(directSerializer).toHaveBeenCalledTimes(1)
    expect(lossySerializer).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables browser spellcheck for large documents and updates line count after idle', async () => {
    const content = Array.from({ length: 800 }, (_, index) => `Line ${index + 1}`).join('\n')
    const editorRef = createRef<EditorHandle>()
    const onLineCountChange = vi.fn()
    await act(async () => renderEditor(root, content, 'source', {
      editorRef,
      onLineCountChange,
      settings: { spellCheckEnabled: true },
    }))
    await act(async () => renderEditor(root, content, 'live', {
      editorRef,
      onLineCountChange,
      settings: { spellCheckEnabled: true },
    }))
    await waitForEditable(editorRef)
    await settleEditor(80)
    const editor = editorRef.current?.getEditor()
    expect(editor?.domElement?.classList.contains('editor-inner--large-document')).toBe(true)
    expect(editor?.domElement?.getAttribute('spellcheck')).toBe('false')
    onLineCountChange.mockClear()
    vi.useFakeTimers()

    await act(async () => {
      editor?.insertInlineContent('A')
      editor?.insertInlineContent('B')
    })
    expect(onLineCountChange).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(onLineCountChange).toHaveBeenCalledTimes(1)
  })
})
