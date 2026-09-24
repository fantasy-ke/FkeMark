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
const viewportCallbacks = new Map<Element, () => void>()
const viewportObservers = new Map<Element | 'window', IntersectionObserver>()
const scrollUnlisten = new Map<Element | 'window', () => void>()

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

function releaseNear(element: Element) {
  const callback = viewportCallbacks.get(element)
  viewportCallbacks.delete(element)
  viewportObservers.forEach((observer) => observer.unobserve(element))
  callback?.()
}

function flushScrollRoot(root: Element | null) {
  Array.from(viewportCallbacks.keys()).forEach((element) => {
    if (scrollParent(element) !== root) return
    if (isNearScrollport(element)) releaseNear(element)
  })
}

function watchScrollRoot(root: Element | null) {
  const key = root ?? 'window'
  if (scrollUnlisten.has(key)) return
  const onScroll = () => flushScrollRoot(root)
  const target: Element | Window = root ?? window
  target.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  scrollUnlisten.set(key, () => {
    target.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  })
}

function observerFor(root: Element | null): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  const key = root ?? 'window'
  const existing = viewportObservers.get(key)
  if (existing) return existing
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !viewportCallbacks.has(entry.target)) continue
      releaseNear(entry.target)
    }
  }, { root: root ?? undefined, rootMargin: `${VIEWPORT_MARGIN_PX}px` })
  viewportObservers.set(key, observer)
  return observer
}

/**
 * 元素进入编辑区滚动视口时调用一次。编辑区是内部滚动，不能只观察窗口。
 * 没有 IntersectionObserver 时立即调用，避免测试环境永远停在占位。
 */
export function observeNearViewport(element: Element, onNear: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onNear()
    return () => {}
  }
  if (isNearScrollport(element)) {
    onNear()
    return () => {}
  }
  const root = scrollParent(element)
  const observer = observerFor(root)
  if (!observer) {
    onNear()
    return () => {}
  }
  viewportCallbacks.set(element, onNear)
  watchScrollRoot(root)
  observer.observe(element)
  return () => {
    viewportCallbacks.delete(element)
    observer.unobserve(element)
  }
}

/** 测试替换 IntersectionObserver 后清掉上一个共享观察器。 */
export function resetViewportObserver(): void {
  viewportObservers.forEach((observer) => observer.disconnect())
  viewportObservers.clear()
  scrollUnlisten.forEach((unlisten) => unlisten())
  scrollUnlisten.clear()
  viewportCallbacks.clear()
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
  ids.forEach((id) => {
    next = next.replace(new RegExp(`\\b${escapeRegExp(id)}\\.(begin|end)\\b`, 'g'), `${id}-${token}.$1`)
  })
  return next
}

const renderHeights = new Map<string, number>()

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
  renderHeights.set(key, height)
}
