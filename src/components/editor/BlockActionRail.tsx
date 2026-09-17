import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { placeAroundAnchor } from '../../utils/popupPosition'
import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react'
import { EditorModeEnum, type EditorMode } from '../../types'
import type { AnyBlockNoteEditor } from './blockNoteMarkdown'
import { DEFAULT_MERMAID_SOURCE, mermaidSourceFromCodeContent } from './mermaidBlock'
import {
  applyHeadingCollapsedState,
  BLOCK_SELECTOR,
  findBlockById,
  getBlockPosition,
  headingCollapseNeedsRestamp,
  type BlockPosition,
} from './blockActionHelpers'
import {
  getSessionCollapsedHeadingIds,
  setSessionCollapsedHeadingIds,
  subscribeSessionCollapsedHeadingIds,
} from '../../utils/markdown/headingCollapse'

const HIDE_DELAY_MS = 160

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
  | 'mermaid'
  | 'delete'

export function getBlockActionUpdate(action: Exclude<BlockAction, 'delete' | 'mermaid'>): Record<string, unknown> {
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

type BlockActionRailProps = {
  blockNoteEditor: AnyBlockNoteEditor
  containerRef: RefObject<HTMLElement | null>
  editorMode: EditorMode
  t: Translate
  onPersistChange?: () => void
}

function getEditorScroll(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.editor-scroll')
}

function getBlockFromTarget(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const block = target.closest<HTMLElement>(BLOCK_SELECTOR)
  return block && root.contains(block) ? block : null
}

export function BlockActionRail({ blockNoteEditor, containerRef, editorMode, t, onPersistChange }: BlockActionRailProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeBlockRef = useRef<HTMLElement | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const [position, setPosition] = useState<BlockPosition | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuOpenRef = useRef(menuOpen)
  menuOpenRef.current = menuOpen
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => getSessionCollapsedHeadingIds())
  const collapsedIdsRef = useRef(collapsedIds)
  collapsedIdsRef.current = collapsedIds
  const enabled = editorMode === EditorModeEnum.Live && blockNoteEditor.isEditable !== false

  useEffect(() => {
    const sync = () => setCollapsedIds(getSessionCollapsedHeadingIds())
    sync()
    return subscribeSessionCollapsedHeadingIds(sync)
  }, [blockNoteEditor])

  useLayoutEffect(() => {
    applyHeadingCollapsedState(containerRef.current, enabled ? collapsedIds : new Set())
    return () => applyHeadingCollapsedState(containerRef.current, new Set())
  }, [collapsedIds, containerRef, enabled])

  useEffect(() => {
    const root = containerRef.current
    const cancelHide = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }

    if (!root || !enabled) {
      cancelHide()
      activeBlockRef.current = null
      setPosition(null)
      setMenuOpen(false)
      return
    }

    const scroll = getEditorScroll(root)
    if (!scroll) return

    const clearActiveBlock = () => {
      cancelHide()
      activeBlockRef.current = null
      setPosition(null)
      setMenuOpen(false)
    }

    const scheduleHide = () => {
      if (menuOpenRef.current) return
      cancelHide()
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null
        activeBlockRef.current = null
        setPosition(null)
        setMenuOpen(false)
      }, HIDE_DELAY_MS)
    }

    const showBlock = (target: EventTarget | null) => {
      const block = getBlockFromTarget(target, root)
      if (!block) return
      const nextPosition = getBlockPosition(block, scroll)
      if (!nextPosition) return
      cancelHide()
      activeBlockRef.current = block
      setPosition(nextPosition)
    }

    const relatedTargetKeepsRail = (relatedTarget: EventTarget | null) => {
      if (!(relatedTarget instanceof Node)) return false
      return Boolean(
        activeBlockRef.current?.contains(relatedTarget)
        || railRef.current?.contains(relatedTarget)
        || menuRef.current?.contains(relatedTarget),
      )
    }

    const handleMouseOver = (event: MouseEvent) => {
      cancelHide()
      if (railRef.current?.contains(event.target as Node)) return
      showBlock(event.target)
    }
    const handleFocusIn = (event: FocusEvent) => {
      cancelHide()
      if (railRef.current?.contains(event.target as Node)) return
      showBlock(event.target)
    }
    const handleMouseOut = (event: MouseEvent) => {
      if (!relatedTargetKeepsRail(event.relatedTarget)) scheduleHide()
    }
    const handleFocusOut = (event: FocusEvent) => {
      if (!relatedTargetKeepsRail(event.relatedTarget)) scheduleHide()
    }
    const updatePosition = () => {
      const blockId = activeBlockRef.current?.dataset.id
      const block = blockId ? findBlockById(root, blockId) : null
      if (!block) {
        clearActiveBlock()
        return
      }
      activeBlockRef.current = block
      const nextPosition = getBlockPosition(block, scroll)
      if (nextPosition) setPosition(nextPosition)
      else clearActiveBlock()
    }
    const handleEditorChange = () => {
      updatePosition()
    }
    let restamping = false
    let restampFrame = 0
    let mutationObserver: MutationObserver
    const restampCollapsed = () => {
      if (restamping) return
      restamping = true
      mutationObserver.disconnect()
      try {
        applyHeadingCollapsedState(root, collapsedIdsRef.current)
      } finally {
        mutationObserver.observe(scroll, { subtree: true, childList: true })
        restampFrame = window.requestAnimationFrame(() => {
          restampFrame = 0
          restamping = false
        })
      }
    }
    mutationObserver = new MutationObserver((mutations) => {
      if (restamping || !headingCollapseNeedsRestamp(mutations)) return
      restampCollapsed()
    })
    mutationObserver.observe(scroll, { subtree: true, childList: true })
    const unsubscribeChange = blockNoteEditor.onChange(handleEditorChange)

    root.addEventListener('mouseover', handleMouseOver)
    root.addEventListener('mouseout', handleMouseOut)
    root.addEventListener('focusin', handleFocusIn)
    root.addEventListener('focusout', handleFocusOut)
    scroll.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition)

    return () => {
      cancelHide()
      if (restampFrame) window.cancelAnimationFrame(restampFrame)
      unsubscribeChange?.()
      mutationObserver.disconnect()
      root.removeEventListener('mouseover', handleMouseOver)
      root.removeEventListener('mouseout', handleMouseOut)
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
      scroll.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [blockNoteEditor, containerRef, enabled])

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
      }
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return
      if (railRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    const menu = menuRef.current
    const trigger = railRef.current?.querySelector<HTMLElement>('.block-action-button')
    if (!menuOpen || !menu || !trigger) return
    const update = () => {
      const next = placeAroundAnchor(
        trigger.getBoundingClientRect(),
        { width: menu.offsetWidth, height: menu.scrollHeight },
        { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
        { preferred: ['left', 'right', 'bottom', 'top'] },
      )
      menu.style.left = `${Math.round(next.left)}px`
      menu.style.top = `${Math.round(next.top)}px`
      menu.style.maxHeight = `${Math.round(next.maxHeight)}px`
      menu.style.visibility = 'visible'
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [menuOpen, position])

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
    if (action === 'mermaid') return t('blockActions.mermaid')
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
    } else if (action === 'mermaid') {
      const source = block.type === 'codeBlock'
        ? (mermaidSourceFromCodeContent(block.content) || DEFAULT_MERMAID_SOURCE)
        : DEFAULT_MERMAID_SOURCE
      blockNoteEditor.updateBlock(block, { type: 'mermaid', props: { source } } as never)
    } else {
      blockNoteEditor.updateBlock(block, getBlockActionUpdate(action) as never)
    }
    setMenuOpen(false)
  }

  const insertParagraph = () => {
    const blockId = activeBlockRef.current?.dataset.id || position.blockId
    const block = blockNoteEditor.getBlock(blockId)
    if (!block) return
    if (position.isHeading && collapsedIds.has(blockId)) {
      const next = new Set(collapsedIds)
      next.delete(blockId)
      setCollapsedIds(next)
      setSessionCollapsedHeadingIds(next)
    }
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

  const toggleHeadingCollapse = () => {
    const blockId = activeBlockRef.current?.dataset.id || position.blockId
    setMenuOpen(false)
    const next = new Set(collapsedIds)
    if (next.has(blockId)) next.delete(blockId)
    else next.add(blockId)
    setCollapsedIds(next)
    setSessionCollapsedHeadingIds(next)
    onPersistChange?.()
  }

  const menuLabel = t('editor.blockActions.menu')
  const addLabel = t('editor.blockActions.add')
  const collapseLabel = t('editor.blockActions.collapse')
  const expandLabel = t('editor.blockActions.expand')
  const collapsed = collapsedIds.has(position.blockId)
  const collapseToggleLabel = collapsed ? expandLabel : collapseLabel
  const actions: BlockAction[] = ['paragraph', 'h1', 'h2', 'quote', 'bulletList', 'numberedList', 'todo', 'codeBlock', 'mermaid', 'delete']

  return (
    <>
    <div
      ref={railRef}
      className="block-action-rail"
      data-block-action-id={position.blockId}
      data-block-action-heading={position.isHeading ? 'true' : 'false'}
      data-heading-collapsed={position.isHeading && collapsed ? 'true' : 'false'}
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
          <GripVertical size={16} aria-hidden="true" />
        </button>
        {position.isHeading && (
          <button
            type="button"
            className="block-action-button is-heading-toggle"
            title={collapseToggleLabel}
            aria-label={collapseToggleLabel}
            aria-pressed={collapsed}
            onClick={(event) => {
              event.stopPropagation()
              toggleHeadingCollapse()
            }}
          >
            {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        )}
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
      </div>
      {menuOpen && createPortal(
        <div ref={menuRef} className="block-action-menu" role="menu">
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
        </div>,
        document.body,
      )}
    </>
  )
}
