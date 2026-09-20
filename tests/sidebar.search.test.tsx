import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { Sidebar } from '../src/components/Sidebar'
import { SidebarSearchPanel } from '../src/components/SidebarSearchPanel'
import type { SearchResultData } from '../src/components/CommandPalette'
import type { FileTreeNode } from '../src/types'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: isTauriMock }))

/** 防抖时长，与组件内 SEARCH_DEBOUNCE_MS 保持一致 */
const DEBOUNCE_MS = 300

const resultData: SearchResultData = {
  matches: [
    {
      filePath: 'D:/notes/a.md',
      fileName: 'a.md',
      lineNumber: 3,
      column: 1,
      lineText: '目标文本在这里',
      matchStart: 0,
      matchEnd: 2,
      isFileNameMatch: false,
    },
    {
      filePath: 'D:/notes/b.md',
      fileName: 'b.md',
      lineNumber: 0,
      column: 0,
      lineText: '',
      matchStart: 0,
      matchEnd: 0,
      isFileNameMatch: true,
    },
  ],
  totalFilesSearched: 2,
  totalMatches: 2,
}

function setFieldValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('sidebar text search panel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    isTauriMock.mockReturnValue(true)
    invokeMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function renderPanel(overrides: Partial<Parameters<typeof SidebarSearchPanel>[0]> = {}) {
    act(() => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <SidebarSearchPanel
          folderPath="D:/notes"
          onOpenResult={() => {}}
          {...overrides}
        >
          <div data-testid="tree">文件树内容</div>
        </SidebarSearchPanel>
      </I18nProvider>,
    ))
  }

  function input() {
    return container.querySelector('.sidebar-search-input') as HTMLInputElement
  }

  /** 输入关键词并推进防抖计时 */
  async function typeQuery(value: string) {
    await act(async () => setFieldValue(input(), value))
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
  }

  it('没有搜索词时展示文件树', () => {
    renderPanel()
    expect(container.querySelector('[data-testid="tree"]')).not.toBeNull()
    expect(container.querySelector('.sidebar-search-results')).toBeNull()
  })

  it('输入关键词后按防抖调用全文搜索并展示分组结果', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()

    await act(async () => setFieldValue(input(), '目标'))
    // 防抖未到期时不应发起请求
    expect(invokeMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('search_in_files', {
      dirPath: 'D:/notes',
      query: '目标',
      caseSensitive: false,
      useRegex: false,
      wholeWord: false,
    })
    // 有搜索词时用结果替换文件树
    expect(container.querySelector('[data-testid="tree"]')).toBeNull()
    expect(container.querySelector('.sidebar-search-file')?.textContent).toBe('a.md')
    expect(container.querySelector('.sidebar-search-line')?.textContent).toBe('3')
    expect(container.querySelector('.sidebar-search-text .highlight')?.textContent).toBe('目标')
    expect(container.querySelector('.sidebar-search-summary')?.textContent).toContain('2')
  })

  it('连续输入只在停顿后发起一次搜索', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()

    await act(async () => setFieldValue(input(), '目'))
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    await act(async () => setFieldValue(input(), '目标'))
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock.mock.calls[0][1]).toMatchObject({ query: '目标' })
  })

  it('点击结果时回调命中的匹配项', async () => {
    invokeMock.mockResolvedValue(resultData)
    const onOpenResult = vi.fn()
    renderPanel({ onOpenResult })

    await typeQuery('目标')

    const hit = container.querySelector('.sidebar-search-hit') as HTMLElement
    await act(async () => {
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenResult).toHaveBeenCalledTimes(1)
    expect(onOpenResult).toHaveBeenCalledWith(resultData.matches[0])
  })

  it('搜索失败时提示重试而不是展示空结果', async () => {
    invokeMock.mockRejectedValue(new Error('搜索失败'))
    renderPanel()

    await typeQuery('目标')

    expect(container.querySelector('.sidebar-search-summary')).toBeNull()
    expect(container.querySelector('.toc-empty')?.textContent).toContain('搜索失败')
  })

  it('未打开文件夹时禁用输入框', () => {
    renderPanel({ folderPath: null })
    expect(input().disabled).toBe(true)
  })

  it('非 Tauri 环境下不发起搜索', async () => {
    isTauriMock.mockReturnValue(false)
    renderPanel()

    await typeQuery('目标')

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('侧边栏文件树顶部展示搜索框并复用同一套搜索', async () => {
    invokeMock.mockResolvedValue(resultData)
    const onSearchResultOpen = vi.fn()
    const fileTree: FileTreeNode[] = [
      { name: 'a.md', path: 'D:/notes/a.md', type: 'file' },
    ]
    localStorage.setItem('fkemark:sidebarTab', JSON.stringify('files'))

    act(() => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <Sidebar
          onOpenFile={() => {}}
          recentFiles={[]}
          currentFile={null}
          tocItems={[]}
          fileTree={fileTree}
          folderPath="D:/notes"
          onSearchResultOpen={onSearchResultOpen}
        />
      </I18nProvider>,
    ))

    const searchInput = container.querySelector('.sidebar-search-input') as HTMLInputElement
    expect(searchInput).not.toBeNull()
    expect(searchInput.disabled).toBe(false)
    // 没有搜索词时仍然展示文件树
    expect(container.querySelector('.file-tree')).not.toBeNull()

    await act(async () => setFieldValue(searchInput, '目标'))
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    const hit = container.querySelector('.sidebar-search-hit') as HTMLElement
    expect(hit).not.toBeNull()
    await act(async () => {
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSearchResultOpen).toHaveBeenCalledWith(resultData.matches[0])

    localStorage.removeItem('fkemark:sidebarTab')
  })
})
