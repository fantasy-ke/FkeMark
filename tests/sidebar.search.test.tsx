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

/** 两条正文命中位于子目录，一条文件名命中位于根目录 */
const resultData: SearchResultData = {
  matches: [
    {
      filePath: 'D:/notes/guide/intro.md',
      fileName: 'intro.md',
      lineNumber: 3,
      column: 1,
      lineText: '目标文本在这里',
      matchStart: 0,
      matchEnd: 2,
      isFileNameMatch: false,
    },
    {
      filePath: 'D:/notes/guide/intro.md',
      fileName: 'intro.md',
      lineNumber: 9,
      column: 1,
      lineText: '第二处目标',
      matchStart: 3,
      matchEnd: 5,
      isFileNameMatch: false,
    },
    {
      filePath: 'D:/notes/目标笔记.md',
      fileName: '目标笔记.md',
      lineNumber: 0,
      column: 0,
      lineText: '',
      matchStart: 0,
      matchEnd: 0,
      isFileNameMatch: true,
    },
  ],
  totalFilesSearched: 3,
  totalMatches: 3,
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

  function fileNodes() {
    return Array.from(container.querySelectorAll('.sidebar-search-node.is-file')) as HTMLElement[]
  }

  function folderNodes() {
    return Array.from(container.querySelectorAll('.sidebar-search-node.is-folder')) as HTMLElement[]
  }

  function hits() {
    return Array.from(container.querySelectorAll('.sidebar-search-hit')) as HTMLElement[]
  }

  function nodeName(node: HTMLElement) {
    return node.querySelector('.sidebar-search-node-name')?.textContent ?? ''
  }

  function chevronOf(node: HTMLElement) {
    return node.querySelector('.sidebar-search-chevron') as HTMLElement
  }

  async function click(element: HTMLElement) {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    expect(container.querySelector('.sidebar-search-summary')?.textContent)
      .toBe('在 2 个文件中找到 3 个匹配')
    expect(hits()).toHaveLength(2)
    expect(hits()[0].querySelector('.sidebar-search-line')?.textContent).toBe('3')
    expect(hits()[0].querySelector('.sidebar-search-text .highlight')?.textContent).toBe('目标')
  })

  it('默认以树形结构按目录分组', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()
    await typeQuery('目标')

    const folders = folderNodes()
    expect(folders).toHaveLength(1)
    expect(nodeName(folders[0])).toBe('guide')

    const files = fileNodes()
    expect(files.map(nodeName)).toEqual(['intro.md', '目标笔记.md'])
    // 目录内的文件缩进比目录更深
    expect(parseInt(fileNodes()[0].style.paddingLeft, 10))
      .toBeGreaterThan(parseInt(folders[0].style.paddingLeft, 10))
  })

  it('可以切换到列表结构，去掉目录层级', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()
    await typeQuery('目标')

    const viewButtons = Array.from(container.querySelectorAll('.sidebar-search-view')) as HTMLElement[]
    await click(viewButtons[1])

    expect(folderNodes()).toHaveLength(0)
    expect(fileNodes().map(nodeName)).toEqual(['intro.md', '目标笔记.md'])
    expect(hits()).toHaveLength(2)
    // 列表结构下所有文件节点同层
    expect(fileNodes()[0].style.paddingLeft).toBe(fileNodes()[1].style.paddingLeft)
  })

  it('文件名命中由节点名高亮表达，不重复占用命中行', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()
    await typeQuery('目标')

    const nameMatch = container.querySelector('.sidebar-search-node-name .highlight')
    expect(nameMatch?.textContent).toBe('目标笔记.md')
    // 该文件只有文件名命中，因此没有子命中行也没有折叠箭头
    const fileOnlyNameMatch = fileNodes().find((node) => nodeName(node) === '目标笔记.md')!
    expect(chevronOf(fileOnlyNameMatch).querySelector('svg')).toBeNull()
  })

  it('可以折叠单个文件', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()
    await typeQuery('目标')

    const intro = fileNodes().find((node) => nodeName(node) === 'intro.md')!
    expect(hits()).toHaveLength(2)

    await click(chevronOf(intro))
    expect(hits()).toHaveLength(0)

    await click(chevronOf(intro))
    expect(hits()).toHaveLength(2)
  })

  it('可以全部折叠与全部展开', async () => {
    invokeMock.mockResolvedValue(resultData)
    renderPanel()
    await typeQuery('目标')

    const collapseAll = container.querySelector('.sidebar-search-collapse-all') as HTMLElement
    expect(hits()).toHaveLength(2)

    await click(collapseAll)
    expect(hits()).toHaveLength(0)
    // 目录节点本身仍在，只是内部的文件被收起；无子内容的文件节点保持可见
    expect(folderNodes()).toHaveLength(1)
    expect(fileNodes().map(nodeName)).toEqual(['目标笔记.md'])

    await click(collapseAll)
    expect(hits()).toHaveLength(2)
    expect(fileNodes().map(nodeName)).toEqual(['intro.md', '目标笔记.md'])
  })

  it('点击命中行时回调该匹配项', async () => {
    invokeMock.mockResolvedValue(resultData)
    const onOpenResult = vi.fn()
    renderPanel({ onOpenResult })
    await typeQuery('目标')

    await click(hits()[0])

    expect(onOpenResult).toHaveBeenCalledTimes(1)
    expect(onOpenResult).toHaveBeenCalledWith(resultData.matches[0])
  })

  it('点击文件节点时打开该文件的第一条正文命中', async () => {
    invokeMock.mockResolvedValue(resultData)
    const onOpenResult = vi.fn()
    renderPanel({ onOpenResult })
    await typeQuery('目标')

    const intro = fileNodes().find((node) => nodeName(node) === 'intro.md')!
    await click(intro.querySelector('.sidebar-search-node-name') as HTMLElement)

    expect(onOpenResult).toHaveBeenCalledWith(resultData.matches[0])
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

  it('文件页筛选文件名，搜索页复用全文搜索', async () => {
    invokeMock.mockResolvedValue(resultData)
    const onSearchResultOpen = vi.fn()
    const fileTree: FileTreeNode[] = [
      { name: 'guide', path: 'D:/notes/guide', type: 'folder', children: [
        { name: 'intro.md', path: 'D:/notes/guide/intro.md', type: 'file' },
      ] },
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

    // 文件页只筛选文件名，全文搜索在「搜索」页签
    expect(container.querySelector('.sidebar-filter-input')).not.toBeNull()
    expect(container.querySelector('.file-tree')).not.toBeNull()
    const searchTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '搜索')
    expect(searchTab).toBeTruthy()
    await act(async () => searchTab!.click())

    const searchInput = container.querySelector('.sidebar-search-input') as HTMLInputElement
    expect(searchInput).not.toBeNull()
    expect(searchInput.disabled).toBe(false)

    await typeQuery('目标')

    expect(hits()).toHaveLength(2)
    await click(hits()[0])
    expect(onSearchResultOpen).toHaveBeenCalledWith(resultData.matches[0])

    localStorage.removeItem('fkemark:sidebarTab')
  })
})
