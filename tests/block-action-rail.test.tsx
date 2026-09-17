import { act, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockActionRail, getBlockActionUpdate } from '../src/components/editor/BlockActionRail'
import {
  applyHeadingCollapsedState,
  getHeadingLevel,
  getHeadingSectionBlocks,
  headingCollapseNeedsRestamp,
  HEADING_COLLAPSED_ATTR,
  HEADING_COLLAPSE_STYLE_ATTR,
  HEADING_SECTION_HIDDEN_ATTR,
} from '../src/components/editor/blockActionHelpers'
import { setSessionCollapsedHeadingIds } from '../src/utils/markdown/headingCollapse'
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
  onChange: ReturnType<typeof vi.fn>
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
    onChange: vi.fn(() => vi.fn()),
  }
}

function Harness({
  editor,
  editorMode,
  nested = false,
  heading = false,
  containerRef,
  onPersistChange,
}: {
  editor: AnyBlockNoteEditor
  editorMode: EditorMode
  nested?: boolean
  heading?: boolean
  containerRef: RefObject<HTMLDivElement | null>
  onPersistChange?: () => void
}) {
  return (
    <div ref={containerRef}>
      <div className="editor-scroll">
        {heading ? (
          <>
            <div data-node-type="blockOuter">
              <div className="bn-block" data-node-type="blockContainer" data-id="heading-1">
                <div className="bn-block-content" data-content-type="heading" data-level="2">Title</div>
                <div className="bn-block-group">
                  <div data-node-type="blockOuter">
                    <div className="bn-block" data-node-type="blockContainer" data-id="child-1">
                      <div className="bn-block-content" data-content-type="paragraph">Nested</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div data-node-type="blockOuter">
              <div className="bn-block" data-node-type="blockContainer" data-id="block-1">
                <div className="bn-block-content" data-content-type="paragraph">Body</div>
              </div>
            </div>
            <div data-node-type="blockOuter">
              <div className="bn-block" data-node-type="blockContainer" data-id="heading-2">
                <div className="bn-block-content" data-content-type="heading" data-level="2">Next</div>
              </div>
            </div>
          </>
        ) : nested ? (
          <div className="bn-editor">
            <div data-node-type="blockContainer" data-id="block-outer">
              outer
              <div data-node-type="blockContainer" data-id="block-inner">inner</div>
            </div>
          </div>
        ) : (
          <div data-node-type="blockContainer" data-id="block-1">Hello</div>
        )}
        <BlockActionRail
          blockNoteEditor={editor}
          containerRef={containerRef}
          editorMode={editorMode}
          t={t}
          onPersistChange={onPersistChange}
        />
      </div>
    </div>
  )
}

describe('heading section helpers', () => {
  it('collects following blocks until the next same-level heading', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="h2">
          <div class="bn-block-content" data-content-type="heading" data-level="2">A</div>
        </div>
      </div>
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="p">
          <div class="bn-block-content" data-content-type="paragraph">B</div>
        </div>
      </div>
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="h3">
          <div class="bn-block-content" data-content-type="heading" data-level="3">C</div>
        </div>
      </div>
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="h2b">
          <div class="bn-block-content" data-content-type="heading" data-level="2">D</div>
        </div>
      </div>
    `
    const heading = root.querySelector('[data-id="h2"]') as HTMLElement
    expect(getHeadingLevel(heading)).toBe(2)
    expect(getHeadingSectionBlocks(heading).map((block) => block.dataset.id)).toEqual(['p', 'h3'])
  })

  it('marks nested children and following section blocks as collapsed', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="h2">
          <div class="bn-block-content" data-content-type="heading" data-level="2">A</div>
          <div class="bn-block-group">
            <div data-node-type="blockOuter">
              <div data-node-type="blockContainer" data-id="child"></div>
            </div>
          </div>
        </div>
      </div>
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="p"></div>
      </div>
    `
    applyHeadingCollapsedState(root, new Set(['h2']))
    const heading = root.querySelector('[data-id="h2"]') as HTMLElement
    const style = document.querySelector(`style[${HEADING_COLLAPSE_STYLE_ATTR}]`)

    expect(heading.getAttribute(HEADING_COLLAPSED_ATTR)).toBeNull()
    expect(root.querySelector(`[${HEADING_SECTION_HIDDEN_ATTR}]`)).toBeNull()
    expect(heading.querySelector(':scope > .bn-block-group')).not.toBeNull()
    expect(style?.textContent).toContain('[data-id="h2"]')
    expect(style?.textContent).toContain('.bn-block-group')
    expect(style?.textContent).toContain('[data-id="p"]')
    expect(style?.textContent).not.toContain('[data-id="child"]')

  })

  it('does not emit block-tree childList mutations when restamping collapse attributes', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="h2">
          <div class="bn-block-content" data-content-type="heading" data-level="2">A</div>
        </div>
      </div>
      <div data-node-type="blockOuter">
        <div class="bn-block" data-node-type="blockContainer" data-id="p"></div>
      </div>
    `
    const records: MutationRecord[] = []
    const observer = new MutationObserver((mutations) => records.push(...mutations))
    observer.observe(root, { subtree: true, childList: true, attributes: true })
    applyHeadingCollapsedState(root, new Set(['h2']))
    observer.disconnect()
    expect(headingCollapseNeedsRestamp(records)).toBe(false)
  })
})

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
    setSessionCollapsedHeadingIds([])
    vi.restoreAllMocks()
  })

  async function renderRail(
    editor: EditorMock,
    editorMode: EditorMode = EditorModeEnum.Live,
    nested = false,
    heading = false,
    onPersistChange?: () => void,
  ) {
    await act(async () => {
      root.render(
        <Harness
          editor={editor as unknown as AnyBlockNoteEditor}
          editorMode={editorMode}
          nested={nested}
          heading={heading}
          containerRef={containerRef}
          onPersistChange={onPersistChange}
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

  it('shows grip and add buttons on live-mode block hover', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    await hover(block)

    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail).not.toBeNull()
    expect(rail.dataset.blockActionId).toBe('block-1')
    expect(rail.dataset.blockActionHeading).toBe('false')
    expect(container.querySelector('button[aria-label="editor.blockActions.menu"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="editor.blockActions.add"]')).not.toBeNull()
    expect(container.querySelector('svg.lucide-grip-vertical')).not.toBeNull()
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

  it('keeps the rail outside the content box after the editor scrolls', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    const scroll = container.querySelector('.editor-scroll') as HTMLElement
    const block = container.querySelector('[data-id="block-1"]') as HTMLElement
    mockRect(scroll, { top: 0, left: 0, width: 800, height: 400 })
    mockRect(block, { top: 100, left: 120, width: 600, height: 40 })

    await hover(block)
    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail.style.top).toBe('103px')
    expect(rail.style.left).toBe('120px')

    Object.defineProperty(scroll, 'scrollTop', { configurable: true, value: 80 })
    mockRect(block, { top: 20, left: 120, width: 600, height: 40 })
    await act(async () => {
      scroll.dispatchEvent(new Event('scroll'))
    })
    expect(rail.style.top).toBe('103px')
    expect(rail.style.left).toBe('120px')
  })

  it('keeps both collapse and add controls on headings and persists collapse', async () => {
    const onPersistChange = vi.fn()
    const editor = createEditorMock({
      'heading-1': { id: 'heading-1', type: 'heading' },
      'block-1': { id: 'block-1', type: 'paragraph' },
      'heading-2': { id: 'heading-2', type: 'heading' },
      'child-1': { id: 'child-1', type: 'paragraph' },
    })
    await renderRail(editor, EditorModeEnum.Live, false, true, onPersistChange)
    const heading = container.querySelector('[data-id="heading-1"]') as HTMLElement
    await hover(heading)

    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail.dataset.blockActionHeading).toBe('true')
    expect(container.querySelector('button[aria-label="editor.blockActions.add"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="editor.blockActions.collapse"]')).not.toBeNull()
    expect(container.querySelector('svg.lucide-chevron-down')).not.toBeNull()
    expect(container.querySelector('svg.lucide-plus')).not.toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.collapse"]')?.click()
    })

    expect(onPersistChange).toHaveBeenCalledTimes(1)
    expect(heading.getAttribute(HEADING_COLLAPSED_ATTR)).toBeNull()
    const style = document.querySelector(`style[${HEADING_COLLAPSE_STYLE_ATTR}]`)
    expect(style?.textContent).toContain('[data-id="heading-1"]')
    expect(style?.textContent).toContain('[data-id="block-1"]')
    expect(style?.textContent).not.toContain('[data-id="heading-2"]')
    expect(container.querySelector('svg.lucide-chevron-right')).not.toBeNull()
    expect(container.querySelector('button[aria-label="editor.blockActions.add"]')).not.toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.add"]')?.click()
    })
    expect(editor.insertBlocks).toHaveBeenCalled()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.expand"]')?.click()
    })
    expect(style?.textContent).toBe('')
  })

  it('converts the current block into a mermaid block', async () => {
    const editor = createEditorMock()
    await renderRail(editor)
    await hover(container.querySelector('[data-id="block-1"]') as HTMLElement)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="editor.blockActions.menu"]')?.click()
    })
    const mermaidItem = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent === 'blockActions.mermaid')
    expect(mermaidItem).toBeDefined()
    await act(async () => {
      mermaidItem?.click()
    })
    expect(editor.updateBlock).toHaveBeenCalledWith(
      { id: 'block-1', type: 'paragraph' },
      { type: 'mermaid', props: { source: 'flowchart LR\n  A[Start] --> B[End]' } },
    )
  })

  it('keeps nested block action rails on the editor gutter', async () => {
    const editor = createEditorMock({
      'block-outer': { id: 'block-outer', type: 'paragraph' },
      'block-inner': { id: 'block-inner', type: 'paragraph' },
    })
    await renderRail(editor, EditorModeEnum.Live, true)
    const scroll = container.querySelector('.editor-scroll') as HTMLElement
    const editorEl = container.querySelector('.bn-editor') as HTMLElement
    const inner = container.querySelector('[data-id="block-inner"]') as HTMLElement
    mockRect(scroll, { top: 0, left: 0, width: 800, height: 400 })
    mockRect(editorEl, { top: 0, left: 24, width: 720, height: 400 })
    mockRect(inner, { top: 120, left: 80, width: 560, height: 24 })
    await hover(inner)
    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail.dataset.blockActionId).toBe('block-inner')
    expect(rail.style.left).toBe('24px')
  })

  it('pulls the rail toward content using editor padding', async () => {
    const editor = createEditorMock({
      'block-outer': { id: 'block-outer', type: 'paragraph' },
      'block-inner': { id: 'block-inner', type: 'paragraph' },
    })
    await renderRail(editor, EditorModeEnum.Live, true)
    const scroll = container.querySelector('.editor-scroll') as HTMLElement
    const editorEl = container.querySelector('.bn-editor') as HTMLElement
    const inner = container.querySelector('[data-id="block-inner"]') as HTMLElement
    editorEl.style.paddingLeft = '54px'
    mockRect(scroll, { top: 0, left: 0, width: 800, height: 400 })
    mockRect(editorEl, { top: 0, left: 24, width: 720, height: 400 })
    mockRect(inner, { top: 120, left: 80, width: 560, height: 24 })
    await hover(inner)
    const rail = container.querySelector('.block-action-rail') as HTMLElement
    expect(rail.style.left).toBe('72px')
  })
})
