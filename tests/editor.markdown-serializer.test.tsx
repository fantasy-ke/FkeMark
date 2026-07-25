import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { Editor, type EditorHandle } from '../src/components/Editor'
import { createProseMirrorMarkdownSerializer } from '../src/utils/markdown/proseMirrorSerializer'

const CUSTOM_MARKDOWN = [
  '---',
  'title: 序列化测试',
  '---',
  '',
  '# 标题 **粗体** *斜体* ==高亮== <u>下划线</u>',
  '',
  '正文 #tag，包含 [[项目 A]] 与 [链接](https://example.com)。',
  '',
  '* 星号项目',
  '* 第二项',
  '',
  '- [x] 已完成',
  '- [ ] 未完成',
  '',
  '| 名称 | 数值 |',
  '| :------ | ----: |',
  '| A | 1 |',
  '',
  '![封面](cover.png) <!-- size:200pxx300px -->',
  '',
  '\\(a+b\\)',
  '',
  '$$',
  'E=mc^2',
  '$$',
  '',
  '引用[^说明]。',
  '',
  '[^说明]: 脚注内容',
  '',
  '```ts',
  'const answer = 42',
  '```',
].join('\n')

function renderEditor(root: Root, editorRef: React.RefObject<EditorHandle | null>) {
  root.render(
    <Editor
      ref={editorRef}
      content={CUSTOM_MARKDOWN}
      onChange={() => {}}
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
}

describe('ProseMirror Markdown 直接序列化', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('保留 FkeMark 自定义 Markdown 语义且不经过 HTML', async () => {
    const editorRef = createRef<EditorHandle>()
    await act(async () => renderEditor(root, editorRef))
    const editor = editorRef.current?.getEditor()
    if (!editor) throw new Error('Editor was not initialized')

    const serializer = createProseMirrorMarkdownSerializer(editor.schema)
    const result = serializer.serialize(editor.state.doc, null)

    expect(result.markdown).toContain('---\ntitle: 序列化测试\n---')
    expect(result.markdown).toContain('**粗体**')
    expect(result.markdown).toContain('*斜体*')
    expect(result.markdown).toContain('==高亮==')
    expect(result.markdown).toContain('<u>下划线</u>')
    expect(result.markdown).toContain('#tag')
    expect(result.markdown).toContain('[[项目 A]]')
    expect(result.markdown).toContain('* 星号项目')
    expect(result.markdown).toContain('- [x] 已完成')
    expect(result.markdown).toContain('| :------ | ----: |')
    expect(result.markdown).toContain('![封面](cover.png) <!-- size:200pxx300px -->')
    expect(result.markdown).toContain('\\(a+b\\)')
    expect(result.markdown).toContain('$$\nE=mc^2\n$$')
    expect(result.markdown).toContain('引用[^说明]')
    expect(result.markdown).toContain('[^说明]: 脚注内容')
    expect(result.markdown).toContain('```ts')
    expect(result.metrics.fallbackBlocks).toBe(0)
  })

  it('reports ordered-list visual styles that Markdown cannot preserve', async () => {
    const editorRef = createRef<EditorHandle>()
    await act(async () => renderEditor(root, editorRef))
    const editor = editorRef.current?.getEditor()
    if (!editor) throw new Error('Editor was not initialized')

    const paragraph = editor.schema.nodes.paragraph.create(null, editor.schema.text('item'))
    const listItem = editor.schema.nodes.listItem.create(null, paragraph)
    const orderedList = editor.schema.nodes.orderedList.create(
      { start: 1, listStyle: 'lower-alpha' },
      listItem,
    )
    const documentNode = editor.schema.topNodeType.create(null, orderedList)
    const result = createProseMirrorMarkdownSerializer(editor.schema).serialize(documentNode, null)

    expect(result.markdown).toBe('1. item')
    expect(result.metrics.omittedNodeTypes).toContain('node:orderedList:listStyle:lower-alpha')
  })

  it('缓存未变化的顶层块，只重新序列化发生变化的块', async () => {
    const editorRef = createRef<EditorHandle>()
    await act(async () => renderEditor(root, editorRef))
    const editor = editorRef.current?.getEditor()
    if (!editor) throw new Error('Editor was not initialized')

    const serializer = createProseMirrorMarkdownSerializer(editor.schema)
    const first = serializer.serialize(editor.state.doc, null)
    const second = serializer.serialize(editor.state.doc, null)

    expect(first.metrics.cacheMisses).toBe(first.metrics.blockCount)
    expect(second.metrics.cacheHits).toBe(second.metrics.blockCount)
    expect(second.metrics.cacheMisses).toBe(0)

    await act(async () => { editor.commands.insertContent('改') })
    const changed = serializer.serialize(editor.state.doc, null)
    expect(changed.metrics.cacheHits).toBeGreaterThan(0)
    expect(changed.metrics.cacheMisses).toBeGreaterThan(0)
  })
})
