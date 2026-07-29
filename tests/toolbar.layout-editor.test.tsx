import { useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolbarLayoutEditor } from '../src/components/settings/ToolbarLayoutEditor'
import type { ToolbarButtonConfig } from '../src/types'
import { DEFAULT_TOOLBAR_ITEMS } from '../src/utils/toolbar'

function createPointerEvent(type: string, clientX: number, clientY: number, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button })
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
  })
  return event
}

function setRect(element: Element, left: number, top: number, width: number, height: number) {
  const rect = {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
  Object.defineProperty(element, 'getBoundingClientRect', { configurable: true, value: () => rect })
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

  it('uses left-button pointer coordinates to reorder and show a hidden button', () => {
    let changedItems: ToolbarButtonConfig[] | null = null
    act(() => root.render(
      <ToolbarLayoutEditor
        t={(key) => key}
        value={DEFAULT_TOOLBAR_ITEMS}
        onChange={(items) => { changedItems = items }}
      />,
    ))

    const visibleZone = container.querySelector('[data-toolbar-layout-zone="toolbar"]') as HTMLDivElement
    const presentation = container.querySelector('[data-toolbar-layout-item="presentation"]') as HTMLDivElement
    const bold = container.querySelector('[data-toolbar-layout-item="bold"]') as HTMLDivElement
    expect(presentation.title).toBe('toolbar.presentation')
    expect(container.querySelector('[data-toolbar-layout-item="separator-1"]')?.getAttribute('title')).toBe('settings.toolbarDivider')

    setRect(visibleZone, 0, 0, 500, 60)
    setRect(bold, 60, 10, 34, 32)
    act(() => presentation.dispatchEvent(createPointerEvent('pointerdown', 10, 90)))
    act(() => presentation.dispatchEvent(createPointerEvent('pointermove', 90, 20)))
    act(() => presentation.dispatchEvent(createPointerEvent('pointerup', 90, 20)))

    expect(changedItems).not.toBeNull()
    const shownIds = (changedItems || [])
      .filter((item) => item.placement !== 'hidden')
      .map((item) => item.id)
    expect(shownIds.slice(0, 4)).toEqual(['heading', 'separator-1', 'bold', 'presentation'])
  })

  it('moves a shown button into the calculated hidden position', () => {
    function Harness() {
      const [items, setItems] = useState<ToolbarButtonConfig[]>(DEFAULT_TOOLBAR_ITEMS)
      return <ToolbarLayoutEditor t={(key) => key} value={items} onChange={setItems} />
    }

    act(() => root.render(<Harness />))

    const hiddenZone = container.querySelector('[data-toolbar-layout-zone="hidden"]') as HTMLDivElement
    const heading = container.querySelector('[data-toolbar-layout-item="heading"]') as HTMLDivElement
    const spellCheck = container.querySelector('[data-toolbar-layout-item="spellCheck"]') as HTMLDivElement
    setRect(hiddenZone, 0, 70, 500, 60)
    setRect(spellCheck, 40, 80, 34, 32)

    act(() => heading.dispatchEvent(createPointerEvent('pointerdown', 10, 20)))
    act(() => heading.dispatchEvent(createPointerEvent('pointermove', 45, 90)))
    act(() => heading.dispatchEvent(createPointerEvent('pointerup', 45, 90)))

    const hiddenIds = Array.from(container.querySelectorAll('[data-toolbar-layout-zone="hidden"] [data-toolbar-layout-item]'))
      .map((item) => item.getAttribute('data-toolbar-layout-item'))
    expect(hiddenIds.slice(0, 3)).toEqual(['snippets', 'heading', 'spellCheck'])
    expect(container.querySelector('[data-toolbar-layout-zone="toolbar"] [data-toolbar-layout-item="heading"]')).toBeNull()
  })

  it('ignores non-left pointer dragging', () => {
    let changeCount = 0
    act(() => root.render(
      <ToolbarLayoutEditor
        t={(key) => key}
        value={DEFAULT_TOOLBAR_ITEMS}
        onChange={() => { changeCount += 1 }}
      />,
    ))

    const visibleZone = container.querySelector('[data-toolbar-layout-zone="toolbar"]') as HTMLDivElement
    const presentation = container.querySelector('[data-toolbar-layout-item="presentation"]') as HTMLDivElement
    const bold = container.querySelector('[data-toolbar-layout-item="bold"]') as HTMLDivElement
    setRect(visibleZone, 0, 0, 500, 60)
    setRect(bold, 60, 10, 34, 32)

    act(() => presentation.dispatchEvent(createPointerEvent('pointerdown', 10, 90, 2)))
    act(() => presentation.dispatchEvent(createPointerEvent('pointermove', 90, 20, 2)))
    act(() => presentation.dispatchEvent(createPointerEvent('pointerup', 90, 20, 2)))
    expect(changeCount).toBe(0)
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
