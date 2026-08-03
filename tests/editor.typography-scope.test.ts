import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

describe('application typography scope', () => {
  const appSource = readProjectFile('src/App.tsx')
  const variablesCss = readProjectFile('src/styles/variables.css')
  const editorCss = readProjectFile('src/styles/editor.css')
  const sidebarCss = readProjectFile('src/styles/sidebar.css')
  const menusCss = readProjectFile('src/styles/menus.css')
  const settingsPageCss = readProjectFile('src/styles/components/settings-page.css')

  it('publishes editor typography as application typography variables', () => {
    expect(appSource).toContain("setProperty('--app-font-family'")
    expect(appSource).toContain("setProperty('--app-font-size'")
    expect(variablesCss).toContain('--font-body: var(--app-font-family)')
    expect(variablesCss).toContain('--font-sans: var(--app-font-family)')
    expect(variablesCss).toContain('--font-display: var(--app-font-family)')
    expect(variablesCss).toContain('font-size: var(--app-font-size, 16px)')
  })

  it('keeps document views overridable through content variables', () => {
    expect(editorCss).toContain('var(--fkemark-content-font-family, var(--font-body))')
    expect(editorCss).toContain('font-family: var(--fkemark-content-font-family, var(--font-body))')
    expect(editorCss).toContain('var(--fkemark-content-font-size, 17px)')
  })

  it('uses application typography scale in non-editor chrome', () => {
    expect(sidebarCss).toContain('font-size: var(--ui-font-lg)')
    expect(menusCss).toContain('font-size: var(--ui-font-lg)')
    expect(settingsPageCss).toContain('font-size: var(--ui-font-logo)')
  })

  it('keeps rendered Markdown heading spacing compact', () => {
    expect(editorCss).toMatch(/\.editor-inner h1\s*\{[^}]*margin: 28px 0 20px;/)
    expect(editorCss).toMatch(/\.editor-inner h2\s*\{[^}]*margin: 24px 0 16px;/)
    expect(editorCss).toMatch(/\.editor-inner h3\s*\{[^}]*margin: 20px 0 12px;/)
    expect(editorCss).toMatch(/\.editor-inner h4\s*\{[^}]*margin: 18px 0 10px;/)
    expect(editorCss).toMatch(/\.editor-inner h5,\s*\.editor-inner h6\s*\{[^}]*margin: 16px 0 8px;/)
  })
})
