import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { ToolbarButtonConfig, ToolbarButtonId, ToolbarItemId } from '../../types'
import {
  getToolbarButtonDefinition,
  isToolbarButtonId,
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

interface PointerDragState {
  id: ToolbarItemId
  pointerId: number
  startX: number
  startY: number
  dragging: boolean
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
  versions: '◷',
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
  const pointerDragRef = useRef<PointerDragState | null>(null)
  const zoneRefs = useRef<Record<ToolbarDropZone, HTMLDivElement | null>>({ toolbar: null, hidden: null })

  function itemTitle(id: ToolbarItemId) {
    return isToolbarButtonId(id) ? t(getToolbarButtonDefinition(id).labelKey) : t('settings.toolbarDivider')
  }

  function updateDropTarget(target: DropTarget | null) {
    if (dropTargetRef.current?.zone === target?.zone && dropTargetRef.current?.index === target?.index) return
    dropTargetRef.current = target
    setDropTarget(target)
  }

  function clearDragState() {
    pointerDragRef.current = null
    setDraggedId(null)
    updateDropTarget(null)
  }

  function findDropIndex(strip: HTMLDivElement, clientX: number, clientY: number) {
    const positionedItems = Array.from(strip.querySelectorAll<HTMLElement>('[data-toolbar-layout-item]'))
      .map((element, index) => ({ index, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    if (positionedItems.length === 0) return 0

    const rows: typeof positionedItems[] = []
    for (const item of positionedItems) {
      const row = rows.at(-1)
      if (!row || Math.abs(row[0].rect.top - item.rect.top) > 4) rows.push([item])
      else row.push(item)
    }
    const row = rows.reduce((closest, candidate) => {
      const closestY = closest[0].rect.top + closest[0].rect.height / 2
      const candidateY = candidate[0].rect.top + candidate[0].rect.height / 2
      return Math.abs(clientY - candidateY) < Math.abs(clientY - closestY) ? candidate : closest
    })
    const nextItem = row.find(({ rect }) => clientX < rect.left + rect.width / 2)
    return nextItem ? nextItem.index : row[row.length - 1].index + 1
  }

  function findDropTarget(clientX: number, clientY: number): DropTarget | null {
    for (const zone of ['toolbar', 'hidden'] as const) {
      const strip = zoneRefs.current[zone]
      if (!strip) continue
      const rect = strip.getBoundingClientRect()
      const right = rect.right || rect.left + rect.width
      const bottom = rect.bottom || rect.top + rect.height
      if (clientX >= rect.left && clientX <= right && clientY >= rect.top && clientY <= bottom) {
        return { zone, index: findDropIndex(strip, clientX, clientY) }
      }
    }
    return null
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, id: ToolbarItemId) {
    if (event.button !== 0 || pointerDragRef.current) return
    pointerDragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
      drag.dragging = true
      setDraggedId(drag.id)
    }
    event.preventDefault()
    updateDropTarget(findDropTarget(event.clientX, event.clientY))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = drag.dragging ? findDropTarget(event.clientX, event.clientY) : null
    if (target) onChange(moveToolbarItem(items, drag.id, target.zone, target.index))
    clearDragState()
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerDragRef.current?.pointerId === event.pointerId) clearDragState()
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
        aria-label={title}
        data-toolbar-layout-item={item.id}
        onPointerDown={(event) => handlePointerDown(event, item.id)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={clearDragState}
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
          ref={(node) => { zoneRefs.current[zone] = node }}
          className="toolbar-layout-strip"
          role="list"
          aria-label={title}
          data-toolbar-layout-zone={zone}
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
