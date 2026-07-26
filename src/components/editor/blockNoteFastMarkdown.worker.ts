import { tryParseFastMarkdownBlocks } from './blockNoteFastMarkdownParser'

self.onmessage = (event: MessageEvent<string>) => {
  self.postMessage(tryParseFastMarkdownBlocks(event.data))
}
