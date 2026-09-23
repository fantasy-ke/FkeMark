import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const overlaysCss = readFileSync(resolve(process.cwd(), 'src/styles/overlays.css'), 'utf8')

function readRule(selector: string): string {
  return overlaysCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('编辑器覆盖层样式', () => {
  it('让源码语法高亮改符号字体颜色，而不是叠在原文上', () => {
    const textareaRule = readRule('\\.source-textarea')
    const syntaxRule = readRule('\\.markdown-syntax-highlight-overlay')
    const headingRule = readRule('\\.markdown-syntax-token--heading')
    const delimiterRule = readRule('\\.markdown-syntax-token--delimiter')

    expect(textareaRule).toContain('z-index: 3')
    expect(textareaRule).toContain('color: transparent')
    expect(textareaRule).toContain('caret-color: var(--fg)')
    expect(textareaRule).toContain('background: transparent')
    expect(syntaxRule).toContain('color: var(--fg)')
    expect(syntaxRule).not.toContain('color: transparent')
    expect(headingRule).toContain('color: var(--syntax-title)')
    expect(headingRule).not.toContain('font-weight')
    expect(delimiterRule).toContain('color: var(--syntax-meta)')
    expect(delimiterRule).not.toContain('font-weight')
  })

  it('让搜索高亮覆盖 Markdown 语法着色并与源码文本区对齐', () => {
    const searchRule = readRule('\\.search-highlight-overlay')
    const searchSplitRule = readRule('\\.search-highlight-overlay--split')
    const syntaxRule = readRule('\\.markdown-syntax-highlight-overlay')
    const markRule = readRule('\\.search-highlight-mark')

    expect(searchRule).toContain('z-index: 2')
    expect(searchRule).toContain('max-width: var(--editor-max-w)')
    expect(searchRule).toContain('margin: 0 auto')
    expect(searchSplitRule).toContain('max-width: none')
    expect(searchSplitRule).toContain('margin: 0')
    expect(syntaxRule).toContain('z-index: 1')
    expect(markRule).toContain('color: transparent')
  })

  it('让源码文本区的选区保持可见', () => {
    const selectionRule = readRule('\\.source-textarea::selection')

    expect(selectionRule).toContain('background: rgba(196, 100, 66, 0.35)')
    expect(selectionRule).toContain('color: transparent')
  })

  it('在小地图内侧提供折叠按钮', () => {
    expect(overlaysCss).toContain('.minimap-fold {')
    expect(overlaysCss).toContain('.minimap-right .minimap-fold { left: 4px; }')
    expect(overlaysCss).toContain('.minimap-left .minimap-fold { right: 4px; }')
  })

  it('styles the minimap context menu', () => {
    expect(overlaysCss).toContain('.minimap-ctx-menu {')
    expect(overlaysCss).toContain('.minimap-ctx-menu .app-menu-item.is-active')
  })

})

describe('查找栏与反向链接避让右侧小地图', () => {
  const searchCss = readFileSync(resolve(process.cwd(), 'src/styles/search.css'), 'utf8')
  const backlinksCss = readFileSync(resolve(process.cwd(), 'src/styles/backlinks.css'), 'utf8')

  it('给文章搜索框和反向连接按钮留出右侧小地图空间', () => {
    expect(searchCss).toMatch(/\.find-replace-bar \{[\s\S]*?right: 52px;/)
    expect(searchCss).toContain('.editor-area.has-minimap-right .find-replace-bar')
    expect(searchCss).toContain('right: 132px;')
    expect(backlinksCss).toContain('.editor-area.has-minimap-right .backlinks-toggle')
    expect(backlinksCss).toContain('right: 92px;')
    expect(backlinksCss).toContain('.editor-area.has-minimap-right .backlinks-panel')
  })

  it('图谱按钮贴着右侧小地图，没有小地图时贴边', () => {
    const graphCss = readFileSync(resolve(process.cwd(), 'src/styles/link-graph.css'), 'utf8')
    expect(graphCss).toMatch(/\.link-graph-toggle \{[\s\S]*?right: 12px;/)
    expect(graphCss).toContain('.editor-area.has-minimap-right .link-graph-toggle')
    expect(graphCss).toContain('right: 92px;')
  })
})
