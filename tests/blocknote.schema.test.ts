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
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'csharp')).toBe('csharp')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'cs')).toBe('csharp')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'c#')).toBeUndefined()
    expect(fkeMarkCodeBlockOptions.supportedLanguages.csharp.name).toBe('csharp')
    expect(getLanguageId(fkeMarkCodeBlockOptions, 'plaintext')).toBe('text')
  })

  it('ignores collapse control mutations in the managed code block DOM', () => {
    const rendered = fkeMarkBlockNoteSchema.blockSpecs.codeBlock.implementation.render(
      { id: 'code', type: 'codeBlock', props: { language: 'text' }, content: [], children: [] },
      { isEditable: false } as never,
    )
    const button = rendered.dom.querySelector<HTMLButtonElement>('[data-code-block-collapse-toggle="true"]')

    expect(button).not.toBeNull()
    expect(rendered.ignoreMutation?.({
      type: 'attributes',
      target: button!,
      attributeName: 'hidden',
    } as MutationRecord)).toBe(true)
    expect(rendered.ignoreMutation?.({
      type: 'attributes',
      target: rendered.dom,
      attributeName: 'data-code-block-collapsible',
    } as MutationRecord)).toBe(true)
  })

  it('loads a selected syntax language with the bundled highlighter', async () => {
    const createHighlighter = fkeMarkCodeBlockOptions.createHighlighter
    expect(createHighlighter).toBeTypeOf('function')

    const highlighter = await createHighlighter!()
    await highlighter.loadLanguage('typescript')

    expect(highlighter.getLoadedLanguages()).toContain('typescript')
  })

  it('loads the current Shiki theme before the fallback theme', async () => {
    const createHighlighter = fkeMarkCodeBlockOptions.createHighlighter
    const previousThemeMode = document.documentElement.getAttribute('data-theme-mode')

    try {
      document.documentElement.setAttribute('data-theme-mode', 'light')
      const lightHighlighter = await createHighlighter!()
      expect(lightHighlighter.getLoadedThemes()[0]).toBe('github-light-high-contrast')

      document.documentElement.setAttribute('data-theme-mode', 'dark')
      const darkHighlighter = await createHighlighter!()
      expect(darkHighlighter.getLoadedThemes()[0]).toBe('github-dark')
    } finally {
      if (previousThemeMode === null) {
        document.documentElement.removeAttribute('data-theme-mode')
      } else {
        document.documentElement.setAttribute('data-theme-mode', previousThemeMode)
      }
    }
  })
})
