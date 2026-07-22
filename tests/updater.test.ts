import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, parseSha256Sums } from '../src/utils/updater'

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
})
