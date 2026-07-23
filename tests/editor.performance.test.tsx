import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { Editor } from '../src/components/Editor'

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

function renderEditor(root: Root, content: string, editorMode: 'live' | 'read' | 'split') {
  root.render(
    <Editor
      content={content}
      onChange={() => {}}
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
})
