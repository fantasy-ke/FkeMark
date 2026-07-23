import { prepareMarkdownForRendering } from './normalize'

interface MarkdownFence {
  marker: '`' | '~'
  length: number
}

function readFence(line: string): MarkdownFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return { marker: match[1][0] as '`' | '~', length: match[1].length }
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const marker = fence.marker === '`' ? '`' : '~'
  return new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(line)
}

/**
 * Split a Markdown document into presentation slides.
 * A standalone `---` outside front matter and fenced/indented code starts a new slide.
 */
export function splitMarkdownSlides(markdown: string): string[] {
  const { body } = prepareMarkdownForRendering(markdown)
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const slides: string[] = []
  let current: string[] = []
  let fence: MarkdownFence | null = null

  const pushSlide = () => {
    const slide = current.join('\n').trim()
    if (slide) slides.push(slide)
    current = []
  }

  for (const line of lines) {
    if (fence) {
      current.push(line)
      if (closesFence(line, fence)) fence = null
      continue
    }

    const nextFence = readFence(line)
    if (nextFence) {
      fence = nextFence
      current.push(line)
      continue
    }

    if (/^ {0,3}---[ \t]*$/.test(line)) {
      pushSlide()
      continue
    }

    current.push(line)
  }

  pushSlide()
  return slides
}
