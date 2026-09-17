import { useLayoutEffect, useRef, type RefObject } from 'react'

export interface PopupPositionOptions {
  padding?: number
  centerX?: boolean
}

export function clampPopupPosition(
  x: number,
  y: number,
  popupWidth: number,
  popupHeight: number,
  boundsWidth: number,
  boundsHeight: number,
  options: PopupPositionOptions = {},
): { left: number; top: number } {
  const padding = options.padding ?? 8
  const desiredLeft = options.centerX ? x - popupWidth / 2 : x
  const maxLeft = Math.max(padding, boundsWidth - popupWidth - padding)
  const maxTop = Math.max(padding, boundsHeight - popupHeight - padding)

  return {
    left: Math.min(Math.max(desiredLeft, padding), maxLeft),
    top: Math.min(Math.max(y, padding), maxTop),
  }
}

export function useClampedPopupPosition<T extends HTMLElement>(
  x: number,
  y: number,
  options: PopupPositionOptions & {
    enabled?: boolean
    containerRef?: RefObject<HTMLElement | null>
    coordinates?: 'viewport' | 'local'
  } = {},
) {
  const popupRef = useRef<T>(null)
  const {
    enabled = true,
    containerRef,
    coordinates = 'viewport',
    centerX = false,
    padding = 8,
  } = options

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!enabled || !popup) return

    const updatePosition = () => {
      const containerRect = containerRef?.current?.getBoundingClientRect()
      const boundsWidth = containerRect?.width ?? window.innerWidth
      const boundsHeight = containerRect?.height ?? window.innerHeight
      const localX = coordinates === 'viewport' && containerRect ? x - containerRect.left : x
      const localY = coordinates === 'viewport' && containerRect ? y - containerRect.top : y
      const rect = popup.getBoundingClientRect()
      const position = clampPopupPosition(
        localX,
        localY,
        rect.width,
        rect.height,
        boundsWidth,
        boundsHeight,
        { centerX, padding },
      )

      popup.style.left = `${position.left}px`
      popup.style.top = `${position.top}px`
    }

    updatePosition()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null
    observer?.observe(popup)
    if (containerRef?.current && containerRef.current !== popup) observer?.observe(containerRef.current)
    window.addEventListener('resize', updatePosition)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [centerX, containerRef, coordinates, enabled, padding, x, y])

  return popupRef
}

export interface AnchoredPopupRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface AnchoredPopupPlacement {
  left: number
  top: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

/** 面板最小可用高度，低于该高度时选项无法完整展示。 */
const MIN_POPUP_HEIGHT = 80

/** 将下拉面板锚定到触发器：宽度适配、越界夹紧，空间不足时向上翻开。 */
export function placeAnchoredPopup(
  trigger: AnchoredPopupRect,
  popupSize: { width: number; height: number },
  bounds: { left: number; top: number; right: number; bottom: number },
  options: { gap?: number; padding?: number; maxHeight?: number } = {},
): AnchoredPopupPlacement {
  const gap = options.gap ?? 4
  const padding = options.padding ?? 8
  const maxHeightCap = options.maxHeight ?? 260

  const leftBound = bounds.left + padding
  const rightBound = Math.max(leftBound, bounds.right - padding)
  const topBound = bounds.top + padding
  const bottomBound = Math.max(topBound, bounds.bottom - padding)

  const availableWidth = Math.max(0, rightBound - leftBound)
  // 宽度始终以可用宽度为上限，可用宽度为 0 时退化为 0，避免面板溢出右边界。
  const desiredWidth = Math.max(trigger.width, popupSize.width)
  const width = Math.min(desiredWidth, availableWidth)


  let left = trigger.left
  if (left + width > rightBound) left = rightBound - width
  if (left < leftBound) left = leftBound

  const spaceBelow = bottomBound - trigger.bottom - gap
  const spaceAbove = trigger.top - topBound - gap
  const desiredHeight = Math.min(maxHeightCap, Math.max(popupSize.height, 1))
  const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow
  const available = openUp ? spaceAbove : spaceBelow
  const maxHeight = Math.max(MIN_POPUP_HEIGHT, Math.min(maxHeightCap, available))
  const height = Math.min(Math.max(popupSize.height, 1), maxHeight)
  let top = openUp ? trigger.top - gap - height : trigger.bottom + gap
  // 触发器贴近容器边缘时二次夹紧，避免面板被裁剪导致选项不可见。
  top = Math.min(Math.max(top, topBound), Math.max(topBound, bottomBound - height))

  return {
    left,
    top,
    width,
    maxHeight,
    placement: openUp ? 'top' : 'bottom',
  }
}

export type AroundSide = 'left' | 'right' | 'top' | 'bottom'

export interface AroundPopupPlacement {
  left: number
  top: number
  maxHeight: number
  placement: AroundSide
}

const DEFAULT_AROUND_SIDES: AroundSide[] = ['left', 'right', 'bottom', 'top']

function viewportBounds() {
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
}

/** 按上左下右可用空间把面板放到触发器外侧，避免被视口裁切。 */
export function placeAroundAnchor(
  trigger: AnchoredPopupRect,
  popupSize: { width: number; height: number },
  bounds: { left: number; top: number; right: number; bottom: number },
  options: { gap?: number; padding?: number; preferred?: AroundSide[] } = {},
): AroundPopupPlacement {
  const gap = options.gap ?? 4
  const padding = options.padding ?? 8
  const preferred = options.preferred ?? DEFAULT_AROUND_SIDES

  const leftBound = bounds.left + padding
  const rightBound = Math.max(leftBound, bounds.right - padding)
  const topBound = bounds.top + padding
  const bottomBound = Math.max(topBound, bounds.bottom - padding)

  const space: Record<AroundSide, number> = {
    left: trigger.left - gap - leftBound,
    right: rightBound - trigger.right - gap,
    top: trigger.top - gap - topBound,
    bottom: bottomBound - trigger.bottom - gap,
  }

  const needW = Math.max(popupSize.width, 1)
  const needH = Math.max(popupSize.height, 1)
  const fullyFits = (side: AroundSide) => (
    side === 'left' || side === 'right' ? space[side] >= needW : space[side] >= needH
  )

  let placement = preferred.find(fullyFits)
  if (!placement) {
    placement = preferred.reduce((best, side) => space[side] > space[best] ? side : best)
  }

  const maxW = rightBound - leftBound
  const maxH = bottomBound - topBound
  const width = Math.min(needW, Math.max(0, maxW))
  let left = leftBound
  let top = topBound
  let maxHeight = Math.min(needH, maxH)

  if (placement === 'left' || placement === 'right') {
    const avail = Math.max(0, space[placement])
    const w = Math.min(width, avail)
    left = placement === 'left' ? trigger.left - gap - w : trigger.right + gap
    maxHeight = Math.min(needH, maxH)
    top = trigger.top
    if (top + maxHeight > bottomBound) top = bottomBound - maxHeight
    if (top < topBound) top = topBound
  } else {
    const avail = Math.max(0, space[placement])
    maxHeight = Math.max(Math.min(needH, avail), Math.min(MIN_POPUP_HEIGHT, maxH))
    maxHeight = Math.min(maxHeight, avail > 0 ? avail : maxH)
    left = trigger.left
    if (left + width > rightBound) left = rightBound - width
    if (left < leftBound) left = leftBound
    top = placement === 'top' ? trigger.top - gap - maxHeight : trigger.bottom + gap
  }

  left = Math.min(Math.max(left, leftBound), Math.max(leftBound, rightBound - width))
  top = Math.min(Math.max(top, topBound), Math.max(topBound, bottomBound - Math.min(maxHeight, maxH)))

  return { left, top, maxHeight, placement }
}

export function useAroundPopupPosition<T extends HTMLElement>(
  x: number,
  y: number,
  preferred: AroundSide[] = DEFAULT_AROUND_SIDES,
) {
  const popupRef = useRef<T>(null)
  const preferredKey = preferred.join(',')

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!popup) return
    const sides = preferredKey.split(',') as AroundSide[]

    const updatePosition = () => {
      const rect = popup.getBoundingClientRect()
      const next = placeAroundAnchor(
        { left: x, top: y, right: x, bottom: y, width: 0, height: 0 },
        { width: rect.width, height: rect.height },
        viewportBounds(),
        { preferred: sides },
      )
      popup.style.left = `${next.left}px`
      popup.style.top = `${next.top}px`
      popup.style.maxHeight = `${next.maxHeight}px`
    }

    updatePosition()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null
    observer?.observe(popup)
    window.addEventListener('resize', updatePosition)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [preferredKey, x, y])

  return popupRef
}

export function positionAroundTrigger(
  trigger: HTMLElement,
  popup: HTMLElement,
  preferred: AroundSide[] = DEFAULT_AROUND_SIDES,
) {
  const next = placeAroundAnchor(
    trigger.getBoundingClientRect(),
    { width: popup.offsetWidth, height: popup.scrollHeight },
    viewportBounds(),
    { preferred },
  )
  popup.style.position = 'fixed'
  popup.style.left = `${Math.round(next.left)}px`
  popup.style.top = `${Math.round(next.top)}px`
  popup.style.maxHeight = `${Math.round(next.maxHeight)}px`
  popup.style.right = 'auto'
  popup.style.marginTop = '0'
}
