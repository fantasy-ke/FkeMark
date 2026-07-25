import { restoreFootnotesToMarkdown, type PreparedHtmlFootnotes } from './footnotes'

const MAX_CHUNK_BLOCKS = 40
const MAX_CHUNK_CHARACTERS = 32_000
const MAX_PARAGRAPH_LINES = 80

interface HtmlChunk {
  html: string
  separatorBefore: string
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  const error = new Error('Deferred HTML to Markdown conversion was aborted')
  error.name = 'AbortError'
  throw error
}

function nodeHtml(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as HTMLElement).outerHTML
  const container = document.createElement('div')
  container.appendChild(node.cloneNode(true))
  return container.innerHTML
}

function splitLargeParagraph(paragraph: HTMLParagraphElement, lineSeparator: string): HtmlChunk[] | null {
  const directBreaks = Array.from(paragraph.children).filter((child) => child.tagName === 'BR').length
  if (directBreaks < MAX_PARAGRAPH_LINES || paragraph.querySelectorAll('br').length !== directBreaks) return null

  const chunks: HtmlChunk[] = []
  let innerHtml = ''
  let lineCount = 1
  const pushChunk = (separatorBefore: string) => {
    const clone = paragraph.cloneNode(false) as HTMLParagraphElement
    clone.innerHTML = innerHtml
    chunks.push({ html: clone.outerHTML, separatorBefore })
    innerHtml = ''
    lineCount = 1
  }

  for (const node of Array.from(paragraph.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
      if (lineCount >= MAX_PARAGRAPH_LINES || innerHtml.length >= MAX_CHUNK_CHARACTERS) {
        pushChunk(chunks.length === 0 ? '' : lineSeparator)
      } else {
        innerHtml += '<br>'
        lineCount += 1
      }
      continue
    }
    innerHtml += nodeHtml(node)
  }

  if (innerHtml || chunks.length === 0) pushChunk(chunks.length === 0 ? '' : lineSeparator)
  return chunks.length > 1 ? chunks : null
}

function splitTopLevelHtml(html: string, paragraphLineSeparator: string): HtmlChunk[] {
  const container = document.createElement('div')
  container.innerHTML = html
  const pieces: HtmlChunk[] = []

  for (const node of Array.from(container.childNodes)) {
    const separatorBefore = pieces.length === 0 ? '' : '\n\n'
    if (node instanceof HTMLParagraphElement) {
      const paragraphChunks = splitLargeParagraph(node, paragraphLineSeparator)
      if (paragraphChunks) {
        paragraphChunks[0].separatorBefore = separatorBefore
        pieces.push(...paragraphChunks)
        continue
      }
    }
    pieces.push({ html: nodeHtml(node), separatorBefore })
  }

  const chunks: HtmlChunk[] = []
  for (const piece of pieces) {
    const current = chunks[chunks.length - 1]
    const canMerge = current
      && piece.separatorBefore === '\n\n'
      && current.html.length + piece.html.length <= MAX_CHUNK_CHARACTERS
      && (current.html.match(/<[^/!][^>]*>/g)?.length ?? 0) < MAX_CHUNK_BLOCKS
    if (canMerge) current.html += piece.html
    else chunks.push({ ...piece })
  }
  return chunks
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function convertPreparedHtmlToMarkdownDeferred(
  prepared: PreparedHtmlFootnotes,
  convertFragment: (html: string) => string,
  paragraphLineSeparator: string,
  signal?: AbortSignal,
): Promise<string> {
  const chunks = splitTopLevelHtml(prepared.html, paragraphLineSeparator)
  let body = ''

  for (let index = 0; index < chunks.length; index++) {
    throwIfAborted(signal)
    const markdown = convertFragment(chunks[index].html)
    if (markdown) body += `${body ? chunks[index].separatorBefore : ''}${markdown}`
    if (index < chunks.length - 1) await yieldToMainThread()
  }

  throwIfAborted(signal)
  body = body.trim().replace(/\n{3,}/g, '\n\n')
  return restoreFootnotesToMarkdown(body, prepared, convertFragment)
}
