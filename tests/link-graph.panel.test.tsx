import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkGraphPanel } from '../src/components/LinkGraphPanel'
import type { FileTreeNode } from '../src/types'

const fileTree: FileTreeNode[] = [
  { name: '首页.md', path: 'D:\\notes\\首页.md', type: 'file' },
  { name: '项目.md', path: 'D:\\notes\\项目.md', type: 'file' },
  { name: '孤立.md', path: 'D:\\notes\\孤立.md', type: 'file' },
]

const contents: Record<string, string> = {
  'D:\\notes\\首页.md': '入口，指向 [[项目]]',
  'D:\\notes\\项目.md': '项目说明，返回 [[首页]]',
  'D:\\notes\\孤立.md': '没有任何双链',
}

describe('双链图谱面板', () => {
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

  async function renderPanel(onOpenFile = vi.fn()) {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => contents[decodeURIComponent(String(input).split('path=')[1])] ?? '',
    })))

    await act(async () => {
      root.render(
        <LinkGraphPanel
          currentFile={'D:\\notes\\首页.md'}
          fileTree={fileTree}
          onOpenFile={onOpenFile}
        />,
      )
    })

    await act(async () => {
      (container.querySelector('.link-graph-toggle') as HTMLButtonElement).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    return onOpenFile
  }

  it('渲染节点与边、统计双链数量并支持点击打开笔记', async () => {
    const onOpenFile = await renderPanel()

    const nodes = container.querySelectorAll('.link-graph-node')
    expect(nodes).toHaveLength(3)
    expect(container.querySelectorAll('.link-graph-edge')).toHaveLength(2)
    expect(container.querySelector('.link-graph-stats')?.textContent).toBe('3 篇笔记 · 2 条双链')
    expect(container.querySelector('.link-graph-node.is-current title')?.textContent).toBe('1 条链接 · 1 条反向链接')

    const projectNode = Array.from(nodes).find((node) => node.textContent?.includes('项目'))
    expect(projectNode).toBeTruthy()

    await act(async () => {
      projectNode!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenFile).toHaveBeenCalledWith('D:\\notes\\项目.md')
  })

  it('可以隐藏孤立笔记并在 Escape 时关闭面板', async () => {
    await renderPanel()

    const orphanToggle = container.querySelector('.link-graph-orphans input') as HTMLInputElement
    expect(orphanToggle.checked).toBe(true)

    await act(async () => {
      orphanToggle.click()
    })
    expect(container.querySelectorAll('.link-graph-node')).toHaveLength(2)

    await act(async () => {
      orphanToggle.click()
    })
    expect(container.querySelectorAll('.link-graph-node')).toHaveLength(3)

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(container.querySelector('.link-graph-panel')).toBeNull()
    expect(container.querySelector('.link-graph-toggle')).not.toBeNull()
  })

  it('优先使用已打开标签中的未保存内容，避免重复读取磁盘', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '磁盘内容没有双链',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const cachedFiles = new Map([
      ['tab-home', { path: 'D:\\notes\\首页.md', content: '未保存内容 [[项目]]' }],
      ['tab-project', { path: 'D:\\notes\\项目.md', content: '未保存内容 [[首页]]' }],
      ['tab-orphan', { path: 'D:\\notes\\孤立.md', content: '孤立' }],
    ])

    await act(async () => {
      root.render(
        <LinkGraphPanel
          currentFile={'D:\\notes\\首页.md'}
          fileTree={fileTree}
          cachedFiles={cachedFiles}
          onOpenFile={() => {}}
        />,
      )
    })
    await act(async () => {
      (container.querySelector('.link-graph-toggle') as HTMLButtonElement).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelectorAll('.link-graph-edge')).toHaveLength(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
