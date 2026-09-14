import { describe, expect, it } from 'vitest'
import { tokenizeMarkdownSyntax } from '../src/components/editor/MarkdownSyntaxHighlightOverlay'
import { AUTO_SAVE_INTERVAL_OPTIONS, formatAutoSaveInterval, normalizeAutoSaveInterval } from '../src/utils/autoSave'
import { buildWebdavFileUrl } from '../src/utils/webdav'

describe('工作区增强功能', () => {
  it('提供三档自动保存间隔并归一化旧值', () => {
    expect(AUTO_SAVE_INTERVAL_OPTIONS).toEqual([300, 1000, 5000])
    expect(normalizeAutoSaveInterval(260)).toBe(300)
    expect(normalizeAutoSaveInterval(1800)).toBe(1000)
    expect(formatAutoSaveInterval(300, 'zh-CN')).toBe('300 毫秒')
    expect(formatAutoSaveInterval(5000, 'en')).toBe('5 s')
  })

  it('只为 Markdown 控制符着色，围栏代码正文保持原样', () => {
    const segments = tokenizeMarkdownSyntax('## 标题 **重点**\n```ts\n**代码**\n```')
    expect(segments.filter((segment) => segment.token).map((segment) => [segment.text, segment.token])).toEqual([
      ['##', 'heading'],
      ['**', 'delimiter'],
      ['**', 'delimiter'],
      ['```', 'fence'],
      ['```', 'fence'],
    ])
  })

  it('安全拼接 WebDAV 主目录和文件名并编码路径', () => {
    const url = new URL(buildWebdavFileUrl('https://dav.example.com/dav/', 'Fke Mark', '笔记.md'))
    expect(url.protocol).toBe('https:')
    expect(url.pathname).toBe('/dav/Fke%20Mark/%E7%AC%94%E8%AE%B0.md')
    expect(() => buildWebdavFileUrl('file:///tmp', 'notes', 'a.md')).toThrow()
    expect(() => buildWebdavFileUrl('https://dav.example.com', 'notes', '../a.md')).toThrow()
  })
})
