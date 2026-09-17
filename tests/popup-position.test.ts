import { describe, expect, it } from 'vitest'
import { placeAnchoredPopup, placeAroundAnchor } from '../src/utils/popupPosition'

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }
}

describe('placeAnchoredPopup', () => {
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 }

  it('places the menu below the trigger and matches trigger width', () => {
    const result = placeAnchoredPopup(rect(100, 80, 200, 36), { width: 180, height: 120 }, bounds)

    expect(result.placement).toBe('bottom')
    expect(result.left).toBe(100)
    expect(result.top).toBe(120)
    expect(result.width).toBe(200)
  })

  it('grows to fit long options without leaving the panel', () => {
    const result = placeAnchoredPopup(rect(500, 80, 160, 36), { width: 360, height: 120 }, bounds)

    expect(result.width).toBe(360)
    expect(result.left + result.width).toBeLessThanOrEqual(792)
  })


  it('opens upward when there is more room above the trigger', () => {
    const result = placeAnchoredPopup(rect(120, 500, 180, 36), { width: 180, height: 220 }, bounds)

    expect(result.placement).toBe('top')
    expect(result.top + 220).toBe(496)
  })

  it('可用宽度为 0 时不让面板溢出右边界', () => {
    const narrowBounds = { left: 0, top: 0, right: 10, bottom: 600 }
    const result = placeAnchoredPopup(rect(100, 80, 200, 36), { width: 180, height: 120 }, narrowBounds)

    expect(result.width).toBe(0)
    expect(result.left + result.width).toBeLessThanOrEqual(8)
  })

  it('向上翻开且空间不足时把面板夹紧在容器内', () => {
    const shortBounds = { left: 0, top: 0, right: 800, bottom: 100 }
    const result = placeAnchoredPopup(rect(100, 50, 200, 36), { width: 180, height: 200 }, shortBounds)

    expect(result.placement).toBe('top')
    expect(result.top).toBeGreaterThanOrEqual(8)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(92)
  })
})

describe('placeAroundAnchor', () => {
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 }

  it('opens to the left when there is room', () => {
    const result = placeAroundAnchor(
      rect(400, 80, 24, 24),
      { width: 168, height: 200 },
      bounds,
      { preferred: ['left', 'right', 'bottom', 'top'] },
    )
    expect(result.placement).toBe('left')
    expect(result.left + 168).toBe(396)
    expect(result.left).toBeGreaterThanOrEqual(8)
  })

  it('flips to the right when the left side is clipped', () => {
    const result = placeAroundAnchor(
      rect(20, 80, 24, 24),
      { width: 168, height: 200 },
      bounds,
      { preferred: ['left', 'right', 'bottom', 'top'] },
    )
    expect(result.placement).toBe('right')
    expect(result.left).toBe(48)
    expect(result.left + 168).toBeLessThanOrEqual(792)
  })

  it('opens upward when the bottom edge would clip the menu', () => {
    const result = placeAroundAnchor(
      rect(120, 520, 24, 24),
      { width: 168, height: 220 },
      bounds,
      { preferred: ['bottom', 'top', 'right', 'left'] },
    )
    expect(result.placement).toBe('top')
    expect(result.top).toBeGreaterThanOrEqual(8)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(516)
  })

  it('keeps the menu inside the viewport on every side', () => {
    const result = placeAroundAnchor(
      rect(780, 580, 16, 16),
      { width: 220, height: 300 },
      bounds,
    )
    expect(result.left).toBeGreaterThanOrEqual(8)
    expect(result.top).toBeGreaterThanOrEqual(8)
    expect(result.left + 220).toBeLessThanOrEqual(792)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(592)
  })

  it('stays inside the editor bounds instead of covering the sidebar', () => {
    const editorBounds = { left: 260, top: 48, right: 800, bottom: 600 }
    const result = placeAroundAnchor(
      rect(268, 120, 22, 22),
      { width: 168, height: 220 },
      editorBounds,
      { preferred: ['left', 'bottom', 'right', 'top'] },
    )
    expect(result.placement).not.toBe('left')
    expect(result.left).toBeGreaterThanOrEqual(268)
  })
})
