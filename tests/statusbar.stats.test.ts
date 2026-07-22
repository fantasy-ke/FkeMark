import { describe, expect, it } from 'vitest'
import {
  formatLastSavedTime,
  getDocumentSyncStatus,
  getDocumentStatistics,
  getSyncStatusKey,
} from '../src/utils/documentStats'

describe('状态栏文档统计', () => {
  it('统计正文中的中英文内容并忽略 Front Matter、图片地址和围栏代码', () => {
    const markdown = [
      '---',
      'title: 测试文档',
      'tags: [status]',
      '---',
      '# 标题',
      '',
      'Hello world!',
      '',
      '[链接文本](https://example.com/path)',
      '',
      '![封面](./assets/cover.png)',
      '',
      '`inline code`',
      '',
      '```ts',
      'const ignored = true',
      '```',
    ].join('\n')

    expect(getDocumentStatistics(markdown)).toEqual({
      wordCount: 10,
      readingMinutes: 1,
    })
  })

  it('按中英文阅读速度估算阅读时长，空文档为零', () => {
    expect(getDocumentStatistics('').readingMinutes).toBe(0)
    expect(getDocumentStatistics('文'.repeat(300)).readingMinutes).toBe(1)
    expect(getDocumentStatistics('文'.repeat(301)).readingMinutes).toBe(2)
    expect(getDocumentStatistics(Array.from({ length: 201 }, (_, index) => `word${index}`).join(' ')).readingMinutes).toBe(2)
  })
})

describe('状态栏保存信息', () => {
  it('当天只显示时间，跨天显示完整日期和时间', () => {
    const now = new Date(2026, 6, 22, 18, 30).getTime()
    expect(formatLastSavedTime(new Date(2026, 6, 22, 9, 5).getTime(), now)).toBe('09:05')
    expect(formatLastSavedTime(new Date(2026, 6, 21, 23, 8).getTime(), now)).toBe('2026-07-21 23:08')
    expect(formatLastSavedTime(null, now)).toBeNull()
  })

  it('未落盘或已修改的文档保持待同步状态', () => {
    expect(getDocumentSyncStatus(false, null)).toBe('unsaved')
    expect(getDocumentSyncStatus(true, 'D:/docs/note.md')).toBe('unsaved')
    expect(getDocumentSyncStatus(false, 'D:/docs/note.md')).toBe('saved')
  })

  it('为各保存阶段返回明确的同步状态文案键', () => {
    expect(getSyncStatusKey('saved')).toBe('status.sync.synced')
    expect(getSyncStatusKey('saving')).toBe('status.sync.syncing')
    expect(getSyncStatusKey('unsaved')).toBe('status.sync.pending')
    expect(getSyncStatusKey('error')).toBe('status.sync.error')
  })
})
