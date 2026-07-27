import { describe, expect, it } from 'vitest'
import { getLanguageId } from '@blocknote/core'
import { fkeMarkBlockNoteSchema, fkeMarkCodeBlockOptions } from '../src/components/editor/blockNoteSchema'

describe('FkeMark BlockNote schema', () => {
  it('enables the BlockNote code block highlighter and keeps plain text unhighlighted', () => {
    expect(fkeMarkBlockNoteSchema.blockSchema.codeBlock.type).toBe('codeBlock')
    expect(fkeMarkCodeBlockOptions.defaultLanguage).toBe('text')
    expect(typeof fkeMarkCodeBlockOptions.createHighlighter).toBe('function')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'typescript')).toBe('typescript')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'go')).toBe('go')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'c++')).toBe('cpp')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'plaintext')).toBe('text')
  })

  it('loads a selected syntax language with the bundled highlighter', async () => {
    const createHighlighter = fkeMarkCodeBlockOptions.createHighlighter
    expect(createHighlighter).toBeTypeOf('function')

    const highlighter = await createHighlighter!()
    await highlighter.loadLanguage('typescript')

    expect(highlighter.getLoadedLanguages()).toContain('typescript')
  })

  it('prefers the Shiki theme that matches the current app tone', async () => {
    const createHighlighter = fkeMarkCodeBlockOptions.createHighlighter
    const previousThemeMode = document.documentElement.getAttribute('data-theme-mode')
    const highlighter = await createHighlighter!()

    try {
      document.documentElement.setAttribute('data-theme-mode', 'light')
      expect(highlighter.getLoadedThemes()[0]).toBe('github-light')

      document.documentElement.setAttribute('data-theme-mode', 'dark')
      expect(highlighter.getLoadedThemes()[0]).toBe('github-dark')
    } finally {
      if (previousThemeMode === null) {
        document.documentElement.removeAttribute('data-theme-mode')
      } else {
        document.documentElement.setAttribute('data-theme-mode', previousThemeMode)
      }
    }
  })
})
