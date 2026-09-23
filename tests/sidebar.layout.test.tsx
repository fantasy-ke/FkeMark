import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { Sidebar } from '../src/components/Sidebar'
import type { FileTreeNode } from '../src/types'

const fileTree: FileTreeNode[] = [
  {
    name: 'docs',
    path: 'D:/notes/docs',
    type: 'folder',
    children: [
      { name: 'zeta.md', path: 'D:/notes/docs/zeta.md', type: 'file' },
      { name: 'alpha.md', path: 'D:/notes/docs/alpha.md', type: 'file' },
    ],
  },
]

describe('sidebar layout', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    localStorage.setItem('fkemark:sidebarTab', JSON.stringify('files'))
    localStorage.setItem('fkemark:expandedFolders', JSON.stringify(['D:/notes/docs']))
    localStorage.setItem('fkemark:sidebarSort', JSON.stringify('source'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.removeItem('fkemark:sidebarTab')
    localStorage.removeItem('fkemark:expandedFolders')
    localStorage.removeItem('fkemark:sidebarSort')
  })

  function renderSidebar(extra: Partial<Parameters<typeof Sidebar>[0]> = {}) {
    act(() => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <Sidebar
          onOpenFile={() => {}}
          recentFiles={[]}
          currentFile={null}
          tocItems={[{ level: 2, text: '章节', index: 0 }]}
          fileTree={fileTree}
          folderPath="D:/notes"
          {...extra}
        />
      </I18nProvider>,
    ))
  }

  function tab(label: string) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent === label)
  }

  it('文件页内搜索，页签只保留文件、大纲和反向链接', () => {
    renderSidebar()
    expect(container.querySelector('.sidebar-header-title')?.textContent).toBe('notes')
    expect(tab('文件')?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('.sidebar-search-input')).not.toBeNull()
    expect(container.querySelector('.file-tree')).not.toBeNull()
    expect(tab('搜索')).toBeUndefined()
    expect(container.querySelector('.sidebar-rail-btn[aria-label="搜索"]')).toBeNull()

    act(() => tab('大纲')!.click())
    expect(container.textContent).toContain('章节')
    expect(container.querySelector('.file-tree')).toBeNull()
  })

  it('折叠全部并按名称排序文件树', () => {
    renderSidebar()
    expect(container.textContent).toContain('zeta.md')

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="全部折叠"]')!.click()
    })
    expect(container.textContent).not.toContain('zeta.md')

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="全部展开"]')!.click()
    })
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="按名称排序"]')!.click()
    })
    const names = Array.from(container.querySelectorAll('.file-item .file-name')).map((node) => node.textContent)
    expect(names).toEqual(['docs', 'alpha.md', 'zeta.md'])
  })

  it('历史按钮切换现有侧栏，文件页不列出最近文件夹', () => {
    const history = [{ name: '旧目录', path: 'D:/old', openedAt: Date.now() }]
    renderSidebar({ folderHistory: history, folderPath: null, fileTree: [] })
    expect(tab('历史')).toBeUndefined()
    expect(container.querySelector('.sidebar-history-window')).toBeNull()
    expect(container.textContent).not.toContain('旧目录')
    expect(container.textContent).toContain('暂无打开的文件')

    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="历史"]')!.click()
    })
    expect(tab('历史')).toBeUndefined()
    expect(container.querySelector('.sidebar-tabs')).toBeNull()
    expect(container.querySelector('.sidebar-history-window')).toBeNull()
    expect(container.textContent).toContain('最近打开')
    expect(container.textContent).toContain('旧目录')

    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="文件"]')!.click()
    })
    expect(container.textContent).not.toContain('旧目录')
    expect(container.querySelector('.sidebar-tabs')).not.toBeNull()
  })

  it('活动栏打开系统终端而不是页签', () => {
    const onOpenTerminal = vi.fn()
    renderSidebar({ onOpenTerminal })
    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="终端"]')!.click()
    })
    expect(onOpenTerminal).toHaveBeenCalledOnce()
    expect(container.querySelector('.app-console')).toBeNull()
  })

  it('活动栏可以打开图谱和设置', () => {
    const onOpenGraph = vi.fn()
    const onOpenSettings = vi.fn()
    renderSidebar({ onOpenGraph, onOpenSettings })
    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="打开双链图谱"]')!.click()
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="设置"]')!.click()
    })
    expect(onOpenGraph).toHaveBeenCalledOnce()
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
