import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

interface ResizeGesture {
  update: (x: number) => void
  commit: () => void
  cancel: () => void
}

/** 真实布局尺寸最多每帧更新一次；只在正常松手时保存。 */
export function useResizeDrag(enabled: boolean, begin: (x: number) => ResizeGesture | undefined) {
  const cancelRef = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    if (!enabled) cancelRef.current?.()
    return () => cancelRef.current?.()
  }, [enabled])

  return (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0 || cancelRef.current) return
    const gesture = begin(event.clientX)
    if (!gesture) return
    event.preventDefault()
    const target = event.currentTarget
    const pointerId = event.pointerId
    let x = event.clientX
    let frame: number | null = null

    const cleanup = () => {
      cancelRef.current = null
      if (frame !== null) cancelAnimationFrame(frame)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', finish)
      target.removeEventListener('pointercancel', cancelPointer)
      target.removeEventListener('lostpointercapture', cancelPointer)
      window.removeEventListener('blur', cancel)
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
    }
    const cancel = () => {
      cleanup()
      gesture.cancel()
    }
    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancel()
    }
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      cleanup()
      gesture.update(event.clientX)
      gesture.commit()
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      x = event.clientX
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        gesture.update(x)
      })
    }

    target.setPointerCapture?.(pointerId)
    cancelRef.current = cancel
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', finish)
    target.addEventListener('pointercancel', cancelPointer)
    target.addEventListener('lostpointercapture', cancelPointer)
    window.addEventListener('blur', cancel)
  }
}
