import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnippetsMenu } from '../src/components/editor/SnippetsMenu'
import {
  CUSTOM_SNIPPETS_STORAGE_KEY,
  expandSnippetVariables,
  loadCustomSnippets,
} from '../src/utils/snippets'

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function createEditorMock() {
  const run = vi.fn()
  const insertContent = vi.fn(() => ({ run }))
  const focus = vi.fn(() => ({ insertContent }))
  const chain = vi.fn(() => ({ focus }))
  return {
    editor: { chain } as unknown as TiptapEditor,
    insertContent,
    run,
  }
}

describe('片段与模板', () => {
  it('按语言替换日期和时间变量', () => {
    const now = new Date(2026, 6, 23, 15, 30)
    const zh = expandSnippetVariables('{{date}} {{time}}', 'zh-CN', now)
    const en = expandSnippetVariables('{{date}} {{time}}', 'en', now)

    expect(zh).toContain('2026年7月23日')
    expect(zh).not.toContain('{{date}}')
    expect(en).toContain('July 23, 2026')
    expect(en).not.toContain('{{time}}')
  })

  it('忽略损坏和不完整的本地片段数据', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify([
        { id: 'valid', name: '周报', content: '# 周报' },
        { id: 'empty', name: '', content: '# 无效' },
        { id: 1, name: '无效', content: '# 无效' },
      ])),
      setItem: vi.fn(),
    } as unknown as Storage

    expect(loadCustomSnippets(storage)).toEqual([{ id: 'valid', name: '周报', content: '# 周报' }])
  })

  describe('工具栏菜单', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      localStorage.clear()
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
    })

    afterEach(async () => {
      await act(async () => root.unmount())
      container.remove()
      localStorage.clear()
      vi.restoreAllMocks()
    })

    it('一键插入内置模板并支持 Escape 关闭', async () => {
      const { editor, insertContent, run } = createEditorMock()
      await act(async () => root.render(<SnippetsMenu editor={editor} />))

      await act(async () => (container.querySelector('.snippets-trigger') as HTMLButtonElement).click())
      const diary = container.querySelector('.snippet-item') as HTMLButtonElement
      await act(async () => diary.click())

      expect(insertContent).toHaveBeenCalledTimes(1)
      expect(insertContent.mock.calls[0][0]).toContain('<h1')
      expect(insertContent.mock.calls[0][0]).not.toContain('{{date}}')
      expect(run).toHaveBeenCalledTimes(1)
      expect(container.querySelector('.snippets-popover')).toBeNull()

      await act(async () => (container.querySelector('.snippets-trigger') as HTMLButtonElement).click())
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      expect(container.querySelector('.snippets-popover')).toBeNull()
    })

    it('新增、编辑、插入并删除自定义片段', async () => {
      const { editor, insertContent } = createEditorMock()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      await act(async () => root.render(<SnippetsMenu editor={editor} />))

      await act(async () => (container.querySelector('.snippets-trigger') as HTMLButtonElement).click())
      await act(async () => (container.querySelector('.snippet-add-button') as HTMLButtonElement).click())

      const name = document.querySelector('.snippet-dialog input') as HTMLInputElement
      const content = document.querySelector('.snippet-dialog textarea') as HTMLTextAreaElement
      await act(async () => {
        setFieldValue(name, '项目周报')
        setFieldValue(content, '## {{date}}\n\n- 完成事项')
      })
      await act(async () => (document.querySelector('.snippet-dialog button[type="submit"]') as HTMLButtonElement).click())

      const stored = JSON.parse(localStorage.getItem(CUSTOM_SNIPPETS_STORAGE_KEY) || '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe('项目周报')

      await act(async () => (container.querySelector('.snippet-custom-actions button') as HTMLButtonElement).click())
      const editName = document.querySelector('.snippet-dialog input') as HTMLInputElement
      await act(async () => setFieldValue(editName, '项目双周报'))
      await act(async () => (document.querySelector('.snippet-dialog button[type="submit"]') as HTMLButtonElement).click())
      expect(container.querySelector('.snippet-custom-insert')?.textContent).toContain('项目双周报')

      await act(async () => (container.querySelector('.snippet-custom-insert') as HTMLButtonElement).click())
      expect(insertContent.mock.calls.at(-1)?.[0]).toContain('完成事项')
      expect(insertContent.mock.calls.at(-1)?.[0]).not.toContain('{{date}}')

      await act(async () => (container.querySelector('.snippets-trigger') as HTMLButtonElement).click())
      const deleteButton = container.querySelectorAll('.snippet-custom-actions button')[1] as HTMLButtonElement
      await act(async () => deleteButton.click())
      expect(window.confirm).toHaveBeenCalled()
      expect(localStorage.getItem(CUSTOM_SNIPPETS_STORAGE_KEY)).toBe('[]')
    })
  })
})