import { useEffect, useRef } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { EditorModeEnum, type EditorMode } from '../../types'
import { applyVimToBuffer, vimActionFromKey, type VimMode, type VimMotion } from '../../utils/vimMode'

type UseVimModeOptions = {
  enabled: boolean
  editorMode: EditorMode
  editor: TiptapEditor | null
}

const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

function setVimModeAttr(mode: VimMode | null) {
  if (mode) document.body.dataset.vimMode = mode
  else delete document.body.dataset.vimMode
}

function clampPos(editor: TiptapEditor, pos: number): number {
  const size = editor.state.doc.content.size
  return Math.max(1, Math.min(size - 1, pos))
}

function moveLive(editor: TiptapEditor, motion: VimMotion) {
  const { from, $from } = editor.state.selection
  if (motion === 'h') {
    editor.commands.setTextSelection(clampPos(editor, from - 1))
    return
  }
  if (motion === 'l') {
    editor.commands.setTextSelection(clampPos(editor, from + 1))
    return
  }
  if (motion === 'lineStart') {
    editor.commands.setTextSelection($from.start())
    return
  }
  if (motion === 'lineEnd') {
    editor.commands.setTextSelection($from.end())
    return
  }
  if (motion === 'word') {
    editor.commands.setTextSelection(clampPos(editor, from + 1))
    return
  }
  if (motion === 'backWord') {
    editor.commands.setTextSelection(clampPos(editor, from - 1))
    return
  }
  try {
    const coords = editor.view.coordsAtPos(from)
    const lineHeight = Math.max(16, coords.bottom - coords.top)
    const dir = motion === 'j' ? 1 : -1
    const next = editor.view.posAtCoords({
      left: coords.left,
      top: coords.top + dir * lineHeight + dir,
    })
    if (next) editor.commands.setTextSelection(clampPos(editor, next.pos))
  } catch { /* 某些块边界无法取坐标 */ }
}

function applyLiveAction(editor: TiptapEditor, mode: VimMode, event: KeyboardEvent): VimMode {
  const action = vimActionFromKey(mode, event)
  if (action.type === 'passthrough') return mode
  event.preventDefault()
  event.stopPropagation()
  if (action.type === 'ignore') return mode
  if (action.type === 'mode') return action.mode
  if (action.type === 'move') {
    moveLive(editor, action.motion)
    return mode
  }
  if (action.type === 'deleteChar') {
    const { from, to, empty } = editor.state.selection
    if (empty) editor.commands.deleteRange({ from, to: clampPos(editor, from + 1) })
    else editor.commands.deleteRange({ from, to })
    return mode
  }
  if (action.type === 'insert') {
    const { from, $from } = editor.state.selection
    if (action.where === 'after') editor.commands.setTextSelection(clampPos(editor, from + 1))
    if (action.where === 'lineStart') editor.commands.setTextSelection($from.start())
    if (action.where === 'lineEnd') editor.commands.setTextSelection($from.end())
    return 'insert'
  }
  const { $from } = editor.state.selection
  if (action.above) editor.chain().setTextSelection($from.start()).splitBlock().run()
  else editor.chain().setTextSelection($from.end()).splitBlock().run()
  return 'insert'
}

function applyTextareaVim(textarea: HTMLTextAreaElement, mode: VimMode, event: KeyboardEvent): VimMode {
  const result = applyVimToBuffer(mode, event, {
    text: textarea.value,
    from: textarea.selectionStart,
    to: textarea.selectionEnd,
  })
  if (!result.handled) return mode
  event.preventDefault()
  event.stopPropagation()
  if (result.buffer.text !== textarea.value) {
    textareaValueSetter?.call(textarea, result.buffer.text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
  textarea.setSelectionRange(result.buffer.from, result.buffer.to)
  return result.mode
}

export function useVimMode({ enabled, editorMode, editor }: UseVimModeOptions) {
  const modeRef = useRef<VimMode>('normal')

  useEffect(() => {
    modeRef.current = 'normal'
    if (!enabled || editorMode === EditorModeEnum.Read) {
      setVimModeAttr(null)
      return
    }
    setVimModeAttr('normal')
    const sourceMode = editorMode === EditorModeEnum.Source || editorMode === EditorModeEnum.Split

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (sourceMode) {
        if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains('source-textarea')) return
        modeRef.current = applyTextareaVim(target, modeRef.current, event)
        setVimModeAttr(modeRef.current)
        return
      }
      if (editorMode !== EditorModeEnum.Live || !editor?.view?.dom) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (!editor.view.dom.contains(target)) return
      modeRef.current = applyLiveAction(editor, modeRef.current, event)
      setVimModeAttr(modeRef.current)
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      setVimModeAttr(null)
    }
  }, [enabled, editor, editorMode])
}
