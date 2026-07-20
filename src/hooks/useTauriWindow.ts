import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
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
      const win = getCurrentWebviewWindow()
      const maximized = await win.isMaximized()
      setIsMaximized(maximized)
    })

    // 监听窗口大小变化
    const cleanup = safeTauriListener(() =>
      getCurrentWebviewWindow().onResized(() => {
        safeTauriCall(async () => {
          const win = getCurrentWebviewWindow()
          const maximized = await win.isMaximized()
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
      // 使用 destroy() 而非 close()：close() 在某些情况下会被拦截或仅发送关闭请求，
      // destroy() 强制销毁窗口并释放资源，确保关闭可靠生效
      safeTauriCall(() => getCurrentWebviewWindow().destroy())
    } else {
      console.warn('非 Tauri 环境，无法关闭窗口')
    }
  }, [])

  const minimize = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => getCurrentWebviewWindow().minimize())
    } else {
      console.warn('非 Tauri 环境，无法最小化窗口')
    }
  }, [])

  /** 隐藏窗口至系统托盘（调用 Rust 端 hide_to_tray 命令） */
  const hideToTray = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => invoke('hide_to_tray'))
    } else {
      console.warn('非 Tauri 环境，无法隐藏到托盘')
    }
  }, [])

  const toggleMaximize = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => getCurrentWebviewWindow().toggleMaximize())
    } else {
      console.warn('非 Tauri 环境，无法切换最大化')
    }
  }, [])

  const startDragging = useCallback(() => {
    if (isTauri()) {
      safeTauriCall(() => getCurrentWebviewWindow().startDragging())
    } else {
      console.warn('非 Tauri 环境，无法开始拖拽窗口')
    }
  }, [])

  return {
    isMaximized,
    close,
    minimize,
    hideToTray,
    toggleMaximize,
    startDragging,
  }
}
