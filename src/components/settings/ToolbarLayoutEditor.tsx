import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { ToolbarButtonConfig, ToolbarButtonId, ToolbarItemId } from '../../types'
import {
  getToolbarButtonDefinition,
  isToolbarButtonId,
  isToolbarItemId,
  isToolbarSeparatorId,
  moveToolbarItem,
  resolveToolbarItems,
  type ToolbarDropZone,
} from '../../utils/toolbar'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface ToolbarLayoutEditorProps {
  t: Translator
  value: ToolbarButtonConfig[]
  onChange: (items: ToolbarButtonConfig[]) => void
}

interface DropTarget {
  zone: ToolbarDropZone
  index: number
}

const TOOLBAR_BUTTON_SYMBOLS: Record<ToolbarButtonId, ReactNode> = {
  heading: <strong>H</strong>,
  bold: <strong>B</strong>,
  italic: <em>I</em>,
  strike: <s>S</s>,
  code: '</>',
  quote: '❝',
  ul: '≡',
  ol: '1.',
  todo: '☐',
  hr: '―',
  table: '▦',
  link: String.fromCodePoint(0x1F517),
  wikilink: '[[]]',
  image: String.fromCodePoint(0x1F5BC),
  codeblock: '{}',
  slash: '/',
  snippets: '☷',
  spellCheck: 'Aa✓',
  presentation: '▣',
}

export function ToolbarLayoutEditor({ t, value, onChange }: ToolbarLayoutEditorProps) {
  const items = resolveToolbarItems(value)
  const visibleItems = items.filter((item) => item.placement !== 'hidden')
  const hiddenItems = items.filter((item) => item.placement === 'hidden')
  const [draggedId, setDraggedId] = useState<ToolbarItemId | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)

  function itemTitle(id: ToolbarItemId) {
    return isToolbarButtonId(id) ? t(getToolbarButtonDefinition(id).labelKey) : t('settings.toolbarDivider')
  }

  function updateDropTarget(target: DropTarget | null) {
    dropTargetRef.current = target
    setDropTarget(target)
  }

  function clearDragState() {
    setDraggedId(null)
    updateDropTarget(null)
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, id: ToolbarItemId) {
    setDraggedId(id)
    updateDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function handleDragOver(event: DragEvent<HTMLElement>, target: DropTarget) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (dropTargetRef.current?.zone !== target.zone || dropTargetRef.current.index !== target.index) {
      updateDropTarget(target)
    }
  }

  function handleItemDragOver(event: DragEvent<HTMLDivElement>, zone: ToolbarDropZone, index: number) {
    const rect = event.currentTarget.getBoundingClientRect()
    const targetIndex = event.clientX < rect.left + rect.width / 2 ? index : index + 1
    handleDragOver(event, { zone, index: targetIndex })
  }

  function handleDrop(event: DragEvent<HTMLElement>, fallbackTarget: DropTarget) {
    event.preventDefault()
    event.stopPropagation()
    const transferredId = event.dataTransfer.getData('text/plain')
    const id = draggedId || (isToolbarItemId(transferredId) ? transferredId : null)
    const target = dropTargetRef.current || fallbackTarget
    if (id) onChange(moveToolbarItem(items, id, target.zone, target.index))
    clearDragState()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, id: ToolbarItemId, zone: ToolbarDropZone, index: number) {
    const zoneItems = zone === 'toolbar' ? visibleItems : hiddenItems
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const targetZone = zone === 'toolbar' ? 'hidden' : 'toolbar'
      const targetLength = targetZone === 'toolbar' ? visibleItems.length : hiddenItems.length
      onChange(moveToolbarItem(items, id, targetZone, targetLength))
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex = event.key === 'ArrowLeft' ? Math.max(0, index - 1) : Math.min(zoneItems.length, index + 2)
    onChange(moveToolbarItem(items, id, zone, nextIndex))
  }

  function renderItem(item: ToolbarButtonConfig, zone: ToolbarDropZone, index: number) {
    const title = itemTitle(item.id)
    const isSeparator = isToolbarSeparatorId(item.id)
    const before = dropTarget?.zone === zone && dropTarget.index === index
    const after = dropTarget?.zone === zone && dropTarget.index === index + 1
    return (
      <div
        key={item.id}
        className={`toolbar-layout-item ${isSeparator ? 'is-separator' : ''} ${draggedId === item.id ? 'is-dragging' : ''} ${before ? 'drop-before' : ''} ${after ? 'drop-after' : ''}`.trim()}
        title={title}
        role="button"
        tabIndex={0}
        draggable
        aria-label={title}
        data-toolbar-layout-item={item.id}
        onDragStart={(event) => handleDragStart(event, item.id)}
        onDragOver={(event) => handleItemDragOver(event, zone, index)}
        onDrop={(event) => handleDrop(event, { zone, index })}
        onDragEnd={clearDragState}
        onKeyDown={(event) => handleKeyDown(event, item.id, zone, index)}
      >
        {isSeparator ? <span className="toolbar-layout-divider" /> : TOOLBAR_BUTTON_SYMBOLS[item.id as ToolbarButtonId]}
      </div>
    )
  }

  function renderZone(zone: ToolbarDropZone, zoneItems: ToolbarButtonConfig[]) {
    const isVisible = zone === 'toolbar'
    const title = t(isVisible ? 'settings.toolbarVisible' : 'settings.toolbarHidden')
    const hint = t(isVisible ? 'settings.toolbarVisible.hint' : 'settings.toolbarHidden.hint')
    return (
      <section className={`toolbar-drop-zone ${dropTarget?.zone === zone ? 'is-active' : ''}`.trim()}>
        <header className="toolbar-drop-zone-header">
          <div>
            <div className="settings-label">{title}</div>
            <div className="settings-hint">{hint}</div>
          </div>
          <span className="toolbar-drop-zone-count">{zoneItems.length}</span>
        </header>
        <div
          className="toolbar-layout-strip"
          role="list"
          aria-label={title}
          onDragOver={(event) => handleDragOver(event, { zone, index: zoneItems.length })}
          onDrop={(event) => handleDrop(event, { zone, index: zoneItems.length })}
        >
          {zoneItems.map((item, index) => renderItem(item, zone, index))}
          {zoneItems.length === 0 && <span className="toolbar-drop-empty">{t('settings.toolbarDropEmpty')}</span>}
        </div>
      </section>
    )
  }

  return (
    <div className="toolbar-layout-zones">
      {renderZone('toolbar', visibleItems)}
      {renderZone('hidden', hiddenItems)}
    </div>
  )
}
