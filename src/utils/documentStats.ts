export type DocumentSyncStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export interface DocumentStatistics {
  wordCount: number
  readingMinutes: number
}

const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

function getReadableText(markdown: string): string {
  return markdown
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, ' ')
    .replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^\n)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`([^`]+)`/g, ' $1 ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#>*_~|[\]{}()]/g, ' ')
}

export function getDocumentStatistics(markdown: string): DocumentStatistics {
  const text = getReadableText(markdown)
  const cjkCount = text.match(CJK_CHAR)?.length ?? 0
  const nonCjkWords = text.replace(CJK_CHAR, ' ').match(WORD)?.length ?? 0
  const wordCount = cjkCount + nonCjkWords
  const readingMinutes = wordCount === 0
    ? 0
    : Math.max(1, Math.ceil(cjkCount / 300 + nonCjkWords / 200))

  return { wordCount, readingMinutes }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLastSavedTime(timestamp: number | null, now = Date.now()): string | null {
  if (timestamp === null || !Number.isFinite(timestamp)) return null
  const saved = new Date(timestamp)
  const current = new Date(now)
  const time = `${pad(saved.getHours())}:${pad(saved.getMinutes())}`
  const sameDay = saved.getFullYear() === current.getFullYear()
    && saved.getMonth() === current.getMonth()
    && saved.getDate() === current.getDate()

  if (sameDay) return time
  return `${saved.getFullYear()}-${pad(saved.getMonth() + 1)}-${pad(saved.getDate())} ${time}`
}

const SYNC_STATUS_KEYS: Record<DocumentSyncStatus, string> = {
  saved: 'status.sync.synced',
  saving: 'status.sync.syncing',
  unsaved: 'status.sync.pending',
  error: 'status.sync.error',
}

export function getDocumentSyncStatus(isModified: boolean, path?: string | null): DocumentSyncStatus {
  return isModified || !path ? 'unsaved' : 'saved'
}

export function getSyncStatusKey(status: DocumentSyncStatus): string {
  return SYNC_STATUS_KEYS[status]
}
