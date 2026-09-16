import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const overlaysCss = readFileSync(resolve(process.cwd(), 'src/styles/overlays.css'), 'utf8')

function readRule(selector: string): string {
  return overlaysCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('编辑器覆盖层样式', () => {
  it('让搜索高亮覆盖 Markdown 语法着色并与源码文本区对齐', () => {
    const searchRule = readRule('\\.search-highlight-overlay')
    const searchSplitRule = readRule('\\.search-highlight-overlay--split')
    const syntaxRule = readRule('\\.markdown-syntax-highlight-overlay')

    expect(searchRule).toContain('z-index: 2')
    expect(searchRule).toContain('max-width: var(--editor-max-w)')
    expect(searchRule).toContain('margin: 0 auto')
    expect(searchSplitRule).toContain('max-width: none')
    expect(searchSplitRule).toContain('margin: 0')
    expect(syntaxRule).toContain('z-index: 1')
  })
})
