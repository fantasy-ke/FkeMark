export type DocumentImageKind = 'local' | 'remote' | 'data' | 'blob'

export interface DocumentImage {
  src: string
  alt: string
  kind: DocumentImageKind
  occurrences: number
}

export type ImageFileNameError = 'empty' | 'invalid' | 'extension'

interface ImageSourceSpan {
  start: number
  end: number
  src: string
  alt: string
}

function maskCode(markdown: string): string {
  const chars = [...markdown]
  let offset = 0
  let fence: { marker: string; length: number } | null = null

  for (const line of markdown.split(/(?<=\n)/)) {
    const text = line.replace(/\r?\n$/, '')
    const fenceMatch = text.match(/^ {0,3}(`{3,}|~{3,})/)
    let shouldMask = Boolean(fence)

    if (!fence && fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length }
      shouldMask = true
    } else if (fence && new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`).test(text)) {
      shouldMask = true
      fence = null
    }

    if (shouldMask) {
      for (let i = offset; i < offset + line.length; i += 1) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
      }
    }
    offset += line.length
  }

  const withoutFences = chars.join('')
  const inlineCode = /(`+)([^\n]*?)\1/g
  let match: RegExpExecArray | null
  while ((match = inlineCode.exec(withoutFences))) {
    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
    }
  }

  return chars.join('')
}

function collectImageSourceSpans(markdown: string): ImageSourceSpan[] {
  const masked = maskCode(markdown)
  const spans: ImageSourceSpan[] = []
  const markdownImage = /!\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|((?:\\.|[^\s)\n])+))/g
  let match: RegExpExecArray | null

  while ((match = markdownImage.exec(masked))) {
    const src = match[2] ?? match[3]
    const relativeStart = match[0].lastIndexOf(src)
    spans.push({
      start: match.index + relativeStart,
      end: match.index + relativeStart + src.length,
      src: markdown.slice(match.index + relativeStart, match.index + relativeStart + src.length),
      alt: match[1],
    })
  }

  const htmlImage = /<img\b[^>]*>/gi
  while ((match = htmlImage.exec(masked))) {
    const originalTag = markdown.slice(match.index, match.index + match[0].length)
    const srcMatch = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(originalTag)
    if (!srcMatch) continue
    const src = srcMatch[2]
    const relativeStart = (srcMatch.index ?? 0) + srcMatch[0].lastIndexOf(src)
    const altMatch = /\balt\s*=\s*(["'])(.*?)\1/i.exec(originalTag)
    spans.push({
      start: match.index + relativeStart,
      end: match.index + relativeStart + src.length,
      src,
      alt: altMatch?.[2] ?? '',
    })
  }

  return spans.sort((a, b) => a.start - b.start)
}

export function getDocumentImageKind(src: string): DocumentImageKind {
  const value = src.trim()
  if (/^data:/i.test(value)) return 'data'
  if (/^blob:/i.test(value)) return 'blob'
  if (/^file:/i.test(value)) return 'local'
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return 'remote'
  return 'local'
}

export function extractDocumentImages(markdown: string): DocumentImage[] {
  const images = new Map<string, DocumentImage>()

  for (const span of collectImageSourceSpans(markdown)) {
    const existing = images.get(span.src)
    if (existing) {
      existing.occurrences += 1
      if (!existing.alt && span.alt) existing.alt = span.alt
      continue
    }
    images.set(span.src, {
      src: span.src,
      alt: span.alt,
      kind: getDocumentImageKind(span.src),
      occurrences: 1,
    })
  }

  return [...images.values()]
}

export function replaceDocumentImageSource(markdown: string, oldSrc: string, newSrc: string): string {
  const targets = collectImageSourceSpans(markdown)
    .filter((span) => span.src === oldSrc)
    .sort((a, b) => b.start - a.start)

  return targets.reduce(
    (content, span) => content.slice(0, span.start) + newSrc + content.slice(span.end),
    markdown,
  )
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(dot) : ''
}

export function createRenamedImageFileName(
  input: string,
  currentFileName: string,
): { value: string | null; error: ImageFileNameError | null } {
  const trimmed = input.trim()
  if (!trimmed) return { value: null, error: 'empty' }
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    /[<>:"/\\|?*\u0000-\u001F]/.test(trimmed) ||
    /[. ]$/.test(trimmed)
  ) {
    return { value: null, error: 'invalid' }
  }

  const currentExtension = extensionOf(currentFileName)
  const requestedExtension = extensionOf(trimmed)
  const value = requestedExtension ? trimmed : `${trimmed}${currentExtension}`
  if (currentExtension && extensionOf(value).toLowerCase() !== currentExtension.toLowerCase()) {
    return { value: null, error: 'extension' }
  }

  const stem = value.slice(0, value.length - extensionOf(value).length).toUpperCase()
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    return { value: null, error: 'invalid' }
  }

  return { value, error: null }
}

export function getImageFileName(src: string, fallbackIndex = 1): string {
  if (/^data:/i.test(src)) {
    const mime = /^data:image\/([a-z0-9.+-]+);/i.exec(src)?.[1]?.toLowerCase()
    const extension = mime === 'jpeg' ? 'jpg' : mime === 'svg+xml' ? 'svg' : mime || 'png'
    return `image-${fallbackIndex}.${extension}`
  }

  try {
    if (/^https?:\/\//i.test(src)) {
      const name = decodeURIComponent(new URL(src).pathname.split('/').pop() || '')
      if (name) return name
    }
  } catch { /* fall through */ }

  const clean = src.split(/[?#]/, 1)[0].replace(/\\/g, '/')
  return clean.split('/').pop() || `image-${fallbackIndex}.png`
}

export function renameImageReference(src: string, newFileName: string): string {
  const slash = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'))
  return slash >= 0 ? src.slice(0, slash + 1) + newFileName : newFileName
}

function decodePath(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

function normalizeJoinedPath(value: string, separator: '\\' | '/'): string {
  const normalized = value.replace(/[\\/]/g, separator)
  const isWindows = separator === '\\'
  const drive = isWindows ? normalized.match(/^[A-Za-z]:\\/)?.[0] ?? '' : ''
  const uncRoot = isWindows && normalized.startsWith('\\\\') ? '\\\\' : ''
  const root = drive || uncRoot || (!isWindows && normalized.startsWith('/') ? '/' : '')
  const rest = normalized.slice(root.length)
  const parts: string[] = []

  for (const part of rest.split(separator)) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length > 0) parts.pop()
      continue
    }
    parts.push(part)
  }

  return root + parts.join(separator)
}

export function resolveLocalImagePath(src: string, filePath: string | null): string | null {
  if (getDocumentImageKind(src) !== 'local') return null
  let value = decodePath(src.trim().replace(/^<|>$/g, ''))

  if (/^file:\/\//i.test(value)) {
    try {
      value = decodePath(new URL(value).pathname)
      if (/^\/[A-Za-z]:\//.test(value)) value = value.slice(1)
    } catch { return null }
  }

  const isWindows = /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || Boolean(filePath?.includes('\\'))
  const separator = isWindows ? '\\' : '/'
  const isAbsolute = /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/')
  if (isAbsolute) return normalizeJoinedPath(value, separator)
  if (!filePath) return null

  const normalizedFile = filePath.replace(/[\\/]/g, separator)
  const slash = normalizedFile.lastIndexOf(separator)
  if (slash < 0) return null
  return normalizeJoinedPath(`${normalizedFile.slice(0, slash)}${separator}${value}`, separator)
}
