import type { AppSettings } from '../types'
import { isTauri } from './tauri'

export const SMMS_UPLOAD_ENDPOINT = 'https://sm.ms/api/v2/upload'

type ImageRequest = (input: string, init?: RequestInit) => Promise<Response>

export async function uploadImageFile(
  file: File,
  settings: AppSettings,
  request: ImageRequest = requestImage
): Promise<string> {
  switch (settings.imageUploadMode) {
    case 'base64':
      return fileToDataUrl(file)
    case 'smms': {
      const endpoint = requireHttpUrl(settings.smmsUploadUrl || SMMS_UPLOAD_ENDPOINT, 'SM.MS upload URL')
      return uploadMultipart(
        endpoint,
        file,
        'smfile',
        { Authorization: requireValue(settings.smmsToken, 'SM.MS token') },
        request
      )
    }
    case 'custom': {
      const endpoint = requireHttpUrl(settings.customImageUploadUrl, 'Custom upload URL')
      const headers = settings.customImageUploadToken.trim()
        ? { Authorization: `Bearer ${settings.customImageUploadToken.trim()}` }
        : undefined
      return uploadMultipart(endpoint, file, 'file', headers, request)
    }
    case 'webdav':
      return uploadWebdav(file, settings, request)
    case 'local':
      throw new Error('Local images must be saved through the document asset workflow')
  }
}

export function getImageMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    avif: 'image/avif',
    bmp: 'image/bmp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  }
  return (extension && mimeTypes[extension]) || 'application/octet-stream'
}

async function uploadMultipart(
  endpoint: string,
  file: File,
  fieldName: string,
  headers: Record<string, string> | undefined,
  request: ImageRequest
): Promise<string> {
  const formData = new FormData()
  formData.append(fieldName, file, file.name)
  const response = await request(endpoint, { method: 'POST', headers, body: formData })
  await ensureSuccess(response)
  return extractUploadedUrl(response, endpoint)
}

async function uploadWebdav(
  file: File,
  settings: AppSettings,
  request: ImageRequest
): Promise<string> {
  const endpoint = requireHttpUrl(settings.webdavUrl, 'WebDAV URL')
  const uploadName = `${Date.now()}-${file.name || 'image'}`
  const uploadUrl = appendFileName(endpoint, uploadName)
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' }
  if (settings.webdavUsername || settings.webdavPassword) {
    headers.Authorization = `Basic ${toBase64(`${settings.webdavUsername}:${settings.webdavPassword}`)}`
  }
  const response = await request(uploadUrl, { method: 'PUT', headers, body: file })
  await ensureSuccess(response)
  const publicBase = settings.webdavPublicUrl.trim()
    ? requireHttpUrl(settings.webdavPublicUrl, 'WebDAV public URL')
    : endpoint
  return appendFileName(publicBase, uploadName)
}

async function extractUploadedUrl(response: Response, endpoint: string): Promise<string> {
  const location = response.headers.get('location')
  if (location) return resolveHttpUrl(location, endpoint)

  const text = await response.text()
  let value: unknown = text.trim()
  try {
    value = JSON.parse(text)
  } catch {
    // Plain-text URLs are supported by custom upload endpoints.
  }
  const uploadedUrl = findUrl(value)
  if (!uploadedUrl) throw new Error('Upload response did not contain an image URL')
  return resolveHttpUrl(uploadedUrl, endpoint)
}

function findUrl(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item)
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null

  const object = value as Record<string, unknown>
  for (const key of ['url', 'link', 'src', 'display_url']) {
    if (typeof object[key] === 'string' && object[key].trim()) return object[key].trim()
  }
  for (const key of ['data', 'image', 'images', 'result']) {
    const found = findUrl(object[key])
    if (found) return found
  }
  return null
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return
  const detail = await response.text().catch(() => '')
  throw new Error(`Image upload failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
}

function appendFileName(baseUrl: string, fileName: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(encodeURIComponent(fileName), normalized).toString()
}

function resolveHttpUrl(value: string, endpoint: string): string {
  return requireHttpUrl(new URL(value, endpoint).toString(), 'Uploaded image URL')
}

function requireHttpUrl(value: string, label: string): string {
  const trimmed = requireValue(value, label)
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`${label} is invalid`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTP or HTTPS`)
  }
  return url.toString()
}

function requireValue(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function requestImage(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      return await tauriFetch(input, init)
    } catch {
      // Browser fetch remains useful in dev mode and as a plugin fallback.
    }
  }
  return fetch(input, init)
}
