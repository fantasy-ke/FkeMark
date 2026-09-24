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

let viewportObserver: IntersectionObserver | null = null
const viewportCallbacks = new Map<Element, () => void>()

function viewportObserverInstance(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  if (!viewportObserver) {
    viewportObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const callback = viewportCallbacks.get(entry.target)
        if (!callback) continue
        viewportCallbacks.delete(entry.target)
        viewportObserver?.unobserve(entry.target)
        callback()
      }
    }, { rootMargin: '800px' })
  }
  return viewportObserver
}

function isLaidOutNearViewport(element: Element): boolean {
  if (typeof window === 'undefined' || !element.isConnected) return false
  const rect = element.getBoundingClientRect()
  const laidOut = rect.width > 0 || rect.height > 0 || rect.top !== 0 || rect.bottom !== 0
  if (!laidOut) return false
  const height = window.innerHeight || 0
  const width = window.innerWidth || 0
  if (height === 0 && width === 0) return false
  const margin = 800
  return rect.bottom >= -margin && rect.top <= height + margin && rect.right >= -margin && rect.left <= width + margin
}

/**
 * 元素进入扩展视口时调用一次。没有 IntersectionObserver 时立即调用，
 * 这样测试环境和旧运行时仍会渲染，而不是永远停在占位。
 */
export function observeNearViewport(element: Element, onNear: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onNear()
    return () => {}
  }
  if (isLaidOutNearViewport(element)) {
    onNear()
    return () => {}
  }
  const observer = viewportObserverInstance()
  if (!observer) {
    onNear()
    return () => {}
  }
  viewportCallbacks.set(element, onNear)
  observer.observe(element)
  return () => {
    viewportCallbacks.delete(element)
    observer.unobserve(element)
  }
}

/** 测试替换 IntersectionObserver 后清掉上一个共享观察器。 */
export function resetViewportObserver(): void {
  viewportObserver?.disconnect()
  viewportObserver = null
  viewportCallbacks.clear()
}

let svgIdSerial = 0

/** 同一段 SVG 插入多个节点前重写 id，避免 marker / gradient 互相引用。 */
export function rewriteSvgIds(svg: string): string {
  const token = `fk${++svgIdSerial}`
  return svg
    .replace(/\bid=(["'])([^"']+)\1/g, (_, quote, id) => `id=${quote}${id}-${token}${quote}`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}-${token})`)
    .replace(/\b(href|xlink:href)=(["'])#([^"']+)\2/g, (_, attr, quote, id) => `${attr}=${quote}#${id}-${token}${quote}`)
}
