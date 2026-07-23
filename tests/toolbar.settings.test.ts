import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLBAR_BUTTONS, resolveToolbarButtons } from '../src/utils/toolbar'
import type { ToolbarButtonConfig } from '../src/types'

describe('toolbar settings', () => {
  it('uses the default toolbar order and separators', () => {
    const resolved = resolveToolbarButtons()

    expect(resolved.map((item) => item.id)).toEqual(DEFAULT_TOOLBAR_BUTTONS.map((item) => item.id))
    expect(resolved[1]).toMatchObject({ id: 'bold', placement: 'toolbar', separatorBefore: true })
    expect(resolved[5]).toMatchObject({ id: 'quote', placement: 'toolbar', separatorBefore: true })
    expect(resolved[10]).toMatchObject({ id: 'table', placement: 'toolbar', separatorBefore: true })
  })

  it('merges visibility, grouping, and separators from saved config', () => {
    const saved: ToolbarButtonConfig[] = [
      { id: 'bold', placement: 'hidden', separatorBefore: false },
      { id: 'italic', placement: 'format', separatorBefore: true },
      { id: 'heading', placement: 'format', separatorBefore: true },
    ]

    const resolved = resolveToolbarButtons(saved)

    expect(resolved.find((item) => item.id === 'bold')).toMatchObject({ placement: 'hidden', separatorBefore: false })
    expect(resolved.find((item) => item.id === 'italic')).toMatchObject({ placement: 'format', separatorBefore: true })
    expect(resolved.find((item) => item.id === 'heading')).toMatchObject({ placement: 'toolbar', separatorBefore: true })
  })

  it('ignores unknown saved toolbar buttons', () => {
    const saved = [{ id: 'unknown', placement: 'format', separatorBefore: true }] as unknown as ToolbarButtonConfig[]

    const resolved = resolveToolbarButtons(saved)

    expect(resolved.map((item) => item.id)).toEqual(DEFAULT_TOOLBAR_BUTTONS.map((item) => item.id))
  })
})
