import type { LinkGraphPoint, WikiLinkGraph } from './linkGraph'

/** 节点半径范围：按连接度在两者之间线性增长。 */
export const GRAPH_NODE_MIN_RADIUS = 5
export const GRAPH_NODE_MAX_RADIUS = 12
/** 云团中心与边缘的半径倍率：中心大、四周小，形成从中心向外收缩的层次。 */
const CENTER_RADIUS_SCALE = 1.5
const EDGE_RADIUS_SCALE = 0.78

/**
 * 渲染与物理共用同一半径，保证圆点大小和碰撞体一致。
 * `depth` 为节点在云团里的归一化半径（0 = 正中心，1 = 云团边缘），越靠外画得越小。
 */
export function graphNodeRadius(degree: number, depth = 0): number {
  const base = Math.min(GRAPH_NODE_MAX_RADIUS, GRAPH_NODE_MIN_RADIUS + degree * 1.2)
  const scale = CENTER_RADIUS_SCALE - (CENTER_RADIUS_SCALE - EDGE_RADIUS_SCALE) * clamp(depth, 0, 1)
  return base * scale
}

export interface LinkGraphSimulationOptions {
  width: number
  height: number
  padding?: number
}

export interface LinkGraphSimulation {
  readonly width: number
  readonly height: number
  /** 冷却系数，降到 ALPHA_MIN 以下即视为稳定。 */
  readonly alpha: number
  /** 推进一帧；返回 false 表示已经稳定，可以停掉动画循环。 */
  tick(): boolean
  positionOf(path: string): LinkGraphPoint | null
  radiusOf(path: string): number
  /** 拖动时把节点钉在指针位置，同时记录速度用于松手后的回弹。 */
  pin(path: string, point: LinkGraphPoint): void
  unpin(path: string): void
  /** 重新加热，让被拖动或尺寸变化后的图谱重新舒展。 */
  reheat(alpha?: number): void
  updateGraph(graph: WikiLinkGraph): void
  resize(width: number, height: number): void
}

interface SimulationNode {
  path: string
  /** 出链 + 反向链接，决定基础半径。 */
  degree: number
  radius: number
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

interface SimulationLink {
  source: number
  target: number
  /** 弹簧自然长度在两端半径之外再留出的空隙。 */
  gap: number
}

const DEFAULT_PADDING = 26
const ALPHA_START = 1
const ALPHA_MIN = 0.02
const ALPHA_DECAY = 0.975
const FRICTION = 0.85
const MAX_SPEED = 16
/** 斥力在极近距离的下限，避免除零和数值爆炸。 */
const MIN_PAIR_DISTANCE = 8
const REPULSION_SCALE = 3.6
const SPRING_SCALE = 0.02
/** 云团边界弹簧：越界后把节点拉回来的强度。 */
const EDGE_SCALE = 0.075
/** 斥力只作用在邻近节点，避免整张图被推向画布边缘。 */
const REPULSION_CUTOFF = 3.2
/** 每帧推开重叠圆点的比例，越大收敛越快但越容易抖动。 */
const OVERLAP_RELAXATION = 0.55
/** 圆点之间的最小空隙。 */
const COLLISION_GAP = 6

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 目标间距随节点数收缩，让稀疏图谱舒展、密集图谱仍能装进画布。 */
function idealDistance(width: number, height: number, count: number): number {
  return clamp(Math.sqrt((width * height) / Math.max(1, count)) * 0.62, 30, 110)
}

/**
 * 云团目标半径：小图谱是一团紧凑的圆球，节点越多越铺开，
 * 上限为画布内切圆，因此节点不会被硬性挤到画布边缘排成方框。
 */
function cloudRadius(width: number, height: number, count: number, padding: number): number {
  const maxRadius = Math.max(40, Math.min(width, height) / 2 - padding - 8)
  const scale = Math.min(1, 0.5 + 0.5 * Math.sqrt(count / 150))
  return Math.max(24, maxRadius * scale)
}

/**
 * 确定性初始位置：黄金角螺旋把节点铺在云团半径内，不使用随机数，
 * 因此同一图谱的初始坐标稳定可测，物理演化也完全可复现。
 */
function seedPoint(index: number, count: number, width: number, height: number, padding: number): LinkGraphPoint {
  const centerX = width / 2
  const centerY = height / 2
  if (count <= 1) return { x: centerX, y: centerY }
  const spread = Math.max(12, cloudRadius(width, height, count, padding) * 0.72)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const distance = spread * Math.sqrt((index + 0.5) / count)
  const angle = index * goldenAngle
  return { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance }
}

function createNode(
  path: string,
  degree: number,
  index: number,
  count: number,
  width: number,
  height: number,
  padding: number,
): SimulationNode {
  const point = seedPoint(index, count, width, height, padding)
  return {
    path,
    degree,
    radius: graphNodeRadius(degree),
    x: point.x,
    y: point.y,
    vx: 0,
    vy: 0,
    pinned: false,
  }
}

export function createLinkGraphSimulation(
  graph: WikiLinkGraph,
  options: LinkGraphSimulationOptions,
): LinkGraphSimulation {
  const padding = options.padding ?? DEFAULT_PADDING
  let width = Math.max(1, options.width)
  let height = Math.max(1, options.height)
  let nodes: SimulationNode[] = []
  let indexByPath = new Map<string, number>()
  let links: SimulationLink[] = []
  let alpha = ALPHA_START

  function rebuild(graph: WikiLinkGraph, previous: SimulationNode[]): void {
    const previousByPath = new Map(previous.map((node) => [node.path, node]))
    const count = graph.nodes.length
    indexByPath = new Map()
    nodes = graph.nodes.map((node, index) => {
      indexByPath.set(node.path, index)
      const degree = node.outLinks + node.backLinks
      const kept = previousByPath.get(node.path)
      if (kept) return { ...kept, degree }
      return createNode(node.path, degree, index, count, width, height, padding)
    })
    links = graph.edges.flatMap((edge) => {
      const source = indexByPath.get(edge.source)
      const target = indexByPath.get(edge.target)
      if (source === undefined || target === undefined) return []
      return [{
        source,
        target,
        gap: Math.min(56, idealDistance(width, height, count) * 0.8),
      }]
    })
    updateRadii()
  }

  /** 半径同时取决于连接度与「离中心多远」，因此每帧按当前位置刷新。 */
  function updateRadii(): void {
    const centerX = width / 2
    const centerY = height / 2
    const cloud = cloudRadius(width, height, nodes.length, padding)
    for (const node of nodes) {
      const distance = Math.hypot(node.x - centerX, node.y - centerY)
      node.radius = graphNodeRadius(node.degree, distance / cloud)
    }
  }

  rebuild(graph, [])

  /** 单位方向与距离；两点完全重合时按黄金角给出确定性的分离方向。 */
  function pairGeometry(a: number, b: number): { ux: number; uy: number; distance: number } {
    const dx = nodes[a].x - nodes[b].x
    const dy = nodes[a].y - nodes[b].y
    const distance = Math.hypot(dx, dy)
    if (distance > 0.0001) return { ux: dx / distance, uy: dy / distance, distance }
    const angle = a * 2.399963229728653
    return { ux: Math.cos(angle), uy: Math.sin(angle), distance: 0 }
  }

  function clampToBounds(node: SimulationNode): void {
    const minX = padding + node.radius
    const maxX = Math.max(minX, width - padding - node.radius)
    const minY = padding + node.radius
    const maxY = Math.max(minY, height - padding - node.radius)
    if (node.x < minX || node.x > maxX) {
      node.x = clamp(node.x, minX, maxX)
      node.vx = 0
    }
    if (node.y < minY || node.y > maxY) {
      node.y = clamp(node.y, minY, maxY)
      node.vy = 0
    }
  }

  /** 位置松弛：直接推开重叠的圆点，避免密集图谱里圆点互相压住看不清。 */
  function separateOverlaps(): void {
    for (let a = 0; a < nodes.length; a += 1) {
      for (let b = a + 1; b < nodes.length; b += 1) {
        const minDistance = nodes[a].radius + nodes[b].radius + COLLISION_GAP
        const { ux, uy, distance } = pairGeometry(a, b)
        if (distance >= minDistance) continue
        const push = ((minDistance - distance) * OVERLAP_RELAXATION) / 2
        if (!nodes[a].pinned) {
          nodes[a].x += ux * push
          nodes[a].y += uy * push
        }
        if (!nodes[b].pinned) {
          nodes[b].x -= ux * push
          nodes[b].y -= uy * push
        }
      }
    }
    for (const node of nodes) clampToBounds(node)
  }

  function tick(): boolean {
    const count = nodes.length
    if (count === 0) return false
    const centerX = width / 2
    const centerY = height / 2
    const ideal = idealDistance(width, height, count)
    const repulsion = REPULSION_SCALE * ideal * ideal
    const cutoff = ideal * REPULSION_CUTOFF
    const target = cloudRadius(width, height, count, padding)
    // 向心力与斥力配平：两个孤立节点的平衡距离正好是云团半径。
    const gravity = repulsion / (target ** 3)
    const forceX = new Float64Array(count)
    const forceY = new Float64Array(count)
    // 半径随位置变化，先按上一帧位置刷新，保证弹簧与碰撞都用当前大小。
    updateRadii()

    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        const { ux, uy, distance } = pairGeometry(a, b)
        if (distance > cutoff) continue
        const force = repulsion / (Math.max(MIN_PAIR_DISTANCE, distance) ** 2)
        forceX[a] += ux * force
        forceY[a] += uy * force
        forceX[b] -= ux * force
        forceY[b] -= uy * force
      }
    }

    for (const link of links) {
      const dx = nodes[link.source].x - nodes[link.target].x
      const dy = nodes[link.source].y - nodes[link.target].y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const rest = nodes[link.source].radius + nodes[link.target].radius + link.gap
      const force = (distance - rest) * SPRING_SCALE
      const unitX = dx / distance
      const unitY = dy / distance
      forceX[link.source] -= unitX * force
      forceY[link.source] -= unitY * force
      forceX[link.target] += unitX * force
      forceY[link.target] += unitY * force
    }

    for (let index = 0; index < count; index += 1) {
      const node = nodes[index]
      if (node.pinned) {
        node.vx = 0
        node.vy = 0
        continue
      }
      forceX[index] += (centerX - node.x) * gravity
      forceY[index] += (centerY - node.y) * gravity
      const offsetX = node.x - centerX
      const offsetY = node.y - centerY
      const offset = Math.hypot(offsetX, offsetY)
      if (offset > target) {
        // 软边界：越靠近画布边缘拉力越强，节点自然铺成一团而不是贴边排成方框。
        const pull = (offset - target) * EDGE_SCALE
        forceX[index] -= (offsetX / offset) * pull
        forceY[index] -= (offsetY / offset) * pull
      }
      node.vx = (node.vx + forceX[index] * alpha) * FRICTION
      node.vy = (node.vy + forceY[index] * alpha) * FRICTION
      const speed = Math.hypot(node.vx, node.vy)
      if (speed > MAX_SPEED) {
        node.vx = (node.vx / speed) * MAX_SPEED
        node.vy = (node.vy / speed) * MAX_SPEED
      }
      node.x += node.vx
      node.y += node.vy
      clampToBounds(node)
    }

    separateOverlaps()

    alpha *= ALPHA_DECAY
    return alpha > ALPHA_MIN || nodes.some((node) => node.pinned)
  }

  return {
    get width() { return width },
    get height() { return height },
    get alpha() { return alpha },
    tick,
    positionOf(path) {
      const index = indexByPath.get(path)
      if (index === undefined) return null
      const node = nodes[index]
      return { x: node.x, y: node.y }
    },
    radiusOf(path) {
      const index = indexByPath.get(path)
      return index === undefined ? GRAPH_NODE_MIN_RADIUS : nodes[index].radius
    },
    pin(path, point) {
      const index = indexByPath.get(path)
      if (index === undefined) return
      const node = nodes[index]
      // 记录拖动速度：松手后节点会带着惯性继续走一小段，形成弹性手感。
      node.vx = clamp(point.x - node.x, -MAX_SPEED, MAX_SPEED)
      node.vy = clamp(point.y - node.y, -MAX_SPEED, MAX_SPEED)
      node.x = clamp(point.x, padding, Math.max(padding, width - padding))
      node.y = clamp(point.y, padding, Math.max(padding, height - padding))
      node.pinned = true
    },
    unpin(path) {
      const index = indexByPath.get(path)
      if (index === undefined) return
      nodes[index].pinned = false
    },
    reheat(next = 0.6) {
      alpha = clamp(Math.max(alpha, next), ALPHA_MIN, ALPHA_START)
    },
    updateGraph(graph) {
      rebuild(graph, nodes)
      alpha = ALPHA_START
    },
    resize(nextWidth, nextHeight) {
      width = Math.max(1, nextWidth)
      height = Math.max(1, nextHeight)
      for (const node of nodes) {
        node.x = clamp(node.x, padding, Math.max(padding, width - padding))
        node.y = clamp(node.y, padding, Math.max(padding, height - padding))
      }
      updateRadii()
      alpha = ALPHA_START
    },
  }
}
