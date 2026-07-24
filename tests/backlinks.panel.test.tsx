import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BacklinksPanel } from '../src/components/BacklinksPanel'
import type { FileTreeNode } from '../src/types'

const fileTree: FileTreeNode[] = [
  { name: '首页.md', path: 'D:\\notes\\首页.md', type: 'file' },
  { name: '项目.md', path: 'D:\\notes\\项目.md', type: 'file' },
]

describe('反向链接面板', () => {
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('扫描链接来源、打开来源笔记并支持 Escape 关闭', async () => {
    const onOpenFile = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '返回 [[首页]]',
    })))

    await act(async () => {
      root.render(
        <BacklinksPanel
          currentFile={'D:\\notes\\首页.md'}
          fileTree={fileTree}
          onOpenFile={onOpenFile}
        />,
      )
    })

    await act(async () => {
      (container.querySelector('.backlinks-toggle') as HTMLButtonElement).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const item = container.querySelector('.backlink-item') as HTMLButtonElement
    expect(item.textContent).toContain('项目')
    expect(item.textContent).toContain('返回 [[首页]]')

    await act(async () => item.click())
    expect(onOpenFile).toHaveBeenCalledWith('D:\\notes\\项目.md')

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(container.querySelector('.backlinks-panel')).toBeNull()
  })

  it('优先使用已打开标签中的未保存内容', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '磁盘内容尚未包含双向链接',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const cachedFiles = new Map([
      ['tab-project', { path: 'D:\\notes\\项目.md', content: '未保存引用 [[首页]]' }],
    ])

    await act(async () => {
      root.render(
        <BacklinksPanel
          currentFile={'D:\\notes\\首页.md'}
          fileTree={fileTree}
          cachedFiles={cachedFiles}
          onOpenFile={() => {}}
        />,
      )
    })

    await act(async () => {
      (container.querySelector('.backlinks-toggle') as HTMLButtonElement).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('.backlink-item')?.textContent).toContain('未保存引用 [[首页]]')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
