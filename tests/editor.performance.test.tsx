import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings } from '../src/types'
import { Editor, type EditorHandle } from '../src/components/Editor'

const { countEditorLinesSpy, markdownToHtmlSpy, htmlToMarkdownSpy, renderPreviewHtmlSpy } = vi.hoisted(() => ({
  countEditorLinesSpy: vi.fn(),
  markdownToHtmlSpy: vi.fn(),
  htmlToMarkdownSpy: vi.fn(),
  renderPreviewHtmlSpy: vi.fn(),
}))

vi.mock('../src/utils/markdown/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/markdown/engine')>()
  return {
    ...actual,
    markdownToHtml: (...args: Parameters<typeof actual.markdownToHtml>) => {
      markdownToHtmlSpy(...args)
      return actual.markdownToHtml(...args)
    },
    htmlToMarkdown: (...args: Parameters<typeof actual.htmlToMarkdown>) => {
      htmlToMarkdownSpy(...args)
      return actual.htmlToMarkdown(...args)
    },
    renderPreviewHtml: (...args: Parameters<typeof actual.renderPreviewHtml>) => {
      renderPreviewHtmlSpy(...args)
      return actual.renderPreviewHtml(...args)
    },
  }
})

vi.mock('../src/components/editor/editorLineCount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/editor/editorLineCount')>()
  return {
    ...actual,
    countEditorLines: (...args: Parameters<typeof actual.countEditorLines>) => {
      countEditorLinesSpy(...args)
      return actual.countEditorLines(...args)
    },
  }
})

interface RenderEditorOptions {
  editorRef?: RefObject<EditorHandle | null>
  onChange?: (content: string) => void
  onDirty?: () => void
  settings?: Partial<AppSettings>
}

function renderEditor(
  root: Root,
  content: string,
  editorMode: 'live' | 'read' | 'split',
  options: RenderEditorOptions = {},
) {
  root.render(
    <Editor
      ref={options.editorRef}
      content={content}
      onChange={options.onChange ?? (() => {})}
      onDirty={options.onDirty}
      settings={{ ...DEFAULT_SETTINGS, autoSave: false, ...options.settings }}
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

describe('长文档渲染性能', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    countEditorLinesSpy.mockClear()
    markdownToHtmlSpy.mockClear()
    htmlToMarkdownSpy.mockClear()
    renderPreviewHtmlSpy.mockClear()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('实时编辑切换阅读时不重复解析或反序列化整篇文档', async () => {
    const content = '# 性能测试\n\n' + '正文内容。'.repeat(20)
    await act(async () => renderEditor(root, content, 'live'))

    expect(markdownToHtmlSpy).toHaveBeenCalledTimes(1)
    expect(htmlToMarkdownSpy).not.toHaveBeenCalled()
    expect(renderPreviewHtmlSpy).not.toHaveBeenCalled()

    markdownToHtmlSpy.mockClear()
    htmlToMarkdownSpy.mockClear()
    renderPreviewHtmlSpy.mockClear()
    await act(async () => renderEditor(root, content, 'read'))

    expect(markdownToHtmlSpy).not.toHaveBeenCalled()
    expect(htmlToMarkdownSpy).not.toHaveBeenCalled()
    expect(renderPreviewHtmlSpy).not.toHaveBeenCalled()
  })

  it('切换分栏时先让界面响应，并复用实时编辑器的 HTML', async () => {
    const content = '# 分栏预览\n\n' + '正文内容。'.repeat(20)
    await act(async () => renderEditor(root, content, 'live'))
    markdownToHtmlSpy.mockClear()
    htmlToMarkdownSpy.mockClear()
    renderPreviewHtmlSpy.mockClear()
    vi.useFakeTimers()

    await act(async () => renderEditor(root, content, 'split'))
    expect(markdownToHtmlSpy).not.toHaveBeenCalled()
    expect(renderPreviewHtmlSpy).not.toHaveBeenCalled()

    await act(async () => { vi.runOnlyPendingTimers() })
    expect(markdownToHtmlSpy).not.toHaveBeenCalled()
    expect(renderPreviewHtmlSpy).toHaveBeenCalledTimes(1)
  })

  it('长文档连续输入和停顿期间都不自动序列化整篇文档', async () => {
    const content = '# 连续输入性能\n\n' + '长文档内容。'.repeat(17_000)
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onDirty = vi.fn()
    await act(async () => renderEditor(root, content, 'live', { editorRef, onChange, onDirty }))
    htmlToMarkdownSpy.mockClear()
    vi.useFakeTimers()

    await act(async () => { editorRef.current?.getEditor()?.commands.insertContent('甲') })
    await act(async () => { editorRef.current?.getEditor()?.commands.insertContent('乙') })

    expect(onDirty).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(htmlToMarkdownSpy).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(htmlToMarkdownSpy).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('800 行文档输入时也跳过同步全文序列化', async () => {
    const content = Array.from({ length: 800 }, (_, index) => `第 ${index + 1} 行：实时编辑性能回归`).join('\n')
    expect(content.length).toBeLessThan(100_000)
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onDirty = vi.fn()
    await act(async () => renderEditor(root, content, 'live', { editorRef, onChange, onDirty }))
    htmlToMarkdownSpy.mockClear()

    await act(async () => { editorRef.current?.getEditor()?.commands.insertContent('甲') })

    expect(onDirty).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(htmlToMarkdownSpy).not.toHaveBeenCalled()
    expect(
      editorRef.current?.getEditor()?.view.dom.classList.contains('editor-inner--large-document'),
    ).toBe(true)
  })

  it('读取长文档当前内容时会刷新待处理输入', async () => {
    const content = '# 保存性能\n\n' + '长文档内容。'.repeat(17_000)
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    await act(async () => renderEditor(root, content, 'live', { editorRef, onChange }))
    htmlToMarkdownSpy.mockClear()

    await act(async () => { editorRef.current?.getEditor()?.commands.insertContent('待保存') })
    expect(htmlToMarkdownSpy).not.toHaveBeenCalled()

    const current = editorRef.current?.getContent()
    expect(current).toContain('待保存')
    expect(htmlToMarkdownSpy).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('长文档输入期间合并行数统计，不在每次 transaction 中遍历全文', async () => {
    const content = '# 行数统计性能\n\n' + '长文档内容。'.repeat(17_000)
    const editorRef = createRef<EditorHandle>()
    const onLineCountChange = vi.fn()
    await act(async () => {
      root.render(
        <Editor
          ref={editorRef}
          content={content}
          onChange={() => {}}
          onLineCountChange={onLineCountChange}
          settings={{ ...DEFAULT_SETTINGS, autoSave: false }}
          editorMode="live"
          onEditorModeChange={() => {}}
          onSlashCommand={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
        />,
      )
    })
    countEditorLinesSpy.mockClear()
    onLineCountChange.mockClear()
    vi.useFakeTimers()

    await act(async () => { editorRef.current?.getEditor()?.commands.insertContent('甲') })
    await act(async () => { editorRef.current?.getEditor()?.commands.insertContent('乙') })

    expect(countEditorLinesSpy).not.toHaveBeenCalled()
    expect(onLineCountChange).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(299) })
    expect(countEditorLinesSpy).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(countEditorLinesSpy).toHaveBeenCalledTimes(1)
    expect(onLineCountChange).toHaveBeenCalledTimes(1)
  })

  it('长文档阅读模式延迟测量渲染行号', async () => {
    vi.useFakeTimers()
    const content = '# 阅读行号性能\n\n' + '长文档内容。'.repeat(17_000)

    await act(async () => renderEditor(root, content, 'read', {
      settings: { showLineNumbers: true },
    }))

    expect(countEditorLinesSpy).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(399) })
    expect(countEditorLinesSpy).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    await act(async () => { vi.runOnlyPendingTimers() })
    expect(countEditorLinesSpy).toHaveBeenCalledTimes(1)
  })

  it('长文档实时编辑启用视口渲染并关闭原生全文拼写扫描', async () => {
    const content = '# 视口渲染\n\n' + '长文档内容。'.repeat(17_000)
    const editorRef = createRef<EditorHandle>()
    await act(async () => renderEditor(root, content, 'live', {
      editorRef,
      settings: { spellCheckEnabled: true },
    }))

    const editorElement = editorRef.current?.getEditor()?.view.dom
    expect(editorElement?.classList.contains('editor-inner--large-document')).toBe(true)
    expect(editorElement?.getAttribute('spellcheck')).toBe('false')
  })
})
