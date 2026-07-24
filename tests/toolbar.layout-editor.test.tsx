import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolbarLayoutEditor } from '../src/components/settings/ToolbarLayoutEditor'
import type { ToolbarButtonConfig } from '../src/types'
import { DEFAULT_TOOLBAR_ITEMS } from '../src/utils/toolbar'

function createDataTransfer() {
  let value = ''
  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    setData: (_type: string, nextValue: string) => { value = nextValue },
    getData: () => value,
  }
}

function createDragEvent(type: string, dataTransfer: ReturnType<typeof createDataTransfer>, clientX = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: clientX },
  })
  return event
}

describe('ToolbarLayoutEditor', () => {
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
  })

  it('shows descriptions and commits the precise drag target on drop', () => {
    let changedItems: ToolbarButtonConfig[] | null = null
    act(() => root.render(
      <ToolbarLayoutEditor
        t={(key) => key}
        value={DEFAULT_TOOLBAR_ITEMS}
        onChange={(items) => { changedItems = items }}
      />,
    ))

    const presentation = container.querySelector('[data-toolbar-layout-item="presentation"]') as HTMLDivElement
    const bold = container.querySelector('[data-toolbar-layout-item="bold"]') as HTMLDivElement
    expect(presentation.title).toBe('toolbar.presentation')
    expect(container.querySelector('[data-toolbar-layout-item="separator-1"]')?.getAttribute('title')).toBe('settings.toolbarDivider')

    bold.getBoundingClientRect = () => ({ left: 0, width: 34 } as DOMRect)
    const dataTransfer = createDataTransfer()
    act(() => presentation.dispatchEvent(createDragEvent('dragstart', dataTransfer)))
    act(() => bold.dispatchEvent(createDragEvent('dragover', dataTransfer, 30)))
    act(() => bold.dispatchEvent(createDragEvent('drop', dataTransfer, 30)))

    expect(changedItems).not.toBeNull()
    const shownIds = (changedItems || [])
      .filter((item) => item.placement !== 'hidden')
      .map((item) => item.id)
    expect(shownIds.slice(0, 4)).toEqual(['heading', 'separator-1', 'bold', 'presentation'])
  })

  it('supports keyboard zone switching and same-zone reordering', () => {
    function Harness() {
      const [items, setItems] = useState<ToolbarButtonConfig[]>(DEFAULT_TOOLBAR_ITEMS)
      return <ToolbarLayoutEditor t={(key) => key} value={items} onChange={setItems} />
    }

    act(() => root.render(<Harness />))

    const heading = container.querySelector('[data-toolbar-layout-item="heading"]') as HTMLDivElement
    act(() => heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    let shownIds = Array.from(container.querySelectorAll('.toolbar-drop-zone:first-child [data-toolbar-layout-item]'))
      .map((item) => item.getAttribute('data-toolbar-layout-item'))
    expect(shownIds.slice(0, 3)).toEqual(['separator-1', 'heading', 'bold'])

    const presentation = container.querySelector('[data-toolbar-layout-item="presentation"]') as HTMLDivElement
    act(() => presentation.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    shownIds = Array.from(container.querySelectorAll('.toolbar-drop-zone:first-child [data-toolbar-layout-item]'))
      .map((item) => item.getAttribute('data-toolbar-layout-item'))
    expect(shownIds.at(-1)).toBe('presentation')
  })
})
