export function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || path
}

export function replacePathPrefix(path: string, oldPath: string, newPath: string): string | null {
  const source = path.replace(/\\/g, '/')
  const oldBase = oldPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const sourceKey = source.replace(/\/+$/, '').toLowerCase()
  const oldKey = oldBase.toLowerCase()

  if (sourceKey === oldKey) return newPath
  if (!sourceKey.startsWith(`${oldKey}/`)) return null

  const separator = newPath.includes('\\') && !newPath.includes('/') ? '\\' : '/'
  const cleanNewPath = newPath.replace(/[\\/]+$/, '')
  const suffix = source.slice(oldBase.length).replace(/\//g, separator)
  return `${cleanNewPath}${suffix}`
}

export function isSamePathOrDescendant(path: string, basePath: string): boolean {
  return replacePathPrefix(path, basePath, basePath) !== null
}

export function pathsEqual(a: string, b: string): boolean {
  return isSamePathOrDescendant(a, b) && isSamePathOrDescendant(b, a)
}

export function withPreservedMarkdownExtension(oldName: string, newName: string): string {
  const ext = oldName.match(/(\.(?:md|markdown))$/i)?.[1]
  if (!ext || /\.(?:md|markdown)$/i.test(newName)) return newName
  return `${newName}${ext}`
}
