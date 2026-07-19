/**
 * useUpdater —— 应用内更新下载/安装状态机
 *
 * 封装：下载进度监听、断点续传（暂停/继续）、取消、完整性校验、安装、回滚。
 * 阶段：idle → downloading ⇄ paused → ready → installing
 *                    ↘ error（可重试）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  downloadUpdate,
  cancelDownload,
  installUpdate,
  rollbackUpdate,
  getDownloadState,
  listenDownloadProgress,
  type UpdateInfo,
  type DownloadProgress,
} from '../utils/updater'

export type UpdatePhase =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'ready'
  | 'installing'
  | 'error'

/** useUpdater 返回类型（供组件 props 复用） */
export type Updater = ReturnType<typeof useUpdater>

export interface UseUpdaterOptions {
  /** 安装前的钩子（用于保存所有未保存文档，保证数据一致性）；返回 false 可中止安装 */
  onBeforeInstall?: () => Promise<boolean | void>
}

const CANCELLED = '__CANCELLED__'

export function useUpdater(options: UseUpdaterOptions = {}) {
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installerPath, setInstallerPath] = useState<string | null>(null)
  const [resumable, setResumable] = useState(false)

  const unlistenRef = useRef<null | (() => void)>(null)
  const onBeforeInstall = options.onBeforeInstall

  // 挂载时订阅下载进度事件
  useEffect(() => {
    let mounted = true
    listenDownloadProgress((p) => {
      if (mounted) setProgress(p)
    }).then((un) => {
      unlistenRef.current = un
    })
    return () => {
      mounted = false
      unlistenRef.current?.()
    }
  }, [])

  /** 查询是否有可续传的历史下载 */
  const checkResumable = useCallback(async (info: UpdateInfo) => {
    try {
      const st = await getDownloadState(info)
      if (st && st.downloaded > 0 && st.downloaded >= st.expectedSize && st.expectedSize > 0) {
        // 已完整下载
        setResumable(false)
        setProgress({
          version: info.version,
          downloaded: st.downloaded,
          total: st.expectedSize,
          percent: 100,
          speed: 0,
        })
      } else if (st && st.downloaded > 0) {
        setResumable(true)
        setProgress({
          version: info.version,
          downloaded: st.downloaded,
          total: st.expectedSize,
          percent: st.expectedSize > 0 ? (st.downloaded / st.expectedSize) * 100 : 0,
          speed: 0,
        })
      } else {
        setResumable(false)
      }
    } catch {
      setResumable(false)
    }
  }, [])

  /** 开始 / 继续下载（后端自动从 .partial 续传） */
  const start = useCallback(async (info: UpdateInfo) => {
    setError(null)
    setPhase('downloading')
    try {
      const path = await downloadUpdate(info)
      setInstallerPath(path)
      setResumable(false)
      setPhase('ready')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes(CANCELLED)) {
        // 用户暂停：保留进度可续传
        setResumable(true)
        setPhase('paused')
      } else {
        setError(msg)
        setPhase('error')
      }
    }
  }, [])

  /** 暂停下载（保留已下载部分） */
  const pause = useCallback(async () => {
    try {
      await cancelDownload()
    } catch {
      /* ignore */
    }
    // start() 的 catch 会把 phase 置为 paused
  }, [])

  /** 安装：先保存文档，再启动安装器（应用随后退出） */
  const install = useCallback(async () => {
    if (!installerPath) return
    if (onBeforeInstall) {
      const ok = await onBeforeInstall()
      if (ok === false) return
    }
    setPhase('installing')
    try {
      // 需要版本号：从 progress 无法取，改由调用方保证；此处用占位由 installUpdate 内部记录
      await installUpdate(installerPath, installerVersionRef.current || '')
      // 正常情况下应用会退出，不会执行到这里
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase('error')
    }
  }, [installerPath, onBeforeInstall])

  // 记录当前下载的版本号（install 时需要）
  const installerVersionRef = useRef<string>('')
  const startWithInfo = useCallback(
    (info: UpdateInfo) => {
      installerVersionRef.current = info.version
      return start(info)
    },
    [start]
  )

  /** 回滚到上一版本 */
  const rollback = useCallback(async () => {
    setError(null)
    try {
      await rollbackUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [])

  /** 重置状态回到初始 */
  const reset = useCallback(() => {
    setPhase('idle')
    setProgress(null)
    setError(null)
    setInstallerPath(null)
    setResumable(false)
  }, [])

  return {
    phase,
    progress,
    error,
    installerPath,
    resumable,
    start: startWithInfo,
    pause,
    install,
    rollback,
    reset,
    checkResumable,
  }
}
