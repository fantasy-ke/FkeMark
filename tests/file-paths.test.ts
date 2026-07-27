import { describe, expect, it } from 'vitest'
import { getBaseName, isSamePathOrDescendant, replacePathPrefix } from '../src/utils/filePaths'

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
})
