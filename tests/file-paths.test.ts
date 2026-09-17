import { describe, expect, it } from 'vitest'
import { getBaseName, isSamePathOrDescendant, isUnsafeFileName, joinPath, pathsEqual, replacePathPrefix, withMarkdownExtension, withPreservedMarkdownExtension } from '../src/utils/filePaths'

describe('file path helpers', () => {
  it('replaces an exact path or a descendant path only', () => {
    expect(replacePathPrefix('D:/notes/docs/a.md', 'D:/notes/docs', 'D:/notes/archive'))
      .toBe('D:/notes/archive/a.md')
    expect(replacePathPrefix('D:/notes/docs', 'D:/notes/docs', 'D:/notes/archive'))
      .toBe('D:/notes/archive')
    expect(replacePathPrefix('D:/notes/docs-other/a.md', 'D:/notes/docs', 'D:/notes/archive'))
      .toBeNull()
  })

  it('recognizes descendants and extracts basenames across separators', () => {
    expect(isSamePathOrDescendant('D:/notes/docs/a.md', 'D:/notes/docs')).toBe(true)
    expect(isSamePathOrDescendant('D:/notes/docs-other/a.md', 'D:/notes/docs')).toBe(false)
    expect(getBaseName('D:\\notes\\docs\\a.md')).toBe('a.md')
  })

  it('compares paths across separators and case', () => {
    expect(pathsEqual('D:/notes/a.md', 'D:\\notes\\a.md')).toBe(true)
    expect(pathsEqual('D:/notes/a.md', 'D:/notes/b.md')).toBe(false)
  })

  it('keeps markdown extensions when renaming without one', () => {
    expect(withPreservedMarkdownExtension('note.md', 'renamed')).toBe('renamed.md')
    expect(withPreservedMarkdownExtension('note.markdown', 'renamed')).toBe('renamed.markdown')
    expect(withPreservedMarkdownExtension('note.md', 'renamed.md')).toBe('renamed.md')
    expect(withPreservedMarkdownExtension('folder', 'archive')).toBe('archive')
  })

  it('joins folder paths and normalizes markdown file names', () => {
    expect(joinPath('D:/notes/docs', 'a.md')).toBe('D:/notes/docs/a.md')
    expect(joinPath('D:\\notes\\docs', 'a.md')).toBe('D:\\notes\\docs\\a.md')
    expect(withMarkdownExtension('note')).toBe('note.md')
    expect(withMarkdownExtension('note.md')).toBe('note.md')
    expect(withMarkdownExtension('note.markdown')).toBe('note.markdown')
    expect(isUnsafeFileName('../secret')).toBe(true)
    expect(isUnsafeFileName('ok')).toBe(false)
  })
})
