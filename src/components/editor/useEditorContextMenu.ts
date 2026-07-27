import type { Dispatch, MouseEvent, SetStateAction } from 'react'
import type { AnyBlockNoteEditor } from './blockNoteMarkdown'

type StateSetter = Dispatch<SetStateAction<any>>

export type TableContextAction =
  | 'insert-row-above'
  | 'insert-row-below'
  | 'insert-column-left'
  | 'insert-column-right'
  | 'delete-row'
  | 'delete-column'
  | 'delete-table'

export interface TableContextTarget {
  x: number
  y: number
  blockId: string
  rowIndex: number
  columnIndex: number
}

export interface ImageContextTarget {
  x: number
  y: number
  blockId: string
  width: number | null
  availableWidth: number
  src: string
  alt: string
}

interface EditorContextMenuOptions {
  blockNoteEditor: AnyBlockNoteEditor
  closeEditorOverlays: () => void
  setImageCtxMenu: StateSetter
  setTableCtxMenu: StateSetter
}

type TableRow = { cells: unknown[]; [key: string]: unknown }
type TableContent = { columnWidths?: Array<number | undefined>; rows: TableRow[]; [key: string]: unknown }

function blockIdFromElement(element: Element | null): string | null {
  return element
    ?.closest<HTMLElement>('[data-node-type="blockContainer"][data-id]')
    ?.dataset.id || null
}

function isTableContent(content: unknown): content is TableContent {
  if (!content || typeof content !== 'object') return false
  const rows = (content as { rows?: unknown }).rows
  return Array.isArray(rows) && rows.every((row) => {
    if (!row || typeof row !== 'object') return false
    return Array.isArray((row as { cells?: unknown }).cells)
  })
}

function normalizedWidth(width: string | number | null | undefined): number | undefined {
  const value = typeof width === 'number' ? width : Number.parseInt(width || '', 10)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

export function useEditorContextMenu({
  blockNoteEditor,
  closeEditorOverlays,
  setImageCtxMenu,
  setTableCtxMenu,
}: EditorContextMenuOptions) {
  function clampMenuPos(x: number, y: number, estW = 210, estH = 300) {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - estW - pad)
    const maxY = Math.max(pad, window.innerHeight - estH - pad)
    return {
      x: Math.min(Math.max(pad, x), maxX),
      y: Math.min(Math.max(pad, y), maxY),
    }
  }

  const onScrollContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const imgEl = target.closest('img') as HTMLImageElement | null
    const imageBlockId = blockIdFromElement(imgEl)
    if (imgEl && imageBlockId) {
      const block = blockNoteEditor.getBlock(imageBlockId)
      if (block?.type === 'image') {
        e.preventDefault()
        e.nativeEvent.stopImmediatePropagation()
        const editorElement = imgEl.closest<HTMLElement>('.bn-editor')
        closeEditorOverlays()
        setImageCtxMenu({
          ...clampMenuPos(e.clientX, e.clientY, 220, 250),
          blockId: imageBlockId,
          width: typeof block.props.previewWidth === 'number' ? block.props.previewWidth : null,
          availableWidth: editorElement?.clientWidth
            || imgEl.parentElement?.clientWidth
            || imgEl.clientWidth
            || (typeof block.props.previewWidth === 'number' ? block.props.previewWidth : 0)
            || imgEl.naturalWidth
            || 900,
          src: typeof block.props.url === 'string' ? block.props.url : imgEl.src,
          alt: typeof block.props.name === 'string' ? block.props.name : imgEl.alt,
        } satisfies ImageContextTarget)
        return
      }
    }

    const cell = target.closest('td, th') as HTMLTableCellElement | null
    const tableBlockId = blockIdFromElement(cell)
    if (cell && tableBlockId) {
      const block = blockNoteEditor.getBlock(tableBlockId)
      if (block?.type === 'table') {
        e.preventDefault()
        e.nativeEvent.stopImmediatePropagation()
        closeEditorOverlays()
        setTableCtxMenu({
          ...clampMenuPos(e.clientX, e.clientY, 210, 300),
          blockId: tableBlockId,
          rowIndex: cell.parentElement instanceof HTMLTableRowElement ? cell.parentElement.rowIndex : 0,
          columnIndex: cell.cellIndex,
        } satisfies TableContextTarget)
        return
      }
    }
    // Keep the native text menu so the system dictionary can show spelling suggestions.
  }

  function applyTableContextAction(target: TableContextTarget, action: TableContextAction) {
    const block = blockNoteEditor.getBlock(target.blockId)
    if (block?.type !== 'table' || !isTableContent(block.content)) return

    if (action === 'delete-table') {
      blockNoteEditor.removeBlocks([block])
      return
    }

    const rows = block.content.rows.map((row) => ({ ...row, cells: [...row.cells] }))
    const rowIndex = Math.min(Math.max(target.rowIndex, 0), Math.max(rows.length - 1, 0))
    const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
    const columnIndex = Math.min(Math.max(target.columnIndex, 0), Math.max(columnCount - 1, 0))
    const columnWidths = Array.isArray(block.content.columnWidths)
      ? [...block.content.columnWidths]
      : Array.from({ length: columnCount }, () => undefined)

    if (action === 'insert-row-above' || action === 'insert-row-below') {
      const newRow = { cells: Array.from({ length: Math.max(columnCount, 1) }, () => []) }
      rows.splice(rowIndex + (action === 'insert-row-below' ? 1 : 0), 0, newRow)
    } else if (action === 'insert-column-left' || action === 'insert-column-right') {
      const insertAt = columnIndex + (action === 'insert-column-right' ? 1 : 0)
      for (const row of rows) row.cells.splice(insertAt, 0, [])
      columnWidths.splice(insertAt, 0, undefined)
    } else if (action === 'delete-row') {
      if (rows.length <= 1) {
        blockNoteEditor.removeBlocks([block])
        return
      }
      rows.splice(rowIndex, 1)
    } else if (action === 'delete-column') {
      if (columnCount <= 1) {
        blockNoteEditor.removeBlocks([block])
        return
      }
      for (const row of rows) row.cells.splice(columnIndex, 1)
      columnWidths.splice(columnIndex, 1)
    }

    const nextColumnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
    blockNoteEditor.updateBlock(block, {
      content: {
        ...block.content,
        columnWidths: Array.from({ length: nextColumnCount }, (_, index) => columnWidths[index]),
        rows,
      },
    } as never)
  }

  function setImagePreviewWidth(blockId: string, width: string | number | null | undefined) {
    const block = blockNoteEditor.getBlock(blockId)
    if (block?.type !== 'image') return
    blockNoteEditor.updateBlock(block, {
      props: { previewWidth: normalizedWidth(width) },
    } as never)
  }

  function removeImage(blockId: string) {
    const block = blockNoteEditor.getBlock(blockId)
    if (block?.type === 'image') blockNoteEditor.removeBlocks([block])
  }

  return {
    onScrollContextMenu,
    applyTableContextAction,
    setImagePreviewWidth,
    removeImage,
  }
}
