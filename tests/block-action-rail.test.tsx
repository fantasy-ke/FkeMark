import { act, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockActionRail, getBlockActionUpdate } from '../src/components/editor/BlockActionRail'
import { EditorModeEnum, type EditorMode } from '../src/types'
import type { AnyBlockNoteEditor } from '../src/components/editor/blockNoteMarkdown'

type EditorMock = {
  isEditable: boolean
  getBlock: ReturnType<typeof vi.fn>
  updateBlock: ReturnType<typeof vi.fn>
  removeBlocks: ReturnType<typeof vi.fn>
  insertBlocks: ReturnType<typeof vi.fn>
  setTextCursorPosition: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}

const t = (key: string) => key

function mockRect(element: HTMLElement, rect: { top: number; left: number; width: number; height: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left,
      y: rect.top,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.top + rect.height,
      right: rect.left + rect.width,
      toJSON() {
        return this
      },
    }),
  })
}

function createEditorMock(blocks: Record<string, { id: string; type: string }> = {
  'block-1': { id: 'block-1', type: 'paragraph' },
}): EditorMock {
  return {
    isEditable: true,
    getBlock: vi.fn((id: string) => blocks[id]),
    updateBlock: vi.fn(),
    removeBlocks: vi.fn(),
    insertBlocks: vi.fn(() => [{ id: 'block-new' }]),
    setTextCursorPosition: vi.fn(),
    focus: vi.fn(),
  }
}

function Harness({
  editor,
  editorMode,
  nested = false,
  containerRef,
}: {
  editor: AnyBlockNoteEditor
  editorMode: EditorMode
  nested?: boolean
  containerRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div ref={containerRef}>
      <div className="editor-scroll">
        {nested ? (
          <div data-node-type="blockContainer" data-id="block-outer">
            outer
            <div data-node-type="blockContainer" data-id="block-inner">inner</div>
          </div>
        ) : (
          <div data-node-type="blockContainer" data-id="block-1">Hello</div>
        )}
        <BlockActionRail
          blockNoteEditor={editor}
          containerRef={containerRef}
          editorMode={editorMode}
          t={t}
        />
      </div>
    </div>
  )
}

describe('BlockActionRail block conversions', () => {
  it('maps supported block actions to BlockNote updates', () => {
    expect(getBlockActionUpdate('paragraph')).toEqual({ type: 'paragraph' })
    expect(getBlockActionUpdate('h1')).toEqual({ type: 'heading', props: { level: 1 } })
    expect(getBlockActionUpdate('h2')).toEqual({ type: 'heading', props: { level: 2 } })
    expect(getBlockActionUpdate('quote')).toEqual({ type: 'quote' })
    expect(getBlockActionUpdate('bulletList')).toEqual({ type: 'bulletListItem' })
    expect(getBlockActionUpdate('numberedList')).toEqual({ type: 'numberedListItem' })
    expect(getBlockActionUpdate('todo')).toEqual({ type: 'checkListItem', props: { checked: false } })
    expect(getBlockActionUpdate('codeBlock')).toEqual({ type: 'codeBlock', props: { language: 'text' } })
  })
})

describe('BlockActionRail interactions', () => {
  let container: HTMLDivElement
  let root: Root
  let containerRef: RefObject<HTMLDivElement | null>

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    containerRef = { current: null }
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  async function renderRail(
    editor: EditorMock,
    editorMode: EditorMode = EditorModeEnum.Live,
    nested = false,
  ) {
    await act(async () => {
      root.render(
        <Harness
          editor={editor as unknown as AnyBlockNoteEditor}
          editorMode={editorMode}
          nested={nested}
          containerRef={containerRef}
        />,
      )
    })
  }

  async function hover(target: EventTarget) {
    await act(async () => {
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    })
  }

  async function leave(target: EventTarget, relatedTarget: EventTarget | null) {
    await act(async () => {
      target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget }))
    })
  }

  it('shows action and add buttons on live-mode block hover', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    await hover(block)

    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail).not.toBeNull()
    expect(rail.dataset.blockActionId).toBe('block-1')
    expect(container.querySelector('button[aria-label="editor.blockActions.menu"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="editor.blockActions.add"]')).not.toBeNull()
    expect(container.querySelector('svg.lucide-more-vertical')).not.toBeNull()
    expect(container.querySelector('svg.lucide-plus')).not.toBeNull()
  })

  it('keeps the rail visible when the pointer moves onto the buttons', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    await hover(block)
    const rail = container.querySelector('.block-action-rail') as HTMLElement
    await leave(block, rail)
    expect(container.querySelector('.block-action-rail')).not.toBeNull()
  })

  it('hides the rail after leaving both the block and the buttons', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    await hover(block)
    await leave(block, document.body)
    expect(container.querySelector('.block-action-rail')).not.toBeNull()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    expect(container.querySelector('.block-action-rail')).toBeNull()
  })

  it('keeps the rail visible when the pointer crosses the gap onto the buttons', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    await hover(block)
    const rail = container.querySelector('.block-action-rail') as HTMLElement
    await leave(block, document.body)
    await hover(rail)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    expect(container.querySelector('.block-action-rail')).not.toBeNull()
  })

  it('does not show the rail in source, split, or read-only editors', async () => {
    const editor = createEditorMock()
    await renderRail(editor, EditorModeEnum.Source)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)
    expect(container.querySelector('.block-action-rail')).toBeNull()

    await renderRail(editor, EditorModeEnum.Split)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)
    expect(container.querySelector('.block-action-rail')).toBeNull()

    editor.isEditable = false
    await renderRail(editor, EditorModeEnum.Live)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)
    expect(container.querySelector('.block-action-rail')).toBeNull()
  })

  it('inserts an empty paragraph below the current block', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.add"]')?.click()
    })

    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [{ type: 'paragraph', content: [], children: [] }],
      'block-1',
      'after',
    )
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('block-new', 'start')
    expect(editor.focus).toHaveBeenCalled()
  })

  it('converts the current block from the action menu', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.menu"]')?.click()
    })
    const headingItem = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent === 'blockActions.heading1')
    expect(headingItem).toBeDefined()

    await act(async () => {
      headingItem?.click()
    })

    expect(editor.updateBlock).toHaveBeenCalledWith(
      { id: 'block-1', type: 'paragraph' },
      { type: 'heading', props: { level: 1 } },
    )
    expect(container.querySelector('.block-action-menu')).toBeNull()
  })

  it('deletes the current block and closes the rail', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.menu"]')?.click()
    })
    const deleteItem = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent === 'editor.blockActions.delete')

    await act(async () => {
      deleteItem?.click()
    })

    expect(editor.removeBlocks).toHaveBeenCalledWith([{ id: 'block-1', type: 'paragraph' }])
    expect(container.querySelector('.block-action-rail')).toBeNull()
  })

  it('closes the action menu with Escape and outside click', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.menu"]')?.click()
    })
    expect(container.querySelector('.block-action-menu')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('.block-action-menu')).toBeNull()
    expect(container.querySelector('.block-action-rail')).not.toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.menu"]')?.click()
    })
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(container.querySelector('.block-action-menu')).toBeNull()
  })

  it('targets the innermost hovered block', async () => {
    const editor = createEditorMock({
      'block-outer': { id: 'block-outer', type: 'paragraph' },
      'block-inner': { id: 'block-inner', type: 'paragraph' },
    })
    await renderRail(editor, EditorModeEnum.Live, true)
    await hover(container.querySelector('[data-id="block-inner"]') as HTMLElement)
    expect(container.querySelector('.block-action-rail')?.getAttribute('data-block-action-id')).toBe('block-inner')
  })

  it('keeps the rail aligned after the editor scrolls', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const scroll = container.querySelector('.editor-scroll') as HTMLElement
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    mockRect(scroll, { top: 0, left: 0, width: 800, height: 400 })
    mockRect(block, { top: 100, left: 120, width: 600, height: 40 })

    await hover(block)
    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail.style.top).toBe('106px')
    expect(rail.style.left).toBe('128px')

    Object.defineProperty(scroll, 'scrollTop', { configurable: true, value: 80 })
    mockRect(block, { top: 20, left: 120, width: 600, height: 40 })
    await act(async () => {
      scroll.dispatchEvent(new Event('scroll'))
    })
    expect(rail.style.top).toBe('106px')
  })
})
