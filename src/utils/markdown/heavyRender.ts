import { createRenderCache } from './renderCache'

type HeavyPriority = 'visible' | 'prefetch'

interface HeavyJob {
  priority: HeavyPriority
  run: () => Promise<void>
}

const jobs: HeavyJob[] = []
let activeJobs = 0

function pumpHeavyRender() {
  while (activeJobs < 1 && jobs.length > 0) {
    const job = jobs.shift()
    if (!job) return
    activeJobs += 1
    void job.run().finally(() => {
      activeJobs -= 1
      pumpHeavyRender()
    })
  }
}

/** Mermaid 布局不能并行。可见任务插到预取任务前面。 */
export function enqueueHeavyRender<T>(task: () => Promise<T>, priority: HeavyPriority): Promise<T> {
  return new Promise((resolve, reject) => {
    const job: HeavyJob = {
      priority,
      run: async () => {
        try {
          resolve(await task())
        } catch (error) {
          reject(error)
        }
      },
    }
    if (priority === 'visible') {
      const prefetchIndex = jobs.findIndex((item) => item.priority === 'prefetch')
      if (prefetchIndex === -1) jobs.push(job)
      else jobs.splice(prefetchIndex, 0, job)
    } else {
      jobs.push(job)
    }
    pumpHeavyRender()
  })
}

const VIEWPORT_MARGIN_PX = 800
interface ViewportWatch {
  callbacks: Map<Element, () => void>
  observer: IntersectionObserver
  dispose: () => void
}

const viewportWatches = new Map<Element | null, ViewportWatch>()

export function scrollParent(element: Element): Element | null {
  let node = element.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) return node
    node = node.parentElement
  }
  return null
}

export function isNearScrollport(element: Element, margin = VIEWPORT_MARGIN_PX): boolean {
  if (typeof window === 'undefined' || !element.isConnected) return false
  const rect = element.getBoundingClientRect()
  const laidOut = rect.width > 0 || rect.height > 0 || rect.top !== 0 || rect.bottom !== 0
  if (!laidOut) return false
  const root = scrollParent(element)
  const bounds = root?.getBoundingClientRect()
  const top = bounds?.top ?? 0
  const left = bounds?.left ?? 0
  const bottom = bounds?.bottom ?? window.innerHeight
  const right = bounds?.right ?? window.innerWidth
  if (bottom <= top && right <= left) return false
  return rect.bottom >= top - margin && rect.top <= bottom + margin
    && rect.right >= left - margin && rect.left <= right + margin
}

function watchScrollRoot(root: Element | null): ViewportWatch {
  const existing = viewportWatches.get(root)
  if (existing) return existing

  const callbacks = new Map<Element, () => void>()
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) callbacks.get(entry.target)?.()
    }
  }, { root, rootMargin: `${VIEWPORT_MARGIN_PX}px` })
  const onScroll = () => {
    for (const [element, callback] of callbacks) {
      if (isNearScrollport(element)) callback()
    }
  }
  const target = root ?? window
  const watch: ViewportWatch = {
    callbacks,
    observer,
    dispose() {
      if (viewportWatches.get(root) !== watch) return
      viewportWatches.delete(root)
      callbacks.clear()
      observer.disconnect()
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    },
  }
  viewportWatches.set(root, watch)
  target.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  return watch
}

/**
 * 元素进入编辑区滚动视口时调用一次。编辑区是内部滚动，不能只观察窗口。
 * 没有 IntersectionObserver 时立即调用，避免测试环境永远停在占位。
 */
export function observeNearViewport(element: Element, onNear: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined' || isNearScrollport(element)) {
    onNear()
    return () => {}
  }

  const watch = watchScrollRoot(scrollParent(element))
  let cancel: (() => void) | undefined = () => {
    cancel = undefined
    if (watch.callbacks.get(element) !== run) return
    watch.callbacks.delete(element)
    if (watch.callbacks.size === 0) watch.dispose()
    else watch.observer.unobserve(element)
  }
  const run = () => {
    cancel?.()
    onNear()
  }
  watch.callbacks.set(element, run)
  watch.observer.observe(element)
  return () => cancel?.()
}

/** 测试替换 IntersectionObserver 后清掉上一个共享观察器。 */
export function resetViewportObserver(): void {
  viewportWatches.forEach((watch) => watch.dispose())
}

let svgIdSerial = 0

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 同一段 SVG 插入多个节点前重写 id，避免 marker、渐变和动画引用互相串用。 */
export function rewriteSvgIds(svg: string): string {
  const token = `fk${++svgIdSerial}`
  const ids = new Set<string>()
  svg.replace(/\bid=(["'])([^"']+)\1/g, (_match, _quote, id: string) => {
    ids.add(id)
    return ''
  })
  let next = svg
    .replace(/\bid=(["'])([^"']+)\1/g, (_match, quote, id: string) => `id=${quote}${id}-${token}${quote}`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${id}-${token})`)
    .replace(/\b(href|xlink:href)=(["'])#([^"']+)\2/g, (_match, attr, quote, id: string) => `${attr}=${quote}#${id}-${token}${quote}`)
  // 内嵌样式表用 #id 限定作用域，id 改名后必须同步，否则整张图的主题样式全部失效
  next = next.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
    let css = block
    ids.forEach((id) => {
      css = css.replace(new RegExp(`#${escapeRegExp(id)}(?![\\w-])`, 'g'), `#${id}-${token}`)
    })
    return css
  })
  ids.forEach((id) => {
    next = next.replace(new RegExp(`\\b${escapeRegExp(id)}\\.(begin|end)\\b`, 'g'), `${id}-${token}.$1`)
  })
  return next
}

const renderHeights = createRenderCache<number>(128)
// 同时限制键长度，避免图块高度缓存长期持有大体积场景源码。
const MAX_HEIGHT_KEY_LENGTH = 16 * 1024

export function applyReservedHeight(element: HTMLElement, key: string): void {
  const height = renderHeights.get(key)
  if (!height) return
  element.style.minHeight = `${height}px`
}

/** 首次绘制后记住高度。再次进入视口或重新挂载时先占住，避免滚动跳动。 */
export function rememberRenderHeight(element: HTMLElement, key: string): void {
  const height = Math.ceil(element.getBoundingClientRect().height)
  if (height <= 0 || !key) return
  element.style.minHeight = `${height}px`
  if (key.length <= MAX_HEIGHT_KEY_LENGTH) renderHeights.set(key, height)
}
