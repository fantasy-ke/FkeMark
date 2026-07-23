import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor, type EditorHandle } from '../src/components/Editor'
import { SlashMenu } from '../src/components/SlashMenu'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { FileTreeNode } from '../src/types'

const home = '\u9996\u9875'
const projectA = '\u9879\u76ee A'
const archive = '\u5f52\u6863'
const projectB = '\u9879\u76ee B'
const fileTree: FileTreeNode[] = [
  { name: `${home}.md`, path: `D:\\notes\\${home}.md`, type: 'file' },
  { name: `${projectA}.md`, path: `D:\\notes\\${projectA}.md`, type: 'file' },
  {
    name: archive,
    path: `D:\\notes\\${archive}`,
    type: 'folder',
    children: [{ name: `${projectB}.md`, path: `D:\\notes\\${archive}\\${projectB}.md`, type: 'file' }],
  },
]

describe('wiki link document picker', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('adds a localized wiki link slash command', async () => {
    await act(async () => {
      root.render(<SlashMenu query="wiki" x={20} y={20} onSelect={() => {}} onClose={() => {}} />)
    })

    expect(container.querySelector('[data-cmd="wikilink"]')).not.toBeNull()
  })

  it('opens after typing the wiki-link syntax and a space in source mode', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <Editor
          content=""
          onChange={onChange}
          settings={{ ...DEFAULT_SETTINGS, autoSave: false }}
          editorMode="source"
          onEditorModeChange={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
          filePath={`D:\\notes\\${home}.md`}
          fileTree={fileTree}
        />,
      )
    })

    const textarea = container.querySelector('.source-textarea') as HTMLTextAreaElement
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      valueSetter?.call(textarea, '[[ ')
      textarea.setSelectionRange(3, 3)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })

    expect(onChange).toHaveBeenCalledWith('[[ ')
    expect(container.querySelector('.wiki-link-picker')).not.toBeNull()
    expect(container.querySelector(`[data-wiki-target="${projectA}"]`)).not.toBeNull()
  })

  it('opens after typing the wiki-link syntax in live mode', async () => {
    const editorRef = createRef<EditorHandle>()
    await act(async () => {
      root.render(
        <Editor
          ref={editorRef}
          content=""
          onChange={() => {}}
          settings={{ ...DEFAULT_SETTINGS, autoSave: false }}
          editorMode="live"
          onEditorModeChange={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
          filePath={`D:\\notes\\${home}.md`}
          fileTree={fileTree}
        />,
      )
    })

    const tiptap = editorRef.current?.getEditor()
    expect(tiptap).not.toBeNull()
    tiptap!.view.coordsAtPos = vi.fn(() => ({ left: 20, right: 20, top: 20, bottom: 40 }))

    await act(async () => {
      tiptap!.chain().focus().insertContent('[[ ').run()
      await Promise.resolve()
    })

    expect(container.querySelector('.wiki-link-picker')).not.toBeNull()
    expect(container.querySelector(`[data-wiki-target="${projectA}"]`)).not.toBeNull()
  })

  it('opens from the toolbar, excludes the current note, and inserts the selected note', async () => {
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <Editor
          ref={editorRef}
          content=""
          onChange={onChange}
          settings={{ ...DEFAULT_SETTINGS, autoSave: false }}
          editorMode="live"
          onEditorModeChange={() => {}}
          onSlashCommand={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
          filePath={`D:\\notes\\${home}.md`}
          fileTree={fileTree}
        />,
      )
    })

    const tiptap = editorRef.current?.getEditor()
    expect(tiptap).not.toBeNull()
    tiptap!.view.coordsAtPos = vi.fn(() => ({ left: 20, right: 20, top: 20, bottom: 40 }))

    const button = container.querySelector('[data-toolbar-button="wikilink"]') as HTMLButtonElement
    expect(button).not.toBeNull()
    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(container.querySelector('.wiki-link-picker')).not.toBeNull()
    expect(container.querySelector(`[data-wiki-target="${home}"]`)).toBeNull()

    const option = container.querySelector(`[data-wiki-target="${projectA}"]`) as HTMLButtonElement
    expect(option).not.toBeNull()
    await act(async () => {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(onChange.mock.calls.some(([value]) => String(value).includes(`[[${projectA}]]`))).toBe(true)
    expect(container.querySelector('.wiki-link-picker')).toBeNull()
    expect(editorRef.current?.getContent()).toContain(`[[${projectA}]]`)
  })
})
