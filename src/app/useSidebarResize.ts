import { useCallback, useRef, type Dispatch, type MouseEvent, type SetStateAction } from 'react'

export function useSidebarResize(sidebarWidth: number, setSidebarWidth: Dispatch<SetStateAction<number>>) {
  const draggingRef = useRef(false)

  return useCallback((e: MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!draggingRef.current) return
      const delta = ev.clientX - startX
      const newW = Math.min(400, Math.max(180, startW + delta))
      setSidebarWidth(newW)
    }
    const onUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [setSidebarWidth, sidebarWidth])
}
