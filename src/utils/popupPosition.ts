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
  const width = Math.min(Math.max(trigger.width, popupSize.width), availableWidth || Math.max(trigger.width, popupSize.width))


  let left = trigger.left
  if (left + width > rightBound) left = rightBound - width
  if (left < leftBound) left = leftBound

  const spaceBelow = bottomBound - trigger.bottom - gap
  const spaceAbove = trigger.top - topBound - gap
  const desiredHeight = Math.min(maxHeightCap, Math.max(popupSize.height, 1))
  const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow
  const available = openUp ? spaceAbove : spaceBelow
  const maxHeight = Math.max(80, Math.min(maxHeightCap, Math.max(available, 80)))
  const height = Math.min(Math.max(popupSize.height, 1), maxHeight)
  const top = openUp ? trigger.top - gap - height : trigger.bottom + gap

  return {
    left,
    top,
    width,
    maxHeight,
    placement: openUp ? 'top' : 'bottom',
  }
}
