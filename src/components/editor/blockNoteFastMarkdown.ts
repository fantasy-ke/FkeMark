export { tryParseFastMarkdownBlocks } from './blockNoteFastMarkdownParser'
export type { FastMarkdownParseMetrics, FastMarkdownParseResult } from './blockNoteFastMarkdownParser'

import { tryParseFastMarkdownBlocks } from './blockNoteFastMarkdownParser'
import type { FastMarkdownParseResult } from './blockNoteFastMarkdownParser'

function parseFastMarkdownInWorker(markdown: string, signal?: AbortSignal): Promise<FastMarkdownParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./blockNoteFastMarkdown.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      signal?.removeEventListener('abort', abort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(signal?.reason)
    }
    const fail = (error: unknown) => {
      cleanup()
      reject(error)
    }
    worker.onmessage = (event: MessageEvent<FastMarkdownParseResult>) => {
      cleanup()
      resolve(event.data)
    }
    worker.onerror = fail
    worker.onmessageerror = fail
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }
    try {
      worker.postMessage(markdown)
    } catch (error) {
      fail(error)
    }
  })
}

export async function tryParseFastMarkdownBlocksOffThread(markdown: string, signal?: AbortSignal): Promise<FastMarkdownParseResult> {
  signal?.throwIfAborted()
  if (typeof Worker !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const result = await parseFastMarkdownInWorker(markdown, signal)
      signal?.throwIfAborted()
      return result
    } catch {
      signal?.throwIfAborted()
    }
  }
  return tryParseFastMarkdownBlocks(markdown)
}
