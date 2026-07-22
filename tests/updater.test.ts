import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, isAllowedExternalUrl, parseSha256Sums } from '../src/utils/updater'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('更新包 SHA256SUMS 解析', () => {
  it('支持 sha256sum 的文本与二进制标记格式', () => {
    const firstHash = 'a'.repeat(64)
    const secondHash = 'B'.repeat(64)
    const checksums = parseSha256Sums(
      `${firstHash}  FkeMark_0.1.2_x64-setup.exe\n${secondHash} *FkeMark 0.1.2_x64.msi`
    )

    expect(checksums.get('FkeMark_0.1.2_x64-setup.exe')).toBe(firstHash)
    expect(checksums.get('FkeMark 0.1.2_x64.msi')).toBe(secondHash.toLowerCase())
  })

  it('移除相对路径前缀并忽略无效行', () => {
    const hash = 'c'.repeat(64)
    const checksums = parseSha256Sums(
      `invalid checksum\n${hash}  ./FkeMark.AppImage\n1234  ignored.exe`
    )

    expect(checksums).toEqual(new Map([['FkeMark.AppImage', hash]]))
  })

  it('旧版更新清单缺少哈希时从同版本 SHA256SUMS 回填', async () => {
    const hash = 'd'.repeat(64)
    const fileName = 'FkeMark_0.1.2_x64-setup.exe'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/latest.json')) {
        return new Response(JSON.stringify({
          version: '0.1.2',
          tagName: 'v0.1.2',
          pubDate: '2026-07-18T00:00:00Z',
          downloads: {
            windows: { name: fileName, url: `https://example.com/${fileName}`, size: 1024 },
          },
        }), { status: 200 })
      }
      if (url.endsWith('/v0.1.2/SHA256SUMS')) {
        return new Response(`${hash}  ${fileName}\n`, { status: 200 })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const update = await checkForUpdate('latest', '0.1.1')

    expect(update?.downloads.windows?.sha256).toBe(hash)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('Dev 固定标签请求绕过上一轮发布缓存', async () => {
    const staleHash = 'e'.repeat(64)
    const currentHash = 'f'.repeat(64)
    const fileName = 'FkeMark-dev-bbbbbbb-windows-x64-setup.exe'
    const manifestBase = 'https://github.com/fantasy-ke/FkeMark/releases/download/dev-latest/dev.json'
    const requestedUrls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url === manifestBase) {
        return new Response(JSON.stringify({
          version: 'dev-aaaaaaa',
          tagName: 'dev-latest',
          pubDate: '2026-07-22T00:00:00Z',
          downloads: {
            windows: { name: 'stale.exe', url: 'https://example.com/stale.exe', size: 512, sha256: staleHash },
          },
        }), { status: 200 })
      }
      if (url.startsWith(`${manifestBase}?`)) {
        return new Response(JSON.stringify({
          version: 'dev-bbbbbbb',
          tagName: 'dev-latest',
          pubDate: '2026-07-22T01:00:00Z',
          downloads: {
            windows: { name: fileName, url: `https://example.com/${fileName}`, size: 1024, sha256: currentHash },
          },
        }), { status: 200 })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const update = await checkForUpdate('dev', 'dev-0000000')

    expect(update?.version).toBe('dev-bbbbbbb')
    expect(update?.downloads.windows?.sha256).toBe(currentHash)
    expect(requestedUrls[0]).toMatch(/\/dev\.json\?cache=\d+$/)
  })

  it('GitHub API 降级时通过资源接口读取 SHA256SUMS', async () => {
    const hash = '1'.repeat(64)
    const fileName = 'FkeMark-dev-ccccccc-windows-x64-setup.exe'
    const checksumApiUrl = 'https://api.github.com/repos/fantasy-ke/FkeMark/releases/assets/2'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/releases/download/dev-latest/dev.json')) {
        return new Response('', { status: 404 })
      }
      if (url.endsWith('/releases/tags/dev-latest')) {
        return new Response(JSON.stringify({
          tag_name: 'dev-latest',
          name: 'Dev Build (dev-ccccccc)',
          published_at: '2026-07-22T02:00:00Z',
          body: '',
          html_url: 'https://github.com/fantasy-ke/FkeMark/releases/tag/dev-latest',
          prerelease: true,
          assets: [
            {
              name: fileName,
              url: 'https://api.github.com/repos/fantasy-ke/FkeMark/releases/assets/1',
              browser_download_url: `https://github.com/fantasy-ke/FkeMark/releases/download/dev-latest/${fileName}`,
              content_type: 'application/octet-stream',
              size: 1024,
            },
            {
              name: 'SHA256SUMS',
              url: checksumApiUrl,
              browser_download_url: 'https://github.com/fantasy-ke/FkeMark/releases/download/dev-latest/SHA256SUMS',
              content_type: 'text/plain',
              size: 80,
            },
          ],
        }), { status: 200 })
      }
      if (url === checksumApiUrl) {
        expect(new Headers(init?.headers).get('Accept')).toBe('application/octet-stream')
        return new Response(`${hash}  ${fileName}\n`, { status: 200 })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const update = await checkForUpdate('dev', 'dev-0000000')

    expect(update?.downloads.windows?.sha256).toBe(hash)
    expect(fetchMock).toHaveBeenCalledWith(
      checksumApiUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/octet-stream' }),
      })
    )
  })
})

describe('外部链接协议校验', () => {
  it('仅允许 HTTP、HTTPS 和邮件链接交由系统应用打开', () => {
    expect(isAllowedExternalUrl('https://example.com/docs')).toBe(true)
    expect(isAllowedExternalUrl(' HTTP://example.com ')).toBe(true)
    expect(isAllowedExternalUrl('mailto:feedback@example.com')).toBe(true)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('data:text/html,test')).toBe(false)
    expect(isAllowedExternalUrl('/relative/path')).toBe(false)
  })
})
