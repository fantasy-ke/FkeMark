import type { FileTreeNode } from '../../types'

const WIKI_HREF_PREFIX = '#fkemark-wiki:'
const MARKDOWN_FILE_RE = /\.(?:md|markdown)$/i

export interface WikiLinkOccurrence {
  target: string
  line: number
  context: string
}

export interface WikiBacklink extends WikiLinkOccurrence {
  filePath: string
  noteName: string
}

interface MarkdownFileContent {
  path: string
  content: string
}

function encodeWikiTarget(target: string): string {
  return encodeURIComponent(target).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
}

function noteKey(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(MARKDOWN_FILE_RE, '')
    .toLocaleLowerCase()
}

function noteNameFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop() || path
  return name.replace(MARKDOWN_FILE_RE, '')
}

function isValidWikiTarget(target: string): boolean {
  return target.length > 0 && !/[\[\]\r\n]/.test(target)
}

function scanInlineWikiLinks(
  line: string,
  lineNumber: number,
  replace: (target: string, occurrence: WikiLinkOccurrence) => string
): string {
  let result = ''
  let index = 0

  while (index < line.length) {
    if (line[index] === '\\' && index + 1 < line.length) {
      result += line.slice(index, index + 2)
      index += 2
      continue
    }

    if (line[index] === '`') {
      let ticks = 1
      while (line[index + ticks] === '`') ticks += 1
      const marker = '`'.repeat(ticks)
      const end = line.indexOf(marker, index + ticks)
      if (end >= 0) {
        result += line.slice(index, end + ticks)
        index = end + ticks
        continue
      }
    }

    if (line.startsWith('[[', index)) {
      const end = line.indexOf(']]', index + 2)
      if (end >= 0) {
        const target = line.slice(index + 2, end).trim()
        if (isValidWikiTarget(target)) {
          const occurrence = {
            target,
            line: lineNumber,
            context: line.trim().replace(/\s+/g, ' ').slice(0, 180),
          }
          result += replace(target, occurrence)
          index = end + 2
          continue
        }
      }
    }

    result += line[index]
    index += 1
  }

  return result
}

function mapWikiLinks(
  markdown: string,
  replace: (target: string, occurrence: WikiLinkOccurrence) => string
): string {
  const parts = markdown.split(/(\r?\n)/)
  let fence: { marker: string; length: number } | null = null
  let lineNumber = 1

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    const match = line.match(/^\s*(`{3,}|~{3,})/)
    if (match) {
      const marker = match[1][0]
      if (!fence) fence = { marker, length: match[1].length }
      else if (fence.marker === marker && match[1].length >= fence.length) fence = null
    } else if (!fence) {
      parts[index] = scanInlineWikiLinks(line, lineNumber, replace)
    }
    lineNumber += 1
  }

  return parts.join('')
}

export function wikiTargetToHref(target: string): string {
  return `${WIKI_HREF_PREFIX}${encodeWikiTarget(target.trim())}`
}

export function getWikiTargetFromHref(href: string): string | null {
  if (!href.startsWith(WIKI_HREF_PREFIX)) return null
  try {
    const target = decodeURIComponent(href.slice(WIKI_HREF_PREFIX.length)).trim()
    return isValidWikiTarget(target) ? target : null
  } catch {
    return null
  }
}

export function prepareWikiLinksForRendering(markdown: string): string {
  return mapWikiLinks(markdown, (target) => {
    const label = target.replace(/([\\[\]*_`~])/g, '\\$1')
    return `[${label}](${wikiTargetToHref(target)})`
  })
}

export function restoreWikiLinksFromMarkdown(markdown: string): string {
  return markdown.replace(
    /\[((?:\\.|[^\]])*)\]\((#fkemark-wiki:[^)\s]+)\)/g,
    (full, _label: string, href: string) => {
      const target = getWikiTargetFromHref(href)
      return target ? `[[${target}]]` : full
    }
  )
}

export function findWikiLinkOccurrences(markdown: string): WikiLinkOccurrence[] {
  const occurrences: WikiLinkOccurrence[] = []
  mapWikiLinks(markdown, (target, occurrence) => {
    occurrences.push(occurrence)
    return `[[${target}]]`
  })
  return occurrences
}

export function flattenMarkdownFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'folder') return flattenMarkdownFiles(node.children || [])
    return MARKDOWN_FILE_RE.test(node.path) ? [node] : []
  })
}

function resolveWikiNotePath(paths: string[], target: string): string | null {
  const targetKey = noteKey(target)
  if (!targetKey) return null

  if (targetKey.includes('/')) {
    const byPath = paths.find((path) => {
      const pathKey = noteKey(path)
      return pathKey === targetKey || pathKey.endsWith(`/${targetKey}`)
    })
    if (byPath) return byPath
  }

  const targetName = targetKey.split('/').pop()
  return paths.find((path) => noteKey(noteNameFromPath(path)) === targetName) || null
}

export function findWikiNotePath(nodes: FileTreeNode[], target: string): string | null {
  return resolveWikiNotePath(flattenMarkdownFiles(nodes).map((node) => node.path), target)
}

export function buildBacklinks(files: MarkdownFileContent[], currentFile: string): WikiBacklink[] {
  const paths = files.map((file) => file.path)
  const currentPath = normalizePath(currentFile)

  return files.flatMap((file) => {
    if (normalizePath(file.path) === currentPath) return []
    return findWikiLinkOccurrences(file.content)
      .filter((link) => normalizePath(resolveWikiNotePath(paths, link.target) || '') === currentPath)
      .map((link) => ({ ...link, filePath: file.path, noteName: noteNameFromPath(file.path) }))
  })
}