import { describe, expect, it } from 'vitest'
import {
  createRenamedImageFileName,
  extractDocumentImages,
  renameImageReference,
  replaceDocumentImageSource,
  resolveLocalImagePath,
} from '../src/utils/imageManager'

describe('文档图片清单', () => {
  it('提取 Markdown 与 HTML 图片，去重并统计引用次数', () => {
    const markdown = [
      '![封面](./assets/cover.png "封面")',
      '',
      '<img src="https://example.com/banner.jpg" alt="横幅">',
      '',
      '再次使用 ![缩略图](./assets/cover.png)',
      '',
      '`![代码](ignored.png)`',
      '',
      '```md',
      '![代码块](ignored-too.png)',
      '```',
    ].join('\n')

    expect(extractDocumentImages(markdown)).toEqual([
      {
        src: './assets/cover.png',
        alt: '封面',
        kind: 'local',
        occurrences: 2,
      },
      {
        src: 'https://example.com/banner.jpg',
        alt: '横幅',
        kind: 'remote',
        occurrences: 1,
      },
    ])
  })

  it('识别 data 与 blob 图片来源', () => {
    const markdown = '![内嵌](data:image/png;base64,AAAA)\n\n![临时](blob:https://example.com/uuid)'

    expect(extractDocumentImages(markdown).map((image) => image.kind)).toEqual(['data', 'blob'])
    expect(extractDocumentImages('![CDN](//cdn.example.com/image.png)')[0].kind).toBe('remote')
  })
})

describe('文档图片引用更新', () => {
  it('只替换图片引用，不改动普通链接、代码和相似路径', () => {
    const markdown = [
      '![封面](./assets/cover.png "封面")',
      '[下载](./assets/cover.png)',
      '![缩略图](./assets/cover.png)',
      '![其他](./assets/cover.png.bak)',
      '<img alt="HTML" src="./assets/cover.png">',
      '`![代码](./assets/cover.png)`',
    ].join('\n')

    expect(replaceDocumentImageSource(markdown, './assets/cover.png', './assets/renamed.png')).toBe([
      '![封面](./assets/renamed.png "封面")',
      '[下载](./assets/cover.png)',
      '![缩略图](./assets/renamed.png)',
      '![其他](./assets/cover.png.bak)',
      '<img alt="HTML" src="./assets/renamed.png">',
      '`![代码](./assets/cover.png)`',
    ].join('\n'))
  })

  it('保留原目录写法并只修改文件名', () => {
    expect(renameImageReference('./assets/cover.png', 'hero.png')).toBe('./assets/hero.png')
    expect(renameImageReference('assets\\cover.png', 'hero.png')).toBe('assets\\hero.png')
  })
})

describe('本地图片文件名与路径', () => {
  it('省略扩展名时沿用原扩展名，并拒绝非法或变更扩展名', () => {
    expect(createRenamedImageFileName('hero', 'cover.png')).toEqual({ value: 'hero.png', error: null })
    expect(createRenamedImageFileName('hero.png', 'cover.png')).toEqual({ value: 'hero.png', error: null })
    expect(createRenamedImageFileName('../hero.png', 'cover.png').error).toBe('invalid')
    expect(createRenamedImageFileName('hero.jpg', 'cover.png').error).toBe('extension')
  })

  it('相对图片地址按当前文档目录解析为本地路径', () => {
    expect(resolveLocalImagePath('./assets/cover.png', 'D:\\notes\\post.md')).toBe('D:\\notes\\assets\\cover.png')
    expect(resolveLocalImagePath('https://example.com/cover.png', 'D:\\notes\\post.md')).toBeNull()
    expect(resolveLocalImagePath('./assets/cover.png', null)).toBeNull()
    expect(resolveLocalImagePath('\\\\server\\share\\cover.png', 'D:\\notes\\post.md')).toBe('\\\\server\\share\\cover.png')
  })
})
