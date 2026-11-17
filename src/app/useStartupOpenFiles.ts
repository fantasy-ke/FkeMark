import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from '../utils/tauri'

interface UseStartupOpenFilesParams {
  isSecondaryWindow: boolean
  openFile: (filePath: string) => Promise<void>
}

/**
 * 处理应用运行期间以及首次启动时由系统转发的目标文件。
 * 这些文件代表用户的显式选择，优先级高于上次会话恢复。
 */
export function useStartupOpenFiles({ isSecondaryWindow, openFile }: UseStartupOpenFilesParams) {
  // 始终使用最新渲染的打开逻辑，避免捕获过期标签状态
  const openFileRef = useRef(openFile)
  openFileRef.current = openFile
  const startupHandledRef = useRef(false)

  useEffect(() => {
    if (!isTauri() || isSecondaryWindow) return () => {}

    let unlisten: (() => void) | null = null
    let cancelled = false
    listen<string[]>('app://open-files', (event) => {
      for (const path of event.payload) void openFileRef.current(path)
    }).then((dispose) => {
      if (cancelled) dispose()
      else unlisten = dispose
    }).catch((e) => console.warn('Failed to listen for system open files:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [isSecondaryWindow])

  useEffect(() => {
    if (!isTauri() || isSecondaryWindow || startupHandledRef.current) return
    startupHandledRef.current = true
    invoke<string[]>('get_startup_open_files')
      .then(async (paths) => {
        for (const path of paths) await openFileRef.current(path)
      })
      .catch((e) => console.warn('Failed to get startup open files:', e))
  }, [isSecondaryWindow])
}
