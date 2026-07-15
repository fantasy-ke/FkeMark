import { appWindow } from '@tauri-apps/api/window'
import { useEffect, useState, useCallback } from 'react'
import { isTauri, safeTauriCall, safeTauriListener } from '../utils/tauri'

export interface WindowState {
  isMaximized: boolean
}

export function useTauriWindow() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 只有在 Tauri 环境中才执行窗口相关操作
    if (!isTauri()) {
      console.log('非 Tauri 环境，跳过窗口状态监听')
      return () => {}
    }

    // 初始化获取窗口状态
    safeTauriCall(async () => {
      const maximized = await appWindow.isMaximized()
      setIsMaximized(maximized)
    })

    // 监听窗口大小变化
    const cleanup = safeTauriListener(() => 
      appWindow.onResized(() => {
        safeTauriCall(async () => {
          const maximized = await appWindow.isMaximized()
          setIsMaximized(maximized)
        })
      })
    )

    return () => {
      if (cleanup) cleanup()
    }
  }, [])

  const close = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => appWindow.close())
    } else {
      console.warn('非 Tauri 环境，无法关闭窗口')
    }
  }, [])

  const minimize = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => appWindow.minimize())
    } else {
      console.warn('非 Tauri 环境，无法最小化窗口')
    }
  }, [])

  const toggleMaximize = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => appWindow.toggleMaximize())
    } else {
      console.warn('非 Tauri 环境，无法切换最大化')
    }
  }, [])

  const startDragging = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => appWindow.startDragging())
    } else {
      console.warn('非 Tauri 环境，无法开始拖拽窗口')
    }
  }, [])

  return {
    isMaximized,
    close,
    minimize,
    toggleMaximize,
    startDragging,
  }
}
