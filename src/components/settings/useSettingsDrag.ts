import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const origin = { x: 0, y: 0 }

export function useSettingsDrag(open: boolean) {
  const [offset, setOffset] = useState(origin)
  const stop = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    if (open) setOffset(origin)
    return () => stop.current?.()
  }, [open])

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || stop.current) return
    event.preventDefault()
    const { clientX: startX, clientY: startY, pointerId } = event
    const cursor = document.body.style.cursor
    let frame: number | null = null
    let x = startX
    let y = startY
    const update = () => {
      const maxX = Math.max(80, window.innerWidth / 2 - 80)
      const maxY = Math.max(80, window.innerHeight / 2 - 80)
      setOffset({
        x: Math.min(maxX, Math.max(-maxX, offset.x + x - startX)),
        y: Math.min(maxY, Math.max(-maxY, offset.y + y - startY)),
      })
    }
    const cleanup = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      stop.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cleanup)
      document.body.style.cursor = cursor
    }
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      x = next.clientX
      y = next.clientY
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; update() })
    }
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      x = next.clientX
      y = next.clientY
      cleanup()
      update()
    }
    const cancel = (next: PointerEvent) => { if (next.pointerId === pointerId) cleanup() }
    stop.current = cleanup
    document.body.style.cursor = 'move'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cleanup)
  }

  return { offset, start }
}
