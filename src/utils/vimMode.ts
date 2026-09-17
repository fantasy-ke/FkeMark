export type VimMode = 'normal' | 'insert'

export type VimMotion = 'h' | 'j' | 'k' | 'l' | 'lineStart' | 'lineEnd' | 'word' | 'backWord'

export type VimAction =
  | { type: 'passthrough' }
  | { type: 'ignore' }
  | { type: 'mode'; mode: VimMode }
  | { type: 'move'; motion: VimMotion }
  | { type: 'deleteChar' }
  | { type: 'openLine'; above: boolean }
  | { type: 'insert'; where: 'here' | 'after' | 'lineStart' | 'lineEnd' }

export type VimKeyEvent = {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  isComposing?: boolean
}

export type VimBuffer = {
  text: string
  from: number
  to: number
}

const WORD_RE = /[0-9A-Za-z_\u4e00-\u9fff]/

export function vimActionFromKey(mode: VimMode, event: VimKeyEvent): VimAction {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return { type: 'passthrough' }
  const { key } = event
  if (mode === 'insert') {
    return key === 'Escape' ? { type: 'mode', mode: 'normal' } : { type: 'passthrough' }
  }
  switch (key) {
    case 'Escape':
      return { type: 'ignore' }
    case 'h':
    case 'ArrowLeft':
      return { type: 'move', motion: 'h' }
    case 'j':
    case 'ArrowDown':
      return { type: 'move', motion: 'j' }
    case 'k':
    case 'ArrowUp':
      return { type: 'move', motion: 'k' }
    case 'l':
    case 'ArrowRight':
      return { type: 'move', motion: 'l' }
    case '0':
      return { type: 'move', motion: 'lineStart' }
    case '$':
      return { type: 'move', motion: 'lineEnd' }
    case 'w':
      return { type: 'move', motion: 'word' }
    case 'b':
      return { type: 'move', motion: 'backWord' }
    case 'x':
      return { type: 'deleteChar' }
    case 'i':
      return { type: 'insert', where: 'here' }
    case 'a':
      return { type: 'insert', where: 'after' }
    case 'I':
      return { type: 'insert', where: 'lineStart' }
    case 'A':
      return { type: 'insert', where: 'lineEnd' }
    case 'o':
      return { type: 'openLine', above: false }
    case 'O':
      return { type: 'openLine', above: true }
    default:
      return key.length === 1 ? { type: 'ignore' } : { type: 'passthrough' }
  }
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(length, index))
}

function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', Math.max(0, index) - 1) + 1
}

function lineEnd(text: string, index: number): number {
  const next = text.indexOf('\n', index)
  return next === -1 ? text.length : next
}

function moveVertical(text: string, index: number, direction: -1 | 1): number {
  const start = lineStart(text, index)
  const column = index - start
  if (direction < 0) {
    if (start === 0) return index
    const prevEnd = start - 1
    const prevStart = lineStart(text, prevEnd)
    return Math.min(prevStart + column, prevEnd)
  }
  const end = lineEnd(text, index)
  if (end >= text.length) return index
  const nextStart = end + 1
  return Math.min(nextStart + column, lineEnd(text, nextStart))
}

function nextWord(text: string, index: number): number {
  const length = text.length
  let i = index
  if (i >= length) return length
  if (WORD_RE.test(text[i] ?? '')) {
    while (i < length && WORD_RE.test(text[i] ?? '')) i += 1
    while (i < length && !WORD_RE.test(text[i] ?? '')) i += 1
  } else {
    while (i < length && !WORD_RE.test(text[i] ?? '')) i += 1
  }
  return i
}

function backWord(text: string, index: number): number {
  let i = index
  if (i <= 0) return 0
  i -= 1
  while (i > 0 && !WORD_RE.test(text[i] ?? '')) i -= 1
  while (i > 0 && WORD_RE.test(text[i - 1] ?? '')) i -= 1
  return i
}

function moveCaret(text: string, index: number, motion: VimMotion): number {
  switch (motion) {
    case 'h':
      return clamp(index - 1, text.length)
    case 'l':
      return clamp(index + 1, text.length)
    case 'j':
      return moveVertical(text, index, 1)
    case 'k':
      return moveVertical(text, index, -1)
    case 'lineStart':
      return lineStart(text, index)
    case 'lineEnd':
      return lineEnd(text, index)
    case 'word':
      return nextWord(text, index)
    case 'backWord':
      return backWord(text, index)
  }
}

export function applyVimToBuffer(mode: VimMode, event: VimKeyEvent, buffer: VimBuffer): {
  mode: VimMode
  buffer: VimBuffer
  handled: boolean
} {
  const action = vimActionFromKey(mode, event)
  if (action.type === 'passthrough') return { mode, buffer, handled: false }
  if (action.type === 'ignore') return { mode, buffer, handled: true }
  if (action.type === 'mode') return { mode: action.mode, buffer, handled: true }

  const caret = buffer.from === buffer.to ? buffer.from : Math.min(buffer.from, buffer.to)
  const { text } = buffer

  if (action.type === 'move') {
    const next = moveCaret(text, caret, action.motion)
    return { mode, buffer: { text, from: next, to: next }, handled: true }
  }

  if (action.type === 'deleteChar') {
    const from = buffer.from === buffer.to ? caret : Math.min(buffer.from, buffer.to)
    const to = buffer.from === buffer.to ? Math.min(text.length, caret + 1) : Math.max(buffer.from, buffer.to)
    const nextText = `${text.slice(0, from)}${text.slice(to)}`
    return { mode, buffer: { text: nextText, from, to: from }, handled: true }
  }

  if (action.type === 'insert') {
    let next = caret
    if (action.where === 'after') next = clamp(caret + 1, text.length)
    if (action.where === 'lineStart') next = lineStart(text, caret)
    if (action.where === 'lineEnd') next = lineEnd(text, caret)
    return { mode: 'insert', buffer: { text, from: next, to: next }, handled: true }
  }

  const start = lineStart(text, caret)
  const end = lineEnd(text, caret)
  if (action.above) {
    const nextText = `${text.slice(0, start)}\n${text.slice(start)}`
    return { mode: 'insert', buffer: { text: nextText, from: start, to: start }, handled: true }
  }
  const nextText = `${text.slice(0, end)}\n${text.slice(end)}`
  const next = end + 1
  return { mode: 'insert', buffer: { text: nextText, from: next, to: next }, handled: true }
}
