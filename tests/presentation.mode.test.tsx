import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresentationMode } from '../src/components/editor/PresentationMode'
import { translate } from '../src/i18n'
import { DICTS } from '../src/i18n/locales'
import { splitMarkdownSlides } from '../src/utils/markdown/presentation'

describe('presentation mode', () => {
  it('splits a note on standalone horizontal separators', () => {
    expect(splitMarkdownSlides('# First\n\n---\n\n# Second')).toEqual([
      '# First',
      '# Second',
    ])
  })

  it('ignores front matter and separators inside code blocks', () => {
    const source = [
      '---',
      'title: Demo',
      '---',
      '# Code',
      '```md',
      '---',
      '```',
      '    ---',
      '---',
      '# End',
    ].join('\n')

    expect(splitMarkdownSlides(source)).toEqual([
      '# Code\n```md\n---\n```\n    ---',
      '# End',
    ])
  })

  it('drops empty sections created by repeated separators', () => {
    expect(splitMarkdownSlides('\n---\n---\n# Only\n\n---\n---')).toEqual(['# Only'])
    expect(splitMarkdownSlides('')).toEqual([])
  })

  it('provides presentation translations in both languages', () => {
    expect(DICTS['zh-CN']['presentation.title']).toBe('演示模式')
    expect(DICTS.en['presentation.next']).toBe('Next')
  })

  describe('keyboard navigation', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
    })

    afterEach(async () => {
      await act(async () => root.unmount())
      container.remove()
      vi.restoreAllMocks()
    })

    it('moves between slides and exits with Escape', async () => {
      const onClose = vi.fn()
      await act(async () => {
        root.render(
          <PresentationMode
            open
            content={'# First\n\n---\n\n# Second'}
            onClose={onClose}
            t={(key, params) => translate('en', key, params)}
          />,
        )
      })

      expect(container.querySelector('.presentation-page')?.textContent).toContain('1 / 2')
      expect(container.querySelector('.presentation-slide-content')?.textContent).toContain('First')

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      })
      expect(container.querySelector('.presentation-page')?.textContent).toContain('2 / 2')
      expect(container.querySelector('.presentation-slide-content')?.textContent).toContain('Second')

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
      })
      expect(container.querySelector('.presentation-page')?.textContent).toContain('1 / 2')

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
