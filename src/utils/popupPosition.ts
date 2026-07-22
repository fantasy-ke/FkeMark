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
