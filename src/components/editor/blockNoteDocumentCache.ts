// Adapted from refactoringhq/tolaria BlockNote document cache (AGPL-3.0-only, commit a904e2f).
import type { BlockNoteBlocks } from './blockNoteMarkdown'

interface BlockNoteDocumentCacheEntry {
  blocks: BlockNoteBlocks
  content: string
}

const CACHE_LIMIT = 8
const ENTRY_MAX_BYTES = 768 * 1024
const CACHE_MAX_SOURCE_BYTES = 3 * 1024 * 1024
const cache = new Map<string, BlockNoteDocumentCacheEntry>()
const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder()

function sourceBytes(content: string): number {
  return encoder ? encoder.encode(content).byteLength : content.length
}

function cloneBlocks(blocks: BlockNoteBlocks): BlockNoteBlocks {
  if (typeof structuredClone === 'function') return structuredClone(blocks)
  return JSON.parse(JSON.stringify(blocks)) as BlockNoteBlocks
}

function retainedBytes(): number {
  let total = 0
  for (const entry of cache.values()) total += sourceBytes(entry.content)
  return total
}

function trim(): void {
  while (cache.size > CACHE_LIMIT || retainedBytes() > CACHE_MAX_SOURCE_BYTES) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey !== 'string') return
    cache.delete(oldestKey)
  }
}

export function cacheBlockNoteDocument(key: string, content: string, blocks: BlockNoteBlocks): void {
  if (sourceBytes(content) > ENTRY_MAX_BYTES) {
    cache.delete(key)
    return
  }
  cache.delete(key)
  cache.set(key, { content, blocks: cloneBlocks(blocks) })
  trim()
}

export function readCachedBlockNoteDocument(key: string, content: string): BlockNoteBlocks | null {
  const entry = cache.get(key)
  if (!entry || entry.content !== content) return null
  cache.delete(key)
  cache.set(key, entry)
  return cloneBlocks(entry.blocks)
}

export function clearBlockNoteDocumentCache(): void {
  cache.clear()
}
