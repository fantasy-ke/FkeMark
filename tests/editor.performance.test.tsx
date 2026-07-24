import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { Editor, type EditorHandle } from '../src/components/Editor'

const { markdownToHtmlSpy, htmlToMarkdownSpy, renderPreviewHtmlSpy } = vi.hoisted(() => ({
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

interface RenderEditorOptions {
  editorRef?: RefObject<EditorHandle | null>
  onChange?: (content: string) => void
  onDirty?: () => void
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
      settings={{ ...DEFAULT_SETTINGS, autoSave: false }}
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

})
