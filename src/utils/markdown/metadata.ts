import { parse } from 'yaml'
import { prepareMarkdownForRendering } from './normalize'

const TAG_TOKEN_PREFIX = '\uE100FKTAG'
const TAG_TOKEN_SUFFIX = '\uE101'
const tagStartPattern = /[\p{L}\p{N}]/u
const tagCharPattern = /[\p{L}\p{N}_-]/u
const tagBoundaryPattern = /[\s([{<'"“‘（【《，。！？、；：]/u

interface DocumentTagToken {
  tag: string
  token: string
}

export interface PreparedDocumentTags {
  body: string
  tags: string[]
  tokens: DocumentTagToken[]
}

export interface DocumentMetadata {
  rawFrontMatter: string | null
  frontMatter: Record<string, unknown>
  frontMatterTags: string[]
  inlineTags: string[]
  tags: string[]
  parseError: string | null
}

function isFence(line: string): { marker: '`' | '~'; length: number } | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return { marker: match[1][0] as '`' | '~', length: match[1].length }
}

function isFenceClose(line: string, fence: { marker: '`' | '~'; length: number }): boolean {
  const marker = fence.marker === '`' ? '`' : '~'
  return new RegExp(`^ {0,3}${marker}{${fence.length},}\\s*$`).test(line)
}

function isLinkDestination(line: string, hashIndex: number): boolean {
  const prefix = line.slice(0, hashIndex)
  const open = prefix.lastIndexOf('](')
  return open >= 0 && prefix.lastIndexOf(')') < open
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter((tag) => {
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function tokenizeTagLine(line: string, tokens: DocumentTagToken[]): string {
  if (/^(?: {4}|\t)/.test(line)) return line
  if (/^ {0,3}(?:> ?)*#{1,6}(?:\s|$)/.test(line)) return line

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

    if (line[index] === '#') {
      const previous = index > 0 ? line[index - 1] : ''
      const boundary = index === 0 || tagBoundaryPattern.test(previous)
      const first = line[index + 1] || ''
      if (boundary && tagStartPattern.test(first) && !isLinkDestination(line, index)) {
        let end = index + 2
        while (end < line.length && tagCharPattern.test(line[end])) end++
        while (end > index + 2 && line[end - 1] === '-') end--
        const tag = line.slice(index + 1, end)
        const token = `${TAG_TOKEN_PREFIX}${tokens.length}${TAG_TOKEN_SUFFIX}`
        tokens.push({ tag, token })
        result += token
        index = end
        continue
      }
    }

    result += line[index]
    index++
  }

  return result
}

export function prepareDocumentTags(markdown: string): PreparedDocumentTags {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const tokens: DocumentTagToken[] = []
  let fence: { marker: '`' | '~'; length: number } | null = null

  const body = lines.map((line) => {
    const marker = isFence(line)
    if (fence) {
      if (isFenceClose(line, fence)) fence = null
      return line
    }
    if (marker) {
      fence = marker
      return line
    }
    return tokenizeTagLine(line, tokens)
  }).join('\n')

  return { body, tokens, tags: uniqueTags(tokens.map(({ tag }) => tag)) }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderDocumentTagsHtml(html: string, prepared: PreparedDocumentTags): string {
  let result = html
  for (const { tag, token } of prepared.tokens) {
    const escaped = escapeHtml(tag)
    result = result.replace(token, `<span class="md-tag" data-doc-tag="${escaped}">#${escaped}</span>`)
  }
  return result
}

function normalizeFrontMatterTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizeFrontMatterTags)
  if (typeof value !== 'string' && typeof value !== 'number') return []
  return String(value)
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
}

export function extractDocumentMetadata(markdown: string): DocumentMetadata {
  const prepared = prepareMarkdownForRendering(markdown)
  const inlineTags = prepareDocumentTags(prepared.body).tags
  let frontMatter: Record<string, unknown> = {}
  let parseError: string | null = null

  if (prepared.frontMatter !== null) {
    try {
      const value: unknown = parse(prepared.frontMatter)
      if (value === null || value === undefined) {
        frontMatter = {}
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        frontMatter = value as Record<string, unknown>
      } else {
        parseError = 'YAML Front Matter 根节点必须是对象'
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }
  }

  const frontMatterTags = uniqueTags([
    ...normalizeFrontMatterTags(frontMatter.tags),
    ...normalizeFrontMatterTags(frontMatter.tag),
  ])

  return {
    rawFrontMatter: prepared.frontMatter,
    frontMatter,
    frontMatterTags,
    inlineTags,
    tags: uniqueTags([...frontMatterTags, ...inlineTags]),
    parseError,
  }
}