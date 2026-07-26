export { tryParseFastMarkdownBlocks } from './blockNoteFastMarkdownParser'
export type { FastMarkdownParseMetrics, FastMarkdownParseResult } from './blockNoteFastMarkdownParser'

import { tryParseFastMarkdownBlocks } from './blockNoteFastMarkdownParser'
import type { FastMarkdownParseResult } from './blockNoteFastMarkdownParser'

interface FastMarkdownSource {
  markdown: string
}

function canUseFastMarkdownWorker(): boolean {
  return typeof Worker !== 'undefined'
    && typeof URL !== 'undefined'
    && !('__vitest_worker__' in globalThis)
}

function parseFastMarkdownInWorker(source: FastMarkdownSource): Promise<FastMarkdownParseResult> {
  return new Promise((resolve) => {
    let settled = false
    const worker = new Worker(new URL('./blockNoteFastMarkdown.worker.ts', import.meta.url), { type: 'module' })
    const settle = (result: FastMarkdownParseResult) => {
      if (settled) return
      settled = true
      worker.terminate()
      resolve(result)
    }

    worker.onmessage = (event: MessageEvent<FastMarkdownParseResult>) => {
      settle(event.data)
    }
    worker.onerror = () => {
      settle(tryParseFastMarkdownBlocks(source.markdown))
    }
    worker.postMessage(source.markdown)
  })
}

export async function tryParseFastMarkdownBlocksOffThread(markdown: string): Promise<FastMarkdownParseResult> {
  if (!canUseFastMarkdownWorker()) return tryParseFastMarkdownBlocks(markdown)
  try {
    return await parseFastMarkdownInWorker({ markdown })
  } catch {
    return tryParseFastMarkdownBlocks(markdown)
  }
}
