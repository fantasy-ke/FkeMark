import { describe, expect, it } from 'vitest'
import { buildWikiLinkGraph } from '../src/utils/markdown/linkGraph'
import {
  createLinkGraphSimulation,
  type LinkGraphSimulation,
} from '../src/utils/markdown/linkGraphSimulation'

const files = [
  { path: 'D:\\notes\\首页.md', content: '入口，指向 [[项目]] 和 [[归档]]' },
  { path: 'D:\\notes\\项目.md', content: '项目说明，返回 [[首页]]' },
  { path: 'D:\\notes\\归档.md', content: '归档，返回 [[首页]]，并再次 [[首页]]' },
  { path: 'D:\\notes\\孤立.md', content: '没有任何双链' },
]

const size = { width: 500, height: 600 }

function settle(simulation: LinkGraphSimulation, limit = 2000): number {
  let ticks = 0
  while (simulation.tick() && ticks < limit) ticks += 1
  return ticks
}

function positions(graph: ReturnType<typeof buildWikiLinkGraph>, simulation: LinkGraphSimulation) {
  return graph.nodes.map((node) => ({ path: node.path, radius: simulation.radiusOf(node.path), ...simulation.positionOf(node.path)! }))
}

describe('双链图谱物理布局', () => {
  it('坐标确定且在画布范围内稳定下来', () => {
    const graph = buildWikiLinkGraph(files)
    const run = () => {
      const simulation = createLinkGraphSimulation(graph, size)
      const ticks = settle(simulation)
      return { ticks, points: positions(graph, simulation) }
    }
    const first = run()
    const second = run()

    expect(first.ticks).toBeLessThan(1000)
    expect(first.points).toEqual(second.points)
    for (const point of first.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(size.width)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(size.height)
    }
  })

  it('稳定后圆点互不重叠', () => {
    const graph = buildWikiLinkGraph(files)
    const simulation = createLinkGraphSimulation(graph, size)
    settle(simulation)
    const points = positions(graph, simulation)

    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const distance = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y)
        expect(distance).toBeGreaterThanOrEqual(points[a].radius + points[b].radius)
      }
    }
  })

  it('单节点居中，空图谱不推进', () => {
    const single = buildWikiLinkGraph([{ path: 'D:\\notes\\a.md', content: '正文' }])
    const simulation = createLinkGraphSimulation(single, { width: 200, height: 100 })
    settle(simulation)
    expect(simulation.positionOf('D:\\notes\\a.md')).toEqual({ x: 100, y: 50 })

    const empty = createLinkGraphSimulation({ nodes: [], edges: [], truncated: false }, size)
    expect(empty.tick()).toBe(false)
    expect(empty.positionOf('D:\\notes\\a.md')).toBeNull()
  })

  it('半径从云团中心向四周递减，无链接的节点大小也不相同', () => {
    // 全部是孤立笔记：连接度相同，大小差异只能来自「离中心多远」。
    const isolated = buildWikiLinkGraph(
      Array.from({ length: 12 }, (_item, index) => ({ path: `D:\\notes\\note-${index}.md`, content: '正文' })),
    )
    const simulation = createLinkGraphSimulation(isolated, size)
    settle(simulation)
    const center = { x: size.width / 2, y: size.height / 2 }
    const ranked = isolated.nodes
      .map((node) => ({
        path: node.path,
        distance: Math.hypot(simulation.positionOf(node.path)!.x - center.x, simulation.positionOf(node.path)!.y - center.y),
        radius: simulation.radiusOf(node.path),
      }))
      .sort((a, b) => a.distance - b.distance)

    const innermost = ranked[0]
    const outermost = ranked[ranked.length - 1]
    expect(innermost.radius).toBeGreaterThan(outermost.radius)
    expect(new Set(ranked.map((item) => item.radius.toFixed(2))).size).toBeGreaterThan(1)

    // 连接度相同的前提下，半径随离中心的距离单调不增。
    for (let index = 1; index < ranked.length; index += 1) {
      expect(ranked[index].radius).toBeLessThanOrEqual(ranked[index - 1].radius + 0.001)
    }
  })

  it('有连接的节点比孤立节点更靠近画布中心', () => {
    const graph = buildWikiLinkGraph(files)
    const simulation = createLinkGraphSimulation(graph, size)
    settle(simulation)
    const center = { x: size.width / 2, y: size.height / 2 }
    const distance = (path: string) => {
      const point = simulation.positionOf(path)!
      return Math.hypot(point.x - center.x, point.y - center.y)
    }

    expect(distance('D:\\notes\\首页.md')).toBeLessThan(distance('D:\\notes\\孤立.md'))
  })

  it('拖动时节点跟随指针，松手后弹性回到云团里', () => {
    const graph = buildWikiLinkGraph(files)
    const simulation = createLinkGraphSimulation(graph, size)
    settle(simulation)
    const start = simulation.positionOf('D:\\notes\\孤立.md')!
    const target = { x: 120, y: 140 }

    simulation.pin('D:\\notes\\孤立.md', target)
    simulation.reheat(0.6)
    simulation.tick()
    expect(simulation.positionOf('D:\\notes\\孤立.md')).toEqual(target)

    simulation.unpin('D:\\notes\\孤立.md')
    simulation.reheat(0.6)
    settle(simulation)
    const released = simulation.positionOf('D:\\notes\\孤立.md')!
    expect(released).not.toEqual(target)
    expect(Math.hypot(released.x - start.x, released.y - start.y)).toBeLessThan(Math.hypot(target.x - start.x, target.y - start.y))
    expect(released.x).toBeGreaterThanOrEqual(0)
    expect(released.x).toBeLessThanOrEqual(size.width)
  })

  it('画布变小时把节点夹回范围内', () => {
    const graph = buildWikiLinkGraph(files)
    const simulation = createLinkGraphSimulation(graph, size)
    settle(simulation)

    simulation.resize(180, 160)
    for (let index = 0; index < 60; index += 1) simulation.tick()
    for (const node of graph.nodes) {
      const point = simulation.positionOf(node.path)!
      // 半径会随位置变化，这里用实际半径校验夹紧结果。
      const radius = simulation.radiusOf(node.path)
      expect(point.x).toBeGreaterThanOrEqual(radius)
      expect(point.x).toBeLessThanOrEqual(180 - radius)
      expect(point.y).toBeGreaterThanOrEqual(radius)
      expect(point.y).toBeLessThanOrEqual(160 - radius)
    }
  })

  it('重建图谱时保留已有节点坐标', () => {
    const graph = buildWikiLinkGraph(files)
    const simulation = createLinkGraphSimulation(graph, size)
    settle(simulation)
    const before = simulation.positionOf('D:\\notes\\首页.md')!

    const extended = buildWikiLinkGraph([...files, { path: 'D:\\notes\\新笔记.md', content: '[[首页]]' }])
    simulation.updateGraph(extended)
    expect(simulation.positionOf('D:\\notes\\首页.md')).toEqual(before)
    expect(simulation.positionOf('D:\\notes\\新笔记.md')).not.toBeNull()
  })
})
