import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import type { AppSettings } from '../src/types'
import { getImageMimeType, SMMS_UPLOAD_ENDPOINT, uploadImageFile } from '../src/utils/imageUpload'

const settings = (patch: Partial<AppSettings>): AppSettings => ({ ...DEFAULT_SETTINGS, ...patch })
const imageFile = () => new File([new Uint8Array([1, 2, 3])], 'sample image.png', { type: 'image/png' })

describe('image upload', () => {
  it('keeps local assets as the default mode', () => {
    expect(DEFAULT_SETTINGS.imageUploadMode).toBe('local')
    expect(DEFAULT_SETTINGS.smmsUploadUrl).toBe(SMMS_UPLOAD_ENDPOINT)
  })

  it('encodes an image as a Base64 data URL', async () => {
    const result = await uploadImageFile(imageFile(), settings({ imageUploadMode: 'base64' }))

    expect(result.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('uploads to SM.MS with the expected field and token', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { url: 'https://cdn.example.com/a.png' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await uploadImageFile(
      imageFile(),
      settings({ imageUploadMode: 'smms', smmsToken: 'secret-token' }),
      request,
    )

    expect(result).toBe('https://cdn.example.com/a.png')
    expect(request).toHaveBeenCalledOnce()
    const [url, init] = request.mock.calls[0]
    expect(url).toBe(SMMS_UPLOAD_ENDPOINT)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ Authorization: 'secret-token' })
    expect((init?.body as FormData).get('smfile')).toBeInstanceOf(File)
  })

  it('uses the configured SM.MS upload URL', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ data: { url: 'https://cdn.example.com/custom-smms.png' } }), { status: 200 }))

    const result = await uploadImageFile(
      imageFile(),
      settings({ imageUploadMode: 'smms', smmsToken: 'secret-token', smmsUploadUrl: 'https://proxy.example.com/smms/upload' }),
      request,
    )

    expect(result).toBe('https://cdn.example.com/custom-smms.png')
    expect(request.mock.calls[0][0]).toBe('https://proxy.example.com/smms/upload')
  })

  it('supports a custom multipart endpoint and relative response URL', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ data: { url: '/public/image.png' } }), { status: 201 }))

    const result = await uploadImageFile(
      imageFile(),
      settings({
        imageUploadMode: 'custom',
        customImageUploadUrl: 'https://upload.example.com/api/images',
        customImageUploadToken: 'custom-token',
      }),
      request,
    )

    expect(result).toBe('https://upload.example.com/public/image.png')
    const [, init] = request.mock.calls[0]
    expect(init?.headers).toEqual({ Authorization: 'Bearer custom-token' })
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('uploads with WebDAV PUT and returns the matching public URL', async () => {
    const request = vi.fn(async () => new Response('', { status: 201 }))

    const result = await uploadImageFile(
      imageFile(),
      settings({
        imageUploadMode: 'webdav',
        webdavUrl: 'https://dav.example.com/images',
        webdavPublicUrl: 'https://cdn.example.com/shared',
        webdavUsername: 'user',
        webdavPassword: 'pass',
      }),
      request,
    )

    const [url, init] = request.mock.calls[0]
    expect(url.startsWith('https://dav.example.com/images/')).toBe(true)
    expect(new URL(url).pathname.split('/').pop()).toMatch(/^\d+-/)
    expect(init?.method).toBe('PUT')
    expect(init?.headers).toMatchObject({
      Authorization: 'Basic dXNlcjpwYXNz',
      'Content-Type': 'image/png',
    })
    expect(init?.body).toBeInstanceOf(File)
    expect(result.replace('https://cdn.example.com/shared/', '')).toBe(url.replace('https://dav.example.com/images/', ''))
  })

  it('rejects missing provider configuration and non-HTTP endpoints', async () => {
    await expect(uploadImageFile(imageFile(), settings({ imageUploadMode: 'smms' }))).rejects.toThrow('SM.MS token is required')
    await expect(uploadImageFile(imageFile(), settings({ imageUploadMode: 'custom', customImageUploadUrl: 'file:///tmp/upload' }))).rejects.toThrow('must use HTTP or HTTPS')
  })

  it('detects common image MIME types for disk drops', () => {
    expect(getImageMimeType('cover.JPG')).toBe('image/jpeg')
    expect(getImageMimeType('diagram.svg')).toBe('image/svg+xml')
    expect(getImageMimeType('unknown.bin')).toBe('application/octet-stream')
  })
})
