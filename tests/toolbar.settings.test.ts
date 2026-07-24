import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLBAR_ITEMS, moveToolbarItem, resolveToolbarItems } from '../src/utils/toolbar'
import type { ToolbarButtonConfig } from '../src/types'

describe('toolbar settings', () => {
  it('uses explicit draggable dividers and keeps extra actions hidden by default', () => {
    const resolved = resolveToolbarItems()

    expect(resolved.map((item) => item.id)).toEqual(DEFAULT_TOOLBAR_ITEMS.map((item) => item.id))
    expect(resolved[1]).toMatchObject({ id: 'separator-1', placement: 'toolbar', separatorBefore: false })
    expect(resolved[2]).toMatchObject({ id: 'bold', placement: 'toolbar', separatorBefore: false })
    expect(resolved[6]).toMatchObject({ id: 'separator-2', placement: 'toolbar' })
    expect(resolved[12]).toMatchObject({ id: 'separator-3', placement: 'toolbar' })
    expect(resolved.slice(-3)).toEqual([
      { id: 'snippets', placement: 'hidden', separatorBefore: false },
      { id: 'spellCheck', placement: 'hidden', separatorBefore: false },
      { id: 'presentation', placement: 'hidden', separatorBefore: false },
    ])
  })

  it('migrates legacy visibility, groups, and separator flags', () => {
    const saved: ToolbarButtonConfig[] = [
      { id: 'bold', placement: 'hidden', separatorBefore: false },
      { id: 'italic', placement: 'format', separatorBefore: true },
      { id: 'heading', placement: 'format', separatorBefore: true },
    ]

    const resolved = resolveToolbarItems(saved)

    expect(resolved.find((item) => item.id === 'bold')).toMatchObject({ placement: 'hidden' })
    expect(resolved.find((item) => item.id === 'italic')).toMatchObject({ placement: 'format' })
    expect(resolved.find((item) => item.id === 'heading')).toMatchObject({ placement: 'toolbar' })
    expect(resolved.filter((item) => item.id.startsWith('separator-'))).toHaveLength(3)
    expect(resolved.findIndex((item) => item.id === 'separator-1')).toBeLessThan(resolved.findIndex((item) => item.id === 'heading'))
    expect(resolved.findIndex((item) => item.id === 'separator-2')).toBeLessThan(resolved.findIndex((item) => item.id === 'italic'))
  })

  it('preserves explicit saved order and ignores unknown or duplicate items', () => {
    const saved = [
      { id: 'presentation', placement: 'toolbar', separatorBefore: false },
      { id: 'separator-2', placement: 'toolbar', separatorBefore: false },
      { id: 'heading', placement: 'toolbar', separatorBefore: false },
      { id: 'heading', placement: 'hidden', separatorBefore: false },
      { id: 'unknown', placement: 'toolbar', separatorBefore: false },
      { id: 'bold', placement: 'hidden', separatorBefore: false },
    ] as unknown as ToolbarButtonConfig[]

    const resolved = resolveToolbarItems(saved)

    expect(resolved.slice(0, 3).map((item) => item.id)).toEqual(['presentation', 'separator-2', 'heading'])
    expect(resolved.filter((item) => item.id === 'heading')).toHaveLength(1)
    expect(resolved.some((item) => item.id === 'unknown')).toBe(false)
    expect(resolved.find((item) => item.id === 'bold')?.placement).toBe('hidden')
  })

  it('moves items between zones and keeps same-zone insertion stable', () => {
    const shown = moveToolbarItem(DEFAULT_TOOLBAR_ITEMS, 'presentation', 'toolbar', 3)
    expect(shown.filter((item) => item.placement !== 'hidden').slice(0, 4).map((item) => item.id)).toEqual([
      'heading',
      'separator-1',
      'bold',
      'presentation',
    ])

    const hidden = moveToolbarItem(shown, 'separator-1', 'hidden', 0)
    expect(hidden.filter((item) => item.placement === 'hidden').map((item) => item.id)).toEqual([
      'separator-1',
      'snippets',
      'spellCheck',
    ])

    const reordered = moveToolbarItem(DEFAULT_TOOLBAR_ITEMS, 'heading', 'toolbar', 3)
    expect(reordered.slice(0, 3).map((item) => item.id)).toEqual(['separator-1', 'bold', 'heading'])
    expect(DEFAULT_TOOLBAR_ITEMS[0].id).toBe('heading')
  })
})
