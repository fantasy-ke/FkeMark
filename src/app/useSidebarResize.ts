import type { Dispatch, SetStateAction } from 'react'
import { useResizeDrag } from '../hooks/useResizeDrag'
import { savePersisted } from './appDefaults'

export function useSidebarResize(enabled: boolean, sidebarWidth: number, setSidebarWidth: Dispatch<SetStateAction<number>>) {
  return useResizeDrag(enabled, (startX) => {
    let width = sidebarWidth
    return {
      update(x) {
        width = Math.min(480, Math.max(200, sidebarWidth + x - startX))
        setSidebarWidth(width)
      },
      commit() {
        if (width !== sidebarWidth) savePersisted('fkemark:sidebarWidth', width)
      },
      cancel() { setSidebarWidth(sidebarWidth) },
    }
  })
}
