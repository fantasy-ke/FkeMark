import { describe, expect, it } from 'vitest'
import { getBlockActionUpdate } from '../src/components/editor/BlockActionRail'

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
