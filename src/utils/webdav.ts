export function buildWebdavFileUrl(baseUrl: string, root: string, fileName: string): string {
  const url = new URL(baseUrl.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('WebDAV URL must use HTTP or HTTPS')
  }

  const rootSegments = root.trim().split(/[\\/]+/u).filter(Boolean)
  if (rootSegments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('WebDAV root contains an invalid path segment')
  }
  const normalizedFileName = fileName.trim()
  if (!normalizedFileName || /[\\/]/u.test(normalizedFileName) || normalizedFileName === '.' || normalizedFileName === '..') {
    throw new Error('WebDAV file name must be a single file name')
  }

  const basePath = url.pathname.replace(/\/+$/u, '')
  const encodedPath = [...rootSegments, normalizedFileName].map((segment) => encodeURIComponent(segment)).join('/')
  url.pathname = `${basePath}/${encodedPath}`
  return url.toString()
}
