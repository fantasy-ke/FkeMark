export interface RenderCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  clear(): void
}

/** 最近使用优先的有上限缓存。读取会把命中项移到最新。 */
export function createRenderCache<T>(limit: number): RenderCache<T> {
  const entries = new Map<string, T>()
  return {
    get(key) {
      if (!entries.has(key)) return undefined
      const value = entries.get(key) as T
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key)
      entries.set(key, value)
      while (entries.size > limit) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },
    clear() {
      entries.clear()
    },
  }
}
