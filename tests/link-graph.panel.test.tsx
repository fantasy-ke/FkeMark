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

  it('没有打开的 Markdown 文档时不显示图谱入口', async () => {
    const cases: Array<string | null> = [null, 'D:\\notes\\说明.txt']

    for (const currentFile of cases) {
      await act(async () => {
        root.render(
          <LinkGraphPanel currentFile={currentFile} fileTree={fileTree} onOpenFile={() => {}} />,
        )
      })

      expect(container.querySelector('.link-graph-toggle')).toBeNull()
      expect(container.querySelector('.link-graph-panel')).toBeNull()
    }
  })

  it('从 Markdown 文档切换到其他文档时会关闭已打开的图谱', async () => {
    await renderPanel()
    expect(container.querySelector('.link-graph-panel')).not.toBeNull()

    await act(async () => {
      root.render(
        <LinkGraphPanel currentFile={'D:\\notes\\说明.txt'} fileTree={fileTree} onOpenFile={() => {}} />,
      )
    })

    expect(container.querySelector('.link-graph-panel')).toBeNull()
    expect(container.querySelector('.link-graph-toggle')).toBeNull()
  })

  it('渲染节点与边、统计双链数量并支持点击打开笔记', async () => {
    const onOpenFile = await renderPanel()

    const nodes = container.querySelectorAll('.link-graph-node')
    // 孤立笔记始终参与渲染，头部只保留刷新与关闭，不再有过滤勾选框。
    expect(nodes).toHaveLength(3)
    expect(container.querySelector('.link-graph-actions input')).toBeNull()
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

  it('在 Escape 时关闭面板', async () => {
    await renderPanel()

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(container.querySelector('.link-graph-panel')).toBeNull()
    expect(container.querySelector('.link-graph-toggle')).not.toBeNull()
  })

  it('拖动节点时圆点跟随指针，相邻圆点被弹性带动', async () => {
    await renderPanel()
    const svg = container.querySelector('.link-graph-canvas') as SVGSVGElement
    // jsdom 没有 SVG 坐标换算 API，这里按 1:1 补齐，让指针坐标直接当作画布坐标。
    svg.getScreenCTM = () => ({ inverse: () => ({}) }) as unknown as DOMMatrix
    svg.createSVGPoint = () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) }
      return point as unknown as DOMPoint
    }

    const nodes = Array.from(container.querySelectorAll<SVGGElement>('.link-graph-node'))
    const projectNode = nodes.find((node) => node.textContent?.includes('项目'))!
    const homeNode = nodes.find((node) => node.textContent?.includes('首页'))!
    const homeBefore = homeNode.getAttribute('transform')

    const pointer = (type: string, clientX: number, clientY: number) => new MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0, clientX, clientY,
    })
    await act(async () => {
      projectNode.dispatchEvent(pointer('pointerdown', 120, 120))
      projectNode.dispatchEvent(pointer('pointermove', 200, 220))
      await new Promise((resolve) => setTimeout(resolve, 60))
    })

    expect(projectNode.getAttribute('transform')).toBe('translate(200.00 220.00)')
    expect(homeNode.getAttribute('transform')).not.toBe(homeBefore)

    await act(async () => {
      projectNode.dispatchEvent(pointer('pointerup', 200, 220))
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    // 松手后节点带着惯性离开指针位置，重新回到云团里。
    expect(projectNode.getAttribute('transform')).not.toBe('translate(200.00 220.00)')
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
