/**
 * 性能优化工具
 * - 编辑器渲染性能优化（debounce、虚拟化）
 * - 大文档加载优化（分片解析、延迟渲染）
 * - 内存泄漏检测
 */

// ── 防抖 ──
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ── 节流 ──
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => { inThrottle = false }, limit)
    }
  }
}

// ── 大文档分片解析 ──
// 将大 Markdown 文档按段落分片，避免一次性解析导致的卡顿
export function splitLargeDocument(content: string, chunkSize = 500): string[] {
  const lines = content.split('\n')
  const chunks: string[] = []
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize).join('\n'))
  }
  return chunks
}

// ── 判断是否为大文档 ──
export function isLargeDocument(content: string, threshold = 100000): boolean {
  return content.length > threshold
}

// ── 内存泄漏检测 ──
const memoryListeners: Array<{ name: string; dispose: () => void }> = []

export function registerDisposable(name: string, dispose: () => void) {
  memoryListeners.push({ name, dispose })
}

export function disposeAll() {
  for (const listener of memoryListeners) {
    try {
      listener.dispose()
    } catch (e) {
      console.error(`Failed to dispose ${listener.name}:`, e)
    }
  }
  memoryListeners.length = 0
}

// ── 内存使用估算（仅开发调试用）──
export function estimateMemoryUsage(): { domNodes: number; eventListeners: number } {
  let domNodes = 0
  let eventListeners = 0

  function countNodes(el: Element) {
    domNodes++
    eventListeners += (el as unknown as { _eventListeners?: unknown[] })._eventListeners?.length ?? 0
    for (const child of Array.from(el.children)) {
      countNodes(child)
    }
  }

  countNodes(document.body)
  return { domNodes, eventListeners }
}

// ── 性能标记工具 ──
export function perfMark(name: string) {
  if (typeof performance !== 'undefined') {
    performance.mark(`${name}-start`)
  }
}

export function perfMeasure(name: string): number {
  if (typeof performance !== 'undefined') {
    try {
      performance.mark(`${name}-end`)
      performance.measure(name, `${name}-start`, `${name}-end`)
      const entries = performance.getEntriesByName(name, 'measure')
      const duration = entries[entries.length - 1]?.duration ?? 0
      performance.clearMarks(`${name}-start`)
      performance.clearMarks(`${name}-end`)
      performance.clearMeasures(name)
      return duration
    } catch {
      return 0
    }
  }
  return 0
}
