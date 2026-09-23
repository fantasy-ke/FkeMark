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

  it('文件页内搜索，页签只保留文件和大纲', () => {
    renderSidebar()
    expect(container.querySelector('.sidebar-header-title')?.textContent).toBe('notes')
    expect(tab('文件')?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('.sidebar-search-input')).not.toBeNull()
    expect(container.querySelector('.file-tree')).not.toBeNull()
    expect(tab('搜索')).toBeUndefined()
    expect(tab('反向链接')).toBeUndefined()
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

  it('未打开文件夹时文件页列出最近文件夹，历史和反向链接是独立视图', () => {
    const history = [{ name: '旧目录', path: 'D:/old', openedAt: Date.now() }]
    renderSidebar({ folderHistory: history, folderPath: null, fileTree: [] })
    expect(tab('历史')).toBeUndefined()
    expect(tab('反向链接')).toBeUndefined()
    expect(container.querySelector('.sidebar-tabs')).not.toBeNull()
    expect(container.textContent).toContain('最近打开的文件夹')
    expect(container.textContent).toContain('旧目录')

    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="历史"]')!.click()
    })
    expect(container.querySelector('.sidebar-tabs')).toBeNull()
    expect(container.querySelector('.sidebar-history-window')).toBeNull()
    expect(container.textContent).toContain('最近打开')
    expect(container.textContent).toContain('旧目录')

    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="反向链接"]')!.click()
    })
    expect(container.querySelector('.sidebar-tabs')).toBeNull()
    expect(container.querySelector('.backlinks-embedded')).not.toBeNull()
    expect(container.textContent).toContain('请先打开一篇 Markdown 笔记。')

    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="文件"]')!.click()
    })
    expect(container.querySelector('.sidebar-tabs')).not.toBeNull()
    expect(tab('反向链接')).toBeUndefined()
    expect(container.textContent).toContain('旧目录')
  })

  it('已打开目录时文件页隐藏最近文件夹，历史页仍列出文件夹和文件历史', () => {
    const onReopenFolder = vi.fn()
    const onOpenFile = vi.fn()
    renderSidebar({
      folderHistory: [{ name: '旧目录', path: 'D:/old', openedAt: Date.now() }],
      recentFiles: [{ name: '旧笔记.md', path: 'D:/old/旧笔记.md', isFile: true, isDir: false, size: 1, modified: Date.now() }],
      onReopenFolder,
      onOpenFile,
    })
    expect(container.textContent).not.toContain('旧目录')
    expect(container.textContent).not.toContain('最近文件')

    act(() => {
      container.querySelector<HTMLButtonElement>('.sidebar-rail-btn[aria-label="历史"]')!.click()
    })
    expect(container.textContent).toContain('最近打开')
    expect(container.textContent).toContain('旧目录')
    expect(container.textContent).toContain('最近文件')
    expect(container.textContent).toContain('旧笔记.md')
    const item = Array.from(container.querySelectorAll<HTMLElement>('.folder-item'))
      .find((node) => node.textContent?.includes('旧目录'))!
    act(() => item.click())
    expect(onReopenFolder).toHaveBeenCalledWith('D:/old')
    const file = Array.from(container.querySelectorAll<HTMLElement>('.file-item'))
      .find((node) => node.textContent === '旧笔记.md')!
    act(() => file.click())
    expect(onOpenFile).toHaveBeenCalledWith('D:/old/旧笔记.md')
  })

  it('已打开文件夹时文件页不列出最近文件夹', () => {
    renderSidebar({ folderHistory: [{ name: '旧目录', path: 'D:/old', openedAt: Date.now() }] })
    expect(container.querySelector('.file-tree')).not.toBeNull()
    expect(container.textContent).not.toContain('旧目录')
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
