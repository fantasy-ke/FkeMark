import { appWindow } from '@tauri-apps/api/window'
import { useEffect, useState, useCallback } from 'react'

export interface WindowState {
  isMaximized: boolean
}

export function useTauriWindow() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 初始化获取窗口状态
    appWindow.isMaximized().then(setIsMaximized).catch(() => {})

    // 监听窗口大小变化
    const unlistenPromise = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {})
    })

    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [])

  const close = useCallback(() => {
    appWindow.close().catch(console.error)
  }, [])

  const minimize = useCallback(() => {
    appWindow.minimize().catch(console.error)
  }, [])

  const toggleMaximize = useCallback(() => {
    appWindow.toggleMaximize().catch(console.error)
  }, [])

  const startDragging = useCallback(() => {
    appWindow.startDragging().catch(console.error)
  }, [])

  return {
    isMaximized,
    close,
    minimize,
    toggleMaximize,
    startDragging,
  }
}
