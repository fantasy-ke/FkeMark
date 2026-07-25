import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNewDocument } from '../src/app/useNewDocument'
import { EmptyState } from '../src/components/EmptyState'

describe('new document quick start', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('opens quick start without creating a tab and creates one after template selection', () => {
    const createTab = vi.fn(() => 'tab-1')

    function Harness() {
      const { quickStartOpen, handleNewFile, handleCreateFromTemplate } = useNewDocument({
        language: 'zh-CN',
        createTab,
      })
      return (
        <>
          <button type="button" data-action="new" onClick={handleNewFile}>new</button>
          <button type="button" data-action="select" onClick={() => handleCreateFromTemplate('# 模板')}>select</button>
          <span data-state={quickStartOpen ? 'open' : 'closed'} />
        </>
      )
    }

    act(() => root.render(<Harness />))
    const newButton = container.querySelector<HTMLButtonElement>('[data-action="new"]')!
    const selectButton = container.querySelector<HTMLButtonElement>('[data-action="select"]')!

    act(() => newButton.click())
    expect(createTab).not.toHaveBeenCalled()
    expect(container.querySelector('[data-state="open"]')).not.toBeNull()

    act(() => selectButton.click())
    expect(createTab).toHaveBeenCalledWith('未命名.md', null, '# 模板', undefined, null, true)
    expect(container.querySelector('[data-state="closed"]')).not.toBeNull()
  })

  it('renders an accessible quick-start dialog and supports selection, close, and Escape', () => {
    const onSelectTemplate = vi.fn()
    const onClose = vi.fn()

    act(() => root.render(<EmptyState onSelectTemplate={onSelectTemplate} onClose={onClose} />))

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(container.querySelectorAll('.empty-state-template-card')).toHaveLength(6)

    act(() => container.querySelector<HTMLButtonElement>('.empty-state-template-card')!.click())
    expect(onSelectTemplate).toHaveBeenCalledWith('')

    act(() => container.querySelector<HTMLButtonElement>('.empty-state-close')!.click())
    expect(onClose).toHaveBeenCalledTimes(1)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
