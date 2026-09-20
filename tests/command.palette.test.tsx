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
})
