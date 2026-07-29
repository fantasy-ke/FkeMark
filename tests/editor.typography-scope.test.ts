import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

describe('editor typography scope', () => {
  const appSource = readProjectFile('src/App.tsx')
  const editorCss = readProjectFile('src/styles/editor.css')

  it('keeps editor typography out of root-level application styles', () => {
    expect(appSource).not.toContain("setProperty('--font-editor'")
    expect(appSource).not.toContain("setProperty('--editor-font-size'")
    expect(appSource).not.toContain("setProperty('--md-font-family'")
    expect(appSource).not.toContain("setProperty('--md-font-size'")
    expect(editorCss).not.toContain('var(--font-editor')
    expect(editorCss).not.toContain('var(--editor-font-size')
    expect(editorCss).not.toContain('var(--md-font-family')
    expect(editorCss).not.toContain('var(--md-font-size')
  })

  it('applies typography through editor content variables', () => {
    expect(editorCss).toContain('var(--fkemark-content-font-family, var(--font-body))')
    expect(editorCss).toContain('var(--fkemark-content-font-size, 17px)')
  })
})
