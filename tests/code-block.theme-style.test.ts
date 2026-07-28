import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

describe('code block theme styles', () => {
  const variablesCss = readProjectFile('src/styles/variables.css')
  const editorCss = readProjectFile('src/styles/editor.css')
  const markdownCss = readProjectFile('src/styles/markdown.css')
  const appSource = readProjectFile('src/App.tsx')
  const editorLayoutSource = readProjectFile('src/components/editor/EditorLayout.tsx')

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
    expect(variablesCss).toContain('--syntax-comment: #475569;')
    expect(variablesCss).toContain('--syntax-meta: #334155;')
    expect(variablesCss).toContain('--syntax-comment: #57606a;')
    expect(markdownCss).toContain('color: var(--syntax-keyword);')
    expect(markdownCss).toContain('color: var(--syntax-string);')
    expect(markdownCss).toContain('color: var(--syntax-comment);')
    expect(markdownCss).not.toContain('[data-theme-mode="dark"] .editor-inner .hljs-keyword')
  })

  it('keeps the language selector unobtrusive until hover or focus', () => {
    expect(editorCss).toMatch(/data-content-type="codeBlock"\]\s*>\s*div\s*>\s*select\s*\{[\s\S]*opacity: 0;/)
    expect(editorCss).toMatch(/data-content-type="codeBlock"\]:hover\s*>\s*div\s*>\s*select,[\s\S]*opacity: 1;/)
  })

  it('uses the app-level reactive system theme for live code blocks', () => {
    expect(appSource).toContain('const [systemDark, setSystemDark]')
    expect(editorLayoutSource).toContain('systemDark = false')
    expect(editorLayoutSource).not.toContain("window.matchMedia('(prefers-color-scheme: dark)').matches")
  })
})
