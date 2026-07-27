import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

describe('code block theme styles', () => {
  const variablesCss = readProjectFile('src/styles/variables.css')
  const editorCss = readProjectFile('src/styles/editor.css')
  const markdownCss = readProjectFile('src/styles/markdown.css')

  it('uses dedicated code block background and top/bottom border variables', () => {
    expect(variablesCss).toContain('--code-block-bg:')
    expect(variablesCss).toContain('--code-block-border:')
    expect(editorCss).toContain('background: var(--code-block-bg);')
    expect(editorCss).toContain('border-top-color: var(--code-block-border);')
    expect(editorCss).toContain('border-bottom-color: var(--code-block-border);')
    expect(editorCss).toContain('.bn-block-content[data-content-type="codeBlock"]')
  })

  it('routes syntax tokens through theme-specific variables', () => {
    expect(variablesCss).toContain('--syntax-keyword:')
    expect(variablesCss).toContain('--syntax-string:')
    expect(markdownCss).toContain('color: var(--syntax-keyword);')
    expect(markdownCss).toContain('color: var(--syntax-string);')
    expect(markdownCss).not.toContain('[data-theme-mode="dark"] .editor-inner .hljs-keyword')
  })
})
