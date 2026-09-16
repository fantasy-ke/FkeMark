import { describe, expect, it } from 'vitest'
import { placeAnchoredPopup } from '../src/utils/popupPosition'

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
})
