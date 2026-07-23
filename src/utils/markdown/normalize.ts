/** Markdown 输入兼容处理：提取文档头属性，并解包不支持的 HTML 标签。 */

export interface PreparedMarkdown {
  frontMatter: string | null
  body: string
}

const htmlTagPattern = /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*?)?\s*\/?>/g

function unwrapHtmlTags(text: string): string {
  return text.replace(htmlTagPattern, (tag, name: string) => {
    const normalizedName = name.toLowerCase()
    if (normalizedName === 'u') return tag
    if (normalizedName === 'br') return '\n'
    return ''
  })
}

function unwrapTagsOutsideInlineCode(line: string): string {
  let result = ''
  let plainStart = 0
  let index = 0

  while (index < line.length) {
    if (line[index] !== '`') {
      index++
      continue
    }

    let runEnd = index + 1
    while (line[runEnd] === '`') runEnd++
    const marker = line.slice(index, runEnd)
    const closing = line.indexOf(marker, runEnd)
    if (closing < 0) break

    result += unwrapHtmlTags(line.slice(plainStart, index))
    result += line.slice(index, closing + marker.length)
    index = closing + marker.length
    plainStart = index
  }

  return result + unwrapHtmlTags(line.slice(plainStart))
}

/**
 * 仅把文档起始位置成对的 --- 识别为 Front Matter。
 * 正文中的分隔线以及代码中的 HTML 示例保持原样。
 */
export function prepareMarkdownForRendering(markdown: string): PreparedMarkdown {
  const frontMatterMatch = markdown.match(
    /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )
  const frontMatter = frontMatterMatch?.[1] ?? null
  const body = frontMatterMatch ? markdown.slice(frontMatterMatch[0].length) : markdown
  const lines = body.split(/\r?\n/)
  const result: string[] = []
  let fenceChar = ''
  let fenceLength = 0

  for (const line of lines) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceChar) {
      result.push(line)
      if (
        fence &&
        fence[1][0] === fenceChar &&
        fence[1].length >= fenceLength &&
        /^\s*$/.test(line.slice(fence[0].length))
      ) {
        fenceChar = ''
        fenceLength = 0
      }
      continue
    }

    if (fence) {
      fenceChar = fence[1][0]
      fenceLength = fence[1].length
      result.push(line)
      continue
    }

    result.push(/^(?: {4}|\t)/.test(line) ? line : unwrapTagsOutsideInlineCode(line))
  }

  return { frontMatter, body: result.join('\n') }
}

export function renderFrontMatterHtml(frontMatter: string): string {
  const escaped = frontMatter
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<pre data-frontmatter="true"><code class="language-yaml">${escaped}\n</code></pre>`
}
