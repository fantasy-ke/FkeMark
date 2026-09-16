import { useEffect, useRef, useState, type RefObject } from 'react'
import { MoreVertical, Plus } from 'lucide-react'
import { EditorModeEnum, type EditorMode } from '../../types'
import type { AnyBlockNoteEditor } from './blockNoteMarkdown'

const BLOCK_SELECTOR = '[data-node-type="blockContainer"][data-id]'
const RAIL_HEIGHT = 24

type Translate = (key: string, params?: Record<string, string | number>) => string

export type BlockAction =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'quote'
  | 'bulletList'
  | 'numberedList'
  | 'todo'
  | 'codeBlock'
  | 'delete'

export function getBlockActionUpdate(action: Exclude<BlockAction, 'delete'>): Record<string, unknown> {
  switch (action) {
    case 'paragraph':
      return { type: 'paragraph' }
    case 'h1':
      return { type: 'heading', props: { level: 1 } }
    case 'h2':
      return { type: 'heading', props: { level: 2 } }
    case 'quote':
      return { type: 'quote' }
    case 'bulletList':
      return { type: 'bulletListItem' }
    case 'numberedList':
      return { type: 'numberedListItem' }
    case 'todo':
      return { type: 'checkListItem', props: { checked: false } }
    case 'codeBlock':
      return { type: 'codeBlock', props: { language: 'text' } }
  }
}

type BlockPosition = {
  blockId: string
  top: number
  left: number
}

type BlockActionRailProps = {
  blockNoteEditor: AnyBlockNoteEditor
  containerRef: RefObject<HTMLElement | null>
  editorMode: EditorMode
  t: Translate
}

function getEditorScroll(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.editor-scroll')
}

function getBlockFromTarget(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const block = target.closest<HTMLElement>(BLOCK_SELECTOR)
  return block && root.contains(block) ? block : null
}

function getBlockPosition(block: HTMLElement, scroll: HTMLElement): BlockPosition | null {
  const blockId = block.dataset.id
  if (!blockId) return null
  const blockRect = block.getBoundingClientRect()
  const scrollRect = scroll.getBoundingClientRect()
  // 绝对定位相对滚动容器内容原点，必须加回 scrollTop/scrollLeft，否则滚动后轨道会错位。
  return {
    blockId,
    top: blockRect.top - scrollRect.top + scroll.scrollTop + Math.max(0, (blockRect.height - RAIL_HEIGHT) / 2),
    left: Math.max(52, blockRect.left - scrollRect.left + scroll.scrollLeft - 8),
  }
}

export function BlockActionRail({ blockNoteEditor, containerRef, editorMode, t }: BlockActionRailProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const activeBlockRef = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState<BlockPosition | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const enabled = editorMode === EditorModeEnum.Live && blockNoteEditor.isEditable !== false

  useEffect(() => {
    const root = containerRef.current
    if (!root || !enabled) {
      activeBlockRef.current = null
      setPosition(null)
      setMenuOpen(false)
      return
    }

    const scroll = getEditorScroll(root)
    if (!scroll) return

    const clearActiveBlock = () => {
      activeBlockRef.current = null
      setPosition(null)
      setMenuOpen(false)
    }

    const showBlock = (target: EventTarget | null) => {
      const block = getBlockFromTarget(target, root)
      if (!block) return
      const nextPosition = getBlockPosition(block, scroll)
      if (!nextPosition) return
      activeBlockRef.current = block
      setPosition(nextPosition)
    }

    const relatedTargetKeepsRail = (relatedTarget: EventTarget | null) => {
      if (!(relatedTarget instanceof Node)) return false
      return Boolean(activeBlockRef.current?.contains(relatedTarget) || railRef.current?.contains(relatedTarget))
    }

    const handleMouseOver = (event: MouseEvent) => showBlock(event.target)
    const handleFocusIn = (event: FocusEvent) => showBlock(event.target)
    const handleMouseOut = (event: MouseEvent) => {
      if (!relatedTargetKeepsRail(event.relatedTarget)) clearActiveBlock()
    }
    const handleFocusOut = (event: FocusEvent) => {
      if (!relatedTargetKeepsRail(event.relatedTarget)) clearActiveBlock()
    }
    const updatePosition = () => {
      const block = activeBlockRef.current
      if (!block || !root.contains(block)) {
        clearActiveBlock()
        return
      }
      const nextPosition = getBlockPosition(block, scroll)
      if (nextPosition) setPosition(nextPosition)
      else clearActiveBlock()
    }

    root.addEventListener('mouseover', handleMouseOver)
    root.addEventListener('mouseout', handleMouseOut)
    root.addEventListener('focusin', handleFocusIn)
    root.addEventListener('focusout', handleFocusOut)
    scroll.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition)

    return () => {
      root.removeEventListener('mouseover', handleMouseOver)
      root.removeEventListener('mouseout', handleMouseOut)
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
      scroll.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [containerRef, enabled])

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
      }
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !railRef.current?.contains(event.target)) setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [menuOpen])

  if (!enabled || !position) return null

  const blockActionLabel = (action: BlockAction) => {
    if (action === 'h1') return t('blockActions.heading1')
    if (action === 'h2') return t('blockActions.heading2')
    if (action === 'paragraph') return t('blockActions.paragraph')
    if (action === 'quote') return t('blockActions.quote')
    if (action === 'bulletList') return t('blockActions.bulletList')
    if (action === 'numberedList') return t('blockActions.numberedList')
    if (action === 'todo') return t('blockActions.todo')
    if (action === 'codeBlock') return t('blockActions.codeBlock')
    return t('editor.blockActions.delete')
  }

  const applyBlockAction = (action: BlockAction) => {
    const blockId = activeBlockRef.current?.dataset.id || position.blockId
    const block = blockNoteEditor.getBlock(blockId)
    if (!block) {
      setMenuOpen(false)
      return
    }

    if (action === 'delete') {
      blockNoteEditor.removeBlocks([block])
      activeBlockRef.current = null
      setPosition(null)
    } else {
      blockNoteEditor.updateBlock(block, getBlockActionUpdate(action) as never)
    }
    setMenuOpen(false)
  }

  const insertParagraph = () => {
    const blockId = activeBlockRef.current?.dataset.id || position.blockId
    const block = blockNoteEditor.getBlock(blockId)
    if (!block) return
    const insertedBlocks = blockNoteEditor.insertBlocks(
      [{ type: 'paragraph', content: [], children: [] }] as never[],
      block.id,
      'after',
    )
    const insertedBlock = insertedBlocks[0]
    setMenuOpen(false)
    if (!insertedBlock) return
    blockNoteEditor.setTextCursorPosition(insertedBlock.id, 'start')
    blockNoteEditor.focus()
  }

  const menuLabel = t('editor.blockActions.menu')
  const addLabel = t('editor.blockActions.add')
  const actions: BlockAction[] = ['paragraph', 'h1', 'h2', 'quote', 'bulletList', 'numberedList', 'todo', 'codeBlock', 'delete']

  return (
    <div
      ref={railRef}
      className="block-action-rail"
      data-block-action-id={position.blockId}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="block-action-buttons">
        <button
          type="button"
          className="block-action-button"
          title={menuLabel}
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((open) => !open)
          }}
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="block-action-button"
          title={addLabel}
          aria-label={addLabel}
          onClick={(event) => {
            event.stopPropagation()
            insertParagraph()
          }}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {menuOpen && (
        <div className="block-action-menu" role="menu">
          {actions.map((action) => {
            const label = blockActionLabel(action)
            return (
              <button
                key={action}
                type="button"
                role="menuitem"
                className={`block-action-menu-item${action === 'delete' ? ' is-destructive' : ''}`}
                title={label}
                onClick={(event) => {
                  event.stopPropagation()
                  applyBlockAction(action)
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
