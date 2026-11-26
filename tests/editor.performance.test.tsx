import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings, EditorMode } from '../src/types'
import type { SearchMatchResult } from '../src/components/CommandPalette'
import type { TocItemData } from '../src/utils/markdown/outline'
import { Editor, type EditorHandle } from '../src/components/Editor'

interface RenderEditorOptions {
  editorRef?: RefObject<EditorHandle | null>
  onChange?: (content: string) => void
  onDirty?: () => void
  onLineCountChange?: (lineCount: number) => void
  onOutlineChange?: (sourceContent: string, items: TocItemData[]) => void
  settings?: Partial<AppSettings>
  filePath?: string | null
  tabId?: string
  openTabIds?: string[]
  searchJump?: { tabId: string; match: SearchMatchResult }
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
      onOutlineChange={options.onOutlineChange}
      settings={{ ...DEFAULT_SETTINGS, autoSave: false, ...options.settings }}
      filePath={options.filePath}
      tabId={options.tabId}
      openTabIds={options.openTabIds}
      searchJump={options.searchJump}
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
    expect(container.querySelector('.split-preview')?.textContent).not.toContain('View switch')
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(container.querySelector('.split-preview')?.textContent).toContain('View switch')
  })

  it('does not undo a document load or restore a previous tab into the current one', async () => {
    const editorRef = createRef<EditorHandle>()
    const view = (tabId: string, content: string) => renderEditor(root, content, 'live', { editorRef, tabId })
    await act(async () => view('a', 'Old document'))
    await waitForEditable(editorRef)
    const editor = editorRef.current!.getEditor()!
    await act(async () => { editor.updateBlock(editor.document[0], { content: 'Edited old document' }) })

    await act(async () => view('b', 'New document'))
    await waitForEditable(editorRef)
    await act(async () => { expect(editor.undo()).toBe(false) })
    expect(editor.domElement?.textContent).toContain('New document')

    await act(async () => { editor.updateBlock(editor.document[0], { content: 'Edited new document' }) })
    await act(async () => { expect(editor.undo()).toBe(true) })
    expect(editor.domElement?.textContent).toContain('New document')
    expect(editor.domElement?.textContent).not.toContain('Edited new document')
    expect(editor.undo()).toBe(false)
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

  it('does not show another tab’s preview while split rendering is pending', async () => {
    vi.useFakeTimers()
    await act(async () => renderEditor(root, '# Tab A only', 'split', { tabId: 'a' }))
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    await act(async () => renderEditor(root, '# Tab B only', 'split', { tabId: 'b' }))
    expect(container.querySelector('.split-preview')?.textContent).not.toContain('Tab A only')
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(container.querySelector('.split-preview')?.textContent).toContain('Tab B only')
  })

  it('moves the source mirrors to the latest scroll position on the next frame', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    await act(async () => renderEditor(root, '# One\n\n**Two**', 'source'))
    const source = container.querySelector<HTMLTextAreaElement>('.source-textarea')!
    const gutter = container.querySelector<HTMLElement>('.source-line-numbers-content')!
    const syntax = container.querySelector<HTMLElement>('.markdown-syntax-highlight-content')!
    const before = syntax.style.transform

    await act(async () => {
      source.scrollTop = 12
      source.dispatchEvent(new Event('scroll'))
      source.scrollTop = 40
      source.scrollLeft = 17
      source.dispatchEvent(new Event('scroll'))
    })
    expect(syntax.style.transform).toBe(before)

    await act(async () => { vi.advanceTimersByTime(16) })
    expect(gutter.style.transform).toBe('translateY(-40px)')
    expect(syntax.style.transform).toBe('translate(-17px, -40px)')
  })

  it('restores independent source scroll and selection after switching tabs', async () => {
    const view = (tabId: string) => renderEditor(root, 'alpha\nbeta\ngamma', 'source', { tabId, openTabIds: ['a', 'b'] })
    const textarea = () => container.querySelector<HTMLTextAreaElement>('.source-textarea')!
    await act(async () => view('a'))
    textarea().scrollTop = 40
    textarea().scrollLeft = 12
    textarea().setSelectionRange(2, 7, 'backward')
    await act(async () => view('b'))
    expect(textarea().scrollTop).toBe(0)
    textarea().scrollTop = 9
    textarea().setSelectionRange(1, 1)
    await act(async () => view('a'))
    expect([textarea().scrollLeft, textarea().scrollTop]).toEqual([12, 40])
    expect(container.querySelector<HTMLElement>('.markdown-syntax-highlight-content')?.style.transform).toBe('translate(-12px, -40px)')
    expect([textarea().selectionStart, textarea().selectionEnd, textarea().selectionDirection]).toEqual([2, 7, 'backward'])
  })

  it('selects the requested source line on the target tab without waiting for a timer', async () => {
    await act(async () => renderEditor(root, 'first\nneedle\nthird', 'source', {
      tabId: 'a', searchJump: { tabId: 'a', match: {
        filePath: '/a.md', fileName: 'a.md', lineNumber: 2, column: 1, lineText: 'needle', matchStart: 0, matchEnd: 6, isFileNameMatch: false,
      } },
    }))
    const source = container.querySelector<HTMLTextAreaElement>('.source-textarea')!
    expect(source.value.slice(source.selectionStart, source.selectionEnd)).toBe('needle')
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

  it('does not reapply or mark dirty when the open file is only renamed', async () => {
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onDirty = vi.fn()
    const content = '# Renamed\n\nKeep blocks'

    await act(async () => renderEditor(root, content, 'live', {
      editorRef,
      onChange,
      onDirty,
      filePath: 'D:/docs/old.md',
    }))
    await waitForEditable(editorRef)
    await settleEditor(80)
    const editorDom = editorRef.current?.getEditor()?.domElement
    const blockIds = Array.from(editorDom?.querySelectorAll('[data-node-type="blockContainer"][data-id]') ?? [])
      .map((el) => (el as HTMLElement).dataset.id)

    onDirty.mockClear()
    onChange.mockClear()

    await act(async () => renderEditor(root, content, 'live', {
      editorRef,
      onChange,
      onDirty,
      filePath: 'D:/docs/new.md',
    }))
    await settleEditor(80)

    expect(onDirty).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(editorRef.current?.getEditor()?.domElement).toBe(editorDom)
    expect(Array.from(editorDom?.querySelectorAll('[data-node-type="blockContainer"][data-id]') ?? [])
      .map((el) => (el as HTMLElement).dataset.id)).toEqual(blockIds)
    expect(editorRef.current?.getContent()).toBe(content)
  })

  it('reports the parsed outline as soon as an opened file finishes applying', async () => {
    const editorRef = createRef<EditorHandle>()
    const onOutlineChange = vi.fn()
    const content = '---\n# First open\n\n## Ready without switching views'

    await act(async () => renderEditor(root, content, 'live', {
      editorRef,
      filePath: 'D:/docs/outline.md',
      onOutlineChange,
    }))
    await waitForEditable(editorRef)

    expect(onOutlineChange).toHaveBeenCalledWith(content, [
      { level: 1, text: 'First open', index: 0 },
      { level: 2, text: 'Ready without switching views', index: 0 },
    ])
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
