/**
 * Markdown 脚注共享处理。
 *
 * 两套 Markdown 引擎都使用相同的预处理与 HTML 元数据，避免脚注在
 * Markdown → TipTap → HTML → Markdown 往返时退化为普通链接和列表。
 */

const MARKDOWN_REF_PREFIX = '\uE000FKFN'
const MARKDOWN_REF_SUFFIX = '\uE001'
const HTML_REF_PREFIX = 'FKFNHTMLREF'
const HTML_REF_SUFFIX = 'TOKEN'

export interface FootnoteDefinition {
  label: string
  content: string
}

interface FootnoteReference {
  label: string
  token: string
}

export interface PreparedMarkdownFootnotes {
  body: string
  definitions: FootnoteDefinition[]
  references: FootnoteReference[]
}

export interface PreparedHtmlFootnotes {
  html: string
  definitions: Array<{ label: string; html: string }>
  references: FootnoteReference[]
}

function isFence(line: string): { marker: '`' | '~'; length: number } | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return { marker: match[1][0] as '`' | '~', length: match[1].length }
}

function isFenceClose(line: string, fence: { marker: '`' | '~'; length: number }): boolean {
  const pattern = fence.marker === '`' ? '`' : '~'
  return new RegExp(`^ {0,3}${pattern}{${fence.length},}\\s*$`).test(line)
}

function stripDefinitionIndent(line: string): string | null {
  if (line.startsWith('\t')) return line.slice(1)
  const match = line.match(/^( {2,})(.*)$/)
  if (!match) return null
  return line.slice(Math.min(4, match[1].length))
}

function extractDefinitions(markdown: string): { body: string; definitions: FootnoteDefinition[] } {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const body: string[] = []
  const definitions: FootnoteDefinition[] = []
  const labels = new Set<string>()
  let fence: { marker: '`' | '~'; length: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMarker = isFence(line)
    if (fence) {
      body.push(line)
      if (isFenceClose(line, fence)) fence = null
      continue
    }
    if (fenceMarker) {
      fence = fenceMarker
      body.push(line)
      continue
    }

    const start = line.match(/^ {0,3}\[\^([^\]\n]+)\]:[ \t]*(.*)$/)
    const label = start?.[1].trim() || ''
    if (!start || !label) {
      body.push(line)
      continue
    }

    const content = [start[2]]
    let cursor = i + 1
    while (cursor < lines.length) {
      const continuation = stripDefinitionIndent(lines[cursor])
      if (continuation !== null) {
        content.push(continuation)
        cursor++
        continue
      }
      if (lines[cursor].trim() === '') {
        const next = cursor + 1 < lines.length ? stripDefinitionIndent(lines[cursor + 1]) : null
        if (next !== null) {
          content.push('')
          cursor++
          continue
        }
      }
      break
    }

    if (!labels.has(label)) {
      labels.add(label)
      definitions.push({ label, content: content.join('\n').trimEnd() })
    }
    i = cursor - 1
  }

  return { body: body.join('\n'), definitions }
}

function tokenizeReferences(
  markdown: string,
  labels: Set<string>,
  references: FootnoteReference[],
): string {
  const lines = markdown.split('\n')
  let fence: { marker: '`' | '~'; length: number } | null = null

  return lines.map((line) => {
    const fenceMarker = isFence(line)
    if (fence) {
      if (isFenceClose(line, fence)) fence = null
      return line
    }
    if (fenceMarker) {
      fence = fenceMarker
      return line
    }

    let result = ''
    let index = 0
    while (index < line.length) {
      if (line[index] === '\\' && index + 1 < line.length) {
        result += line.slice(index, index + 2)
        index += 2
        continue
      }

      if (line[index] === '`') {
        let runLength = 1
        while (line[index + runLength] === '`') runLength++
        const marker = '`'.repeat(runLength)
        const close = line.indexOf(marker, index + runLength)
        if (close >= 0) {
          result += line.slice(index, close + runLength)
          index = close + runLength
          continue
        }
      }

      if (line[index] === '[' && line[index + 1] === '^' && line[index - 1] !== '!') {
        const close = line.indexOf(']', index + 2)
        if (close >= 0) {
          const label = line.slice(index + 2, close).trim()
          if (labels.has(label)) {
            const token = `${MARKDOWN_REF_PREFIX}${references.length}${MARKDOWN_REF_SUFFIX}`
            references.push({ label, token })
            result += token
            index = close + 1
            continue
          }
        }
      }

      result += line[index]
      index++
    }
    return result
  }).join('\n')
}

export function prepareMarkdownFootnotes(markdown: string): PreparedMarkdownFootnotes {
  const extracted = extractDefinitions(markdown)
  if (extracted.definitions.length === 0) {
    return { body: markdown, definitions: [], references: [] }
  }

  const labels = new Set(extracted.definitions.map((definition) => definition.label))
  const references: FootnoteReference[] = []
  const body = tokenizeReferences(extracted.body, labels, references)
  const definitions = extracted.definitions.map((definition) => ({
    ...definition,
    content: tokenizeReferences(definition.content, labels, references),
  }))

  return { body, definitions, references }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function replaceReferenceTokens(
  html: string,
  references: FootnoteReference[],
  numbers: Map<string, number>,
  occurrences: Map<string, number>,
): string {
  let result = html
  for (const reference of references) {
    if (!result.includes(reference.token)) continue
    const number = numbers.get(reference.label)
    if (!number) continue
    const occurrence = (occurrences.get(reference.label) || 0) + 1
    occurrences.set(reference.label, occurrence)
    const refId = `fnref-${number}${occurrence > 1 ? `-${occurrence}` : ''}`
    const label = escapeHtmlAttribute(reference.label)
    const anchor = `<a class="md-link footnote-ref" href="#fn-${number}" id="${refId}" data-footnote-ref="${label}" data-footnote-index="${occurrence}" aria-label="Footnote ${number}">${number}</a>`
    result = result.replace(reference.token, anchor)
  }
  return result
}

function appendBacklinks(html: string, backlinks: string): string {
  if (!backlinks) return html
  const paragraphEnd = html.match(/<\/p>\s*$/)
  if (paragraphEnd?.index !== undefined) {
    return `${html.slice(0, paragraphEnd.index)} ${backlinks}${html.slice(paragraphEnd.index)}`
  }
  return `${html}<p>${backlinks}</p>`
}

export function renderFootnotesHtml(
  bodyHtml: string,
  prepared: PreparedMarkdownFootnotes,
  renderDefinition: (markdown: string) => string,
): string {
  if (prepared.definitions.length === 0) return bodyHtml

  const orderedLabels: string[] = []
  for (const reference of prepared.references) {
    if (!orderedLabels.includes(reference.label)) orderedLabels.push(reference.label)
  }
  for (const definition of prepared.definitions) {
    if (!orderedLabels.includes(definition.label)) orderedLabels.push(definition.label)
  }
  const numbers = new Map(orderedLabels.map((label, index) => [label, index + 1]))
  const occurrences = new Map<string, number>()
  const renderedBody = replaceReferenceTokens(bodyHtml, prepared.references, numbers, occurrences)
  const definitionByLabel = new Map(prepared.definitions.map((definition) => [definition.label, definition]))

  const items = orderedLabels.map((label) => {
    const definition = definitionByLabel.get(label)
    if (!definition) return ''
    const number = numbers.get(label)!
    let definitionHtml = renderDefinition(definition.content).trim() || '<p></p>'
    definitionHtml = replaceReferenceTokens(definitionHtml, prepared.references, numbers, occurrences)

    const count = prepared.references.filter((reference) => reference.label === label).length
    const backlinks = Array.from({ length: count }, (_, index) => {
      const occurrence = index + 1
      const refId = `fnref-${number}${occurrence > 1 ? `-${occurrence}` : ''}`
      return `<a class="md-link footnote-backref" href="#${refId}" data-footnote-backref="${escapeHtmlAttribute(label)}" aria-label="Back to reference ${number}">↩${count > 1 ? `<span>${occurrence}</span>` : ''}</a>`
    }).join(' ')

    return `<li id="fn-${number}" data-footnote-label="${escapeHtmlAttribute(label)}">${appendBacklinks(definitionHtml, backlinks)}</li>`
  }).filter(Boolean).join('')

  return `${renderedBody}<ol data-footnotes="true">${items}</ol>`
}

export function prepareHtmlFootnotes(html: string): PreparedHtmlFootnotes {
  const container = document.createElement('div')
  container.innerHTML = html
  const references: FootnoteReference[] = []

  container.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]').forEach((anchor) => {
    const label = anchor.getAttribute('data-footnote-ref') || ''
    if (!label) return
    const token = `${HTML_REF_PREFIX}${references.length}${HTML_REF_SUFFIX}`
    references.push({ label, token })
    anchor.replaceWith(document.createTextNode(token))
  })

  const definitions: Array<{ label: string; html: string }> = []
  container.querySelectorAll<HTMLOListElement>('ol[data-footnotes]').forEach((list) => {
    for (const child of Array.from(list.children)) {
      if (!(child instanceof HTMLElement) || child.tagName !== 'LI') continue
      const label = child.getAttribute('data-footnote-label') || ''
      if (!label) continue
      const clone = child.cloneNode(true) as HTMLElement
      clone.querySelectorAll('a[data-footnote-backref]').forEach((anchor) => anchor.remove())
      clone.querySelectorAll('p').forEach((paragraph) => {
        if (!paragraph.textContent?.trim() && paragraph.children.length === 0) paragraph.remove()
      })
      definitions.push({ label, html: clone.innerHTML })
    }
    list.remove()
  })

  return { html: container.innerHTML, definitions, references }
}

function restoreHtmlReferenceTokens(markdown: string, references: FootnoteReference[]): string {
  let result = markdown
  for (const reference of references) {
    result = result.replace(reference.token, `[^${reference.label}]`)
  }
  return result
}

function serializeDefinition(label: string, markdown: string): string {
  const lines = markdown.trim().split('\n')
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) return `[^${label}]:`
  return [`[^${label}]: ${lines[0]}`, ...lines.slice(1).map((line) => line ? `    ${line}` : '')].join('\n')
}

export function restoreFootnotesToMarkdown(
  bodyMarkdown: string,
  prepared: PreparedHtmlFootnotes,
  convertDefinition: (html: string) => string,
): string {
  const body = restoreHtmlReferenceTokens(bodyMarkdown, prepared.references).trim()
  const definitions = prepared.definitions.map((definition) => {
    const markdown = restoreHtmlReferenceTokens(convertDefinition(definition.html), prepared.references)
    return serializeDefinition(definition.label, markdown)
  })
  return [body, ...definitions].filter(Boolean).join('\n\n')
}
