import { invoke } from '@tauri-apps/api/core'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { CommandPalette } from '../src/components/CommandPalette'
import type { PaletteTab } from '../src/components/CommandPalette'
import type { FileTreeNode } from '../src/types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const fileTree: FileTreeNode[] = [
  { name: 'intro.md', path: 'D:/notes/intro.md', type: 'file' },
]

describe('command palette initial tab', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // jsdom 未实现 scrollIntoView，面板滚动到选中项时会调用它
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderPalette(props: { visible: boolean; initialTab?: PaletteTab }) {
    act(() => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <CommandPalette
          visible={props.visible}
          initialTab={props.initialTab}
          onClose={() => {}}
          fileTree={fileTree}
          currentFile={null}
          recentFiles={[]}
          onOpenFile={() => {}}
          folderPath="D:/notes"
          commands={[]}
        />
      </I18nProvider>,
    ))
  }

  function tabs() {
    return Array.from(container.querySelectorAll('.cmd-tab')) as HTMLElement[]
  }

  function activeTabIndex() {
    return tabs().findIndex((tab) => tab.className.includes('active'))
  }

  it('打开时落在指定的初始标签页', () => {
    renderPalette({ visible: true, initialTab: 'files' })
    expect(activeTabIndex()).toBe(0)
  })

  it('重新打开时回到初始标签页而不是上次停留的标签页', async () => {
    renderPalette({ visible: true, initialTab: 'files' })
    // 手动切到搜索页
    await act(async () => {
      tabs()[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(activeTabIndex()).toBe(2)

    // 关闭再打开：Ctrl+P 固定进入文件页
    renderPalette({ visible: false, initialTab: 'files' })
    renderPalette({ visible: true, initialTab: 'files' })
    expect(activeTabIndex()).toBe(0)
  })

  it('初始标签页为搜索页时打开即选中搜索', () => {
    renderPalette({ visible: true, initialTab: 'search' })
    expect(activeTabIndex()).toBe(2)
  })

  it('不在关闭命令面板后发起延迟的全文搜索', () => {
    vi.useFakeTimers()
    vi.mocked(invoke).mockClear()
    const globals = window as Window & { __TAURI_INTERNALS__?: unknown }
    const previous = globals.__TAURI_INTERNALS__
    Object.defineProperty(globals, '__TAURI_INTERNALS__', { configurable: true, writable: true, value: {} })
    try {
      renderPalette({ visible: true, initialTab: 'search' })
      const input = container.querySelector<HTMLInputElement>('.cmd-palette-input')!
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'intro')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      renderPalette({ visible: false, initialTab: 'search' })
      act(() => vi.advanceTimersByTime(300))
      expect(vi.mocked(invoke).mock.calls.some(([command]) => command === 'search_in_files')).toBe(false)
    } finally {
      if (previous === undefined) delete globals.__TAURI_INTERNALS__
      else globals.__TAURI_INTERNALS__ = previous
      vi.useRealTimers()
    }
  })

  it('下一次搜索等待期间不显示或重新接收过期结果', async () => {
    vi.useFakeTimers()
    const globals = window as Window & { __TAURI_INTERNALS__?: unknown }
    const previous = globals.__TAURI_INTERNALS__
    globals.__TAURI_INTERNALS__ = {}
    const result = (fileName: string) => ({
      matches: [{ filePath: `D:/notes/${fileName}`, fileName, lineNumber: 0, column: 0,
        lineText: fileName, matchStart: 0, matchEnd: 1, isFileNameMatch: true }],
      totalFilesSearched: 1,
      totalMatches: 1,
    })
    let finishSecond!: (value: ReturnType<typeof result>) => void
    vi.mocked(invoke).mockResolvedValueOnce(result('old.md'))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve }))
      .mockResolvedValueOnce(result('current.md'))
    try {
      renderPalette({ visible: true, initialTab: 'search' })
      const input = container.querySelector<HTMLInputElement>('.cmd-palette-input')!
      const type = (value: string) => act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      type('old')
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(container.textContent).toContain('old.md')
      type('second')
      act(() => vi.advanceTimersByTime(300))
      type('current')
      expect(container.querySelector('.cmd-palette-item')).toBeNull()
      await act(async () => { finishSecond(result('second.md')) })
      expect(container.querySelector('.cmd-palette-item')).toBeNull()
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(container.textContent).toContain('current.md')
    } finally {
      if (previous === undefined) delete globals.__TAURI_INTERNALS__
      else globals.__TAURI_INTERNALS__ = previous
      vi.mocked(invoke).mockReset()
      vi.useRealTimers()
    }
  })
})
