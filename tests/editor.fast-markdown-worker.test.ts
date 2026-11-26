import { afterEach, expect, it, vi } from 'vitest'
import { tryParseFastMarkdownBlocksOffThread } from '../src/components/editor/blockNoteFastMarkdown'

const terminate = vi.fn()
class PendingWorker {
  terminate = terminate
  postMessage() {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  terminate.mockClear()
})

it('terminates a pending worker and rejects instead of parsing again when cancelled', async () => {
  vi.stubGlobal('Worker', PendingWorker)
  const controller = new AbortController()
  const removeAbortHandler = vi.spyOn(controller.signal, 'removeEventListener')
  const result = tryParseFastMarkdownBlocksOffThread('# heading', controller.signal)
  const rejected = expect(result).rejects.toBeInstanceOf(DOMException)
  controller.abort()
  await rejected
  expect(terminate).toHaveBeenCalledTimes(1)
  expect(removeAbortHandler).toHaveBeenCalledWith('abort', expect.any(Function))
})

it('does not fall back to the main thread when a worker error is followed by cancellation', async () => {
  class FailingWorker extends PendingWorker {
    onerror: (() => void) | null = null
    postMessage() {
      this.onerror?.()
    }
  }
  vi.stubGlobal('Worker', FailingWorker)
  const controller = new AbortController()
  const result = tryParseFastMarkdownBlocksOffThread('# heading', controller.signal)
  controller.abort()
  await expect(result).rejects.toBe(controller.signal.reason)
})
