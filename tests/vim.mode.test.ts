import { describe, expect, it } from 'vitest'
import { applyVimToBuffer, vimActionFromKey } from '../src/utils/vimMode'

describe('vim mode key map', () => {
  it('lets insert-mode typing pass through until Escape', () => {
    expect(vimActionFromKey('insert', { key: 'h' })).toEqual({ type: 'passthrough' })
    expect(vimActionFromKey('insert', { key: 'Escape' })).toEqual({ type: 'mode', mode: 'normal' })
  })

  it('maps advertised normal-mode motions and ignores modifiers', () => {
    expect(vimActionFromKey('normal', { key: 'h' })).toEqual({ type: 'move', motion: 'h' })
    expect(vimActionFromKey('normal', { key: 'j' })).toEqual({ type: 'move', motion: 'j' })
    expect(vimActionFromKey('normal', { key: 'k' })).toEqual({ type: 'move', motion: 'k' })
    expect(vimActionFromKey('normal', { key: 'l' })).toEqual({ type: 'move', motion: 'l' })
    expect(vimActionFromKey('normal', { key: 'i' })).toEqual({ type: 'insert', where: 'here' })
    expect(vimActionFromKey('normal', { key: 'h', ctrlKey: true })).toEqual({ type: 'passthrough' })
  })
})

describe('vim buffer adapter', () => {
  it('moves with h/j/k/l and keeps other keys from inserting in normal mode', () => {
    let state = applyVimToBuffer('normal', { key: 'l' }, { text: 'ab\ncd', from: 0, to: 0 })
    expect(state.buffer.from).toBe(1)
    state = applyVimToBuffer(state.mode, { key: 'j' }, state.buffer)
    expect(state.buffer.from).toBe(4)
    state = applyVimToBuffer(state.mode, { key: 'q' }, state.buffer)
    expect(state.handled).toBe(true)
    expect(state.buffer.text).toBe('ab\ncd')
  })

  it('enters insert at caret and returns to normal on Escape', () => {
    let state = applyVimToBuffer('normal', { key: 'i' }, { text: 'hello', from: 1, to: 1 })
    expect(state.mode).toBe('insert')
    expect(state.buffer.from).toBe(1)
    state = applyVimToBuffer(state.mode, { key: 'Escape' }, state.buffer)
    expect(state.mode).toBe('normal')
  })

  it('opens a line below with o', () => {
    const state = applyVimToBuffer('normal', { key: 'o' }, { text: 'ab\ncd', from: 1, to: 1 })
    expect(state.mode).toBe('insert')
    expect(state.buffer.text).toBe('ab\n\ncd')
    expect(state.buffer.from).toBe(3)
  })
})
