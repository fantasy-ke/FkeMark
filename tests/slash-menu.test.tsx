import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { SlashMenu } from '../src/components/SlashMenu'

describe('SlashMenu', () => {
  let container: HTMLDivElement
  let root: Root
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView }).scrollIntoView
    }
    vi.restoreAllMocks()
  })

  it('renders icons for block and inline math commands', async () => {
    await act(async () => {
      root.render(
        <I18nProvider language="en" setLanguage={() => {}}>
          <SlashMenu query="math" x={0} y={0} onSelect={() => {}} onClose={() => {}} />
        </I18nProvider>,
      )
    })

    expect(container.querySelector('.slash-menu-icon[data-cmd="mathblock"] svg')).not.toBeNull()
    expect(container.querySelector('.slash-menu-icon[data-cmd="mathinline"] svg')).not.toBeNull()
  })
})
