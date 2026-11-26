import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from '../utils/tauri'

interface UseStartupOpenFilesParams {
  isSecondaryWindow: boolean
  openFiles: (paths: string[]) => Promise<void>
}

/**
 * 处理应用运行期间以及首次启动时由系统转发的目标文件。
 * 这些文件代表用户的显式选择，优先级高于上次会话恢复。
 */
export function useStartupOpenFiles({ isSecondaryWindow, openFiles }: UseStartupOpenFilesParams) {
  const openFilesRef = useRef(openFiles)
  openFilesRef.current = openFiles

  useEffect(() => {
    if (!isTauri() || isSecondaryWindow) return () => {}

    let unlisten: (() => void) | null = null
    let cancelled = false
    listen<string[]>('app://open-files', (event) => {
      if (!cancelled) void openFilesRef.current(event.payload)
    }).then((dispose) => {
      if (cancelled) dispose()
      else unlisten = dispose
    }).catch((e) => console.warn('Failed to listen for system open files:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [isSecondaryWindow])

}
