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
      { name: 'intro.md', path: 'D:/notes/docs/intro.md', type: 'file' },
    ],
  },
]

describe('sidebar file tree context menu', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    localStorage.setItem('fkemark:sidebarTab', JSON.stringify('files'))
    localStorage.setItem('fkemark:expandedFolders', JSON.stringify(['__root__', 'D:/notes/docs']))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.removeItem('fkemark:sidebarTab')
    localStorage.removeItem('fkemark:expandedFolders')
    document.body.querySelectorAll('.sidebar-context-menu').forEach((node) => node.remove())
    vi.restoreAllMocks()
  })

  function renderSidebar(callbacks: Partial<Parameters<typeof Sidebar>[0]> = {}) {
    act(() => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <Sidebar
          onOpenFile={() => {}}
          recentFiles={[]}
          currentFile={null}
          tocItems={[]}
          fileTree={fileTree}
          {...callbacks}
        />
      </I18nProvider>,
    ))
  }

  function openMenu(item: HTMLElement) {
    act(() => item.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 80,
    })))
  }

  it('dispatches folder actions with folder target type', () => {
    const onCopyPath = vi.fn()
    renderSidebar({ onCopyPath })

    const folder = Array.from(container.querySelectorAll<HTMLElement>('.folder-item'))
      .find((item) => item.textContent?.includes('docs'))!
    openMenu(folder)

    const copyPathItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.sidebar-ctx-item'))
      .find((item) => item.textContent?.includes('Copy Path'))!
    act(() => copyPathItem.click())

    expect(onCopyPath).toHaveBeenCalledWith('D:/notes/docs', 'folder')
    expect(document.body.querySelector('.sidebar-context-menu')).toBeNull()
  })

  it('dispatches file actions with file target type', () => {
    const onDeleteFile = vi.fn()
    renderSidebar({ onDeleteFile })

    const file = Array.from(container.querySelectorAll<HTMLElement>('.file-item'))
      .find((item) => item.textContent?.includes('intro.md'))!
    openMenu(file)

    const deleteItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.sidebar-ctx-item'))
      .find((item) => item.textContent?.includes('Delete'))!
    act(() => deleteItem.click())

    expect(onDeleteFile).toHaveBeenCalledWith('D:/notes/docs/intro.md', 'file')
    expect(document.body.querySelector('.sidebar-context-menu')).toBeNull()
  })
})
