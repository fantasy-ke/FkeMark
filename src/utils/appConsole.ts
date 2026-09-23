export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

export interface ConsoleEntry {
  id: number
  level: ConsoleLevel
  text: string
  time: number
}

const MAX_ENTRIES = 200
const entries: ConsoleEntry[] = []
const listeners = new Set<() => void>()
let nextId = 1
let installed = false

function formatArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack || value.message
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function recordConsole(level: ConsoleLevel, args: unknown[]) {
  entries.push({
    id: nextId++,
    level,
    text: args.map(formatArg).join(' '),
    time: Date.now(),
  })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  listeners.forEach((listener) => listener())
}

export function getConsoleEntries(): readonly ConsoleEntry[] {
  return entries
}

export function clearConsoleEntries() {
  entries.length = 0
  listeners.forEach((listener) => listener())
}

export function subscribeConsole(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 把页面日志收进应用控制台，同时仍写回原来的 console。 */
export function installConsoleCapture() {
  if (installed || typeof console === 'undefined') return
  installed = true
  const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error']
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      recordConsole(level, args)
      original(...args)
    }
  }
}
