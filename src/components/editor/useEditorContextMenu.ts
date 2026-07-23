import type { Dispatch, SetStateAction } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'

type StateSetter = Dispatch<SetStateAction<any>>

interface EditorContextMenuOptions {
  editor: TiptapEditor | null
  closeEditorOverlays: () => void
  setImageCtxMenu: StateSetter
  setTableCtxMenu: StateSetter
}

export function useEditorContextMenu({
  editor,
  closeEditorOverlays,
  setImageCtxMenu,
  setTableCtxMenu,
}: EditorContextMenuOptions) {
  // 将菜单定位钳制在视口内
  function clampMenuPos(x: number, y: number, estW = 210, estH = 300) {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - estW - pad)
    const maxY = Math.max(pad, window.innerHeight - estH - pad)
    return {
      x: Math.min(Math.max(pad, x), maxX),
      y: Math.min(Math.max(pad, y), maxY),
    }
  }

  const onScrollContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.nativeEvent.stopImmediatePropagation()
    const target = e.target as HTMLElement

    // 图片右键
    const imgEl = target.closest('img') as HTMLImageElement | null
    if (imgEl) {
      const imgPos = findImagePos(imgEl)
      if (imgPos !== null) {
        const node = editor?.state.doc.nodeAt(imgPos)
        closeEditorOverlays()
        setImageCtxMenu({
          ...clampMenuPos(e.clientX, e.clientY, 220, 200),
          pos: imgPos,
          width: node?.attrs?.width ?? null,
          height: node?.attrs?.height ?? null,
          widthUnit: node?.attrs?.widthUnit ?? 'px',
          heightUnit: node?.attrs?.heightUnit ?? 'px',
          src: imgEl.src,
        })
        return
      }
    }

    // 表格单元格右键
    if (target.closest('table.editor-table, .tableWrapper')) {
      closeEditorOverlays()
      setTableCtxMenu(clampMenuPos(e.clientX, e.clientY, 210, 300))
      return
    }
    // 通用右键菜单已移除：仅保留表格和图片区域的上下文菜单
  }

  // 查找图片节点在 ProseMirror 文档中的位置
  function findImagePos(imgEl: HTMLImageElement): number | null {
    if (!editor) return null
    let pos: number | null = null
    editor.state.doc.descendants((node, nodePos) => {
      if (pos !== null) return false
      if (node.type.name === 'image') {
        if (node.attrs.src === imgEl.getAttribute('src')) {
          pos = nodePos
          return false
        }
      }
      return true
    })
    return pos
  }

  // 图片尺寸实时预览
  function applyImageSizePreview(_pos: number, width: string | null, height: string | null, widthUnit: string, heightUnit: string) {
    if (!editor) return
    const w = width ? parseInt(width, 10) : null
    const h = height ? parseInt(height, 10) : null
    editor.commands.updateImageSize({ width: w, height: h, widthUnit, heightUnit })
  }

  return { onScrollContextMenu, applyImageSizePreview }
}
