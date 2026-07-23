import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppLayout } from './app/AppLayout'
import { DEFAULT_CONTENT_LANGS, DEFAULT_SETTINGS, loadPersisted, savePersisted } from './app/appDefaults'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useCurrentEditorContent } from './app/useCurrentEditorContent'
import { useAppTabs } from './app/useAppTabs'
import { useAppUpdates } from './app/useAppUpdates'
import { useSidebarResize } from './app/useSidebarResize'
import type { TocItemData } from './components/Sidebar'
import { isTauri } from './utils/tauri'
import { translate } from './i18n'
import { useTauriWindow } from './hooks/useTauriWindow'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { FileEntry, AppSettings, FileTreeNode, EditorMode, FolderHistoryEntry } from './types'
import { exportFile, importFile, type ExportFormat } from './utils/importExport'
import { resolveKeymap, matchKeymap } from './utils/keymap'
import { getAppliedTheme, isDarkTheme, normalizeTheme } from './utils/themes'
import {
  formatLastSavedTime,
  getDocumentStatistics,
  getSyncStatusKey,
  type DocumentSyncStatus,
} from './utils/documentStats'
import { showCloseActionDialog, showAlert, showPrompt, showConfirm } from './components/ConfirmDialog'
import { notifyError, notifySuccess } from './utils/toast'
import { translate as tr } from './i18n'
import { isOnboarded } from './components/Onboarding'
import type { PaletteCommand, SearchMatchResult } from './components/CommandPalette'

export function App() {
  // ── 文件状态（活跃标签的映射）──
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isModified, setIsModified] = useState(false)
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([])
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  // 文件夹打开历史（持久化到 localStorage）
  const [folderHistory, setFolderHistory] = useState<FolderHistoryEntry[]>(() => loadPersisted('fkemark:folderHistory', []))

  // ── 侧边栏状态（持久化）──
  const [sidebarOpen, _setSidebarOpen] = useState(() => loadPersisted('fkemark:sidebarOpen', true))
  const [sidebarWidth, setSidebarWidth] = useState(() => loadPersisted('fkemark:sidebarWidth', 240))
  const [_sidebarCollapsed, _setSidebarCollapsed] = useState(() => loadPersisted('fkemark:sidebarCollapsed', false))

  // ── 设置状态 ──
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  // ── UI 状态 ──
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeSettingsSection, setActiveSettingsSection] = useState<string>('appearance')
  const [editorMode, setEditorMode] = useState<EditorMode>('live')
  const [saveStatus, setSaveStatus] = useState<DocumentSyncStatus>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // ── 查找替换状态 ──
  const [findReplaceVisible, setFindReplaceVisible] = useState(false)
  const [findReplaceMode, setFindReplaceMode] = useState<'find' | 'replace'>('find')

  // ── 命令面板状态 ──
  const [paletteVisible, setPaletteVisible] = useState(false)
  // 当前打开的文件夹路径（用于全文搜索）
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>(null)

  // ── 编辑器命令式 ref 与待处理内容同步 ──
  const { editorHandleRef, getCurrentContent, handleEditorModeChange } = useCurrentEditorContent({
    editorMode, fileContent, setFileContent, setEditorMode,
  })

  const isSecondaryWindow = useMemo(() => {
    if (!isTauri()) return false
    try { return new URL(window.location.href).searchParams.get('win') === 'secondary' } catch { return false }
  }, [])

  const {
    tabs, activeTabId, tabContentCache, createTab, switchToTab, closeTab, closeOtherTabs,
    updateActiveTabModified, updateActiveTabPath, markActiveDocumentSaved,
  } = useAppTabs({
    currentFile, setCurrentFile, setFileContent, isModified, setIsModified,
    editorMode, setEditorMode, lastSavedAt, setLastSavedAt, setSaveStatus,
    currentFolderPath, scanFolder, language: settings.language, getCurrentContent,
  })

  const {
    appVersion, updateInfo, checkingUpdate, showUpdateToast, setShowUpdateToast,
    updateNotification, setUpdateNotification, rollbackAvailable, finalizeNotice,
    setFinalizeNotice, updater, doCheckUpdate,
  } = useAppUpdates({
    activeTabId, tabContentCache, getCurrentContent, isModified, editorMode, currentFile,
    lastSavedAt, settings, isSecondaryWindow, setIsModified, setSaveStatus, setLastSavedAt,
  })

  // ── 回收站面板状态 ──
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)
  const [imageManagerOpen, setImageManagerOpen] = useState(false)

  // ── 首启引导状态 ──
  // 新窗口（win=secondary）不显示首启引导，避免引导界面在新窗口闪现
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      if (new URL(window.location.href).searchParams.get('win') === 'secondary') return false
    } catch { /* ignore */ }
    return !isOnboarded()
  })

  // ── 编辑器 ref（用于大纲跳转）──
  const editorScrollRef = useRef<HTMLDivElement>(null)
  // 系统“打开方式”回调始终使用最新渲染状态，避免捕获过期标签。
  const handleOpenFileRef = useRef<(filePath: string) => Promise<void>>(async () => {})
  const startupOpenHandledRef = useRef(false)

  // ── 窗口控制（最大化状态 + 关闭/托盘）──
  const { isMaximized: windowMaximized, close: closeWindow, hideToTray } = useTauriWindow()

  // ── 关闭窗口处理：根据设置决定行为 ──
  const handleCloseWindow = useCallback(async () => {
    const action = settings.closeAction
    if (settings.skipClosePrompt) {
      // 安全回退：closeAction='ask' 时默认最小化到托盘
      const act = action === 'ask' ? 'minimize' : action
      if (act === 'minimize') hideToTray()
      else closeWindow()
      return
    }
    if (action === 'ask') {
      const result = await showCloseActionDialog(
        translate(settings.language, 'window.closePrompt.message'),
        translate(settings.language, 'window.closePrompt.title'),
        {
          dontAskAgainLabel: translate(settings.language, 'window.closePrompt.dontAskAgain'),
        }
      )
      // 用户取消了关闭操作
      if (result.action === 'cancel') return
      // 用户选择了具体的关闭行为（隐藏至托盘 / 直接关闭）。
      // 若勾选了"不再提示"，则将其持久化为默认的关闭行为，后续点关闭直接执行该行为。
      if (result.dontAskAgain) {
        handleSettingsChange({ ...settings, closeAction: result.action, skipClosePrompt: true })
      }
      // 无论是否勾选"不再提示"，本次选择都应立即执行（修复首次选择"隐藏至托盘"无效的问题）
      if (result.action === 'minimize') hideToTray()
      else closeWindow()
      return
    }
    if (action === 'minimize') hideToTray()
    else closeWindow()
  }, [settings.closeAction, settings.skipClosePrompt, settings.language, settings])

  // ── 暗色判定（支持 system 主题实时跟随系统）──
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const isDark = isDarkTheme(settings.theme, systemDark)
  const appliedTheme = getAppliedTheme(settings.theme, systemDark)

  // ── 持久化侧边栏状态 ──
  useEffect(() => { savePersisted('fkemark:sidebarOpen', sidebarOpen) }, [sidebarOpen])
  useEffect(() => { savePersisted('fkemark:sidebarWidth', sidebarWidth) }, [sidebarWidth])
  useEffect(() => { savePersisted('fkemark:sidebarCollapsed', _sidebarCollapsed) }, [_sidebarCollapsed])
  useEffect(() => { savePersisted('fkemark:folderHistory', folderHistory) }, [folderHistory])

  // ── 圆角变量动态注入到 documentElement ──
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--radius-base', `${settings.cornerRadius}px`)
    root.style.setProperty('--radius-btn', `${settings.buttonRadius}px`)
    root.style.setProperty('--radius-card', `${Math.max(settings.cornerRadius, settings.buttonRadius) + 2}px`)
  }, [settings.cornerRadius, settings.buttonRadius])

  // ── 字体设置全局应用（影响所有编辑器实例与 Markdown 渲染）──
  useEffect(() => {
    const root = document.documentElement
    // 编辑器字体（替代固定 --font-body，作用于 .editor-inner / .ProseMirror）
    root.style.setProperty('--font-editor', settings.fontFamily || 'system-ui')
    root.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
    // Markdown 视图字体（阅读模式）；'inherit' / 0 表示跟随编辑器
    root.style.setProperty('--md-font-family',
      settings.markdownFontFamily && settings.markdownFontFamily !== 'inherit'
        ? settings.markdownFontFamily
        : (settings.fontFamily || 'system-ui'))
    root.style.setProperty('--md-font-size',
      settings.markdownFontSize && settings.markdownFontSize > 0
        ? `${settings.markdownFontSize}px`
        : `${settings.fontSize}px`)
  }, [settings.fontFamily, settings.fontSize, settings.markdownFontFamily, settings.markdownFontSize])

  // ── 窗口最大化时移除圆角（填满屏幕）──
  useEffect(() => {
    if (windowMaximized) document.body.classList.add('maximized')
    else document.body.classList.remove('maximized')
  }, [windowMaximized])

  // ── 应用阅读/源码/分栏模式 body class（不隐藏头部）──
  useEffect(() => {
    document.body.classList.remove('read-mode', 'source-mode', 'split-mode')
    if (editorMode === 'read') document.body.classList.add('read-mode')
    if (editorMode === 'source') document.body.classList.add('source-mode')
    if (editorMode === 'split') document.body.classList.add('split-mode')
  }, [editorMode])

  // ── 主题应用 ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appliedTheme)
    document.documentElement.setAttribute('data-theme-mode', isDark ? 'dark' : 'light')
  }, [appliedTheme, isDark])

  // ── 界面语言应用到 <html lang> ──
  useEffect(() => {
    document.documentElement.setAttribute('lang', settings.language)
  }, [settings.language])

  // ── 加载设置 ──
  // 所有窗口在设置加载完成、React 首屏渲染后调用 window.show()，
  // 避免窗口先显示透明/splash 启动画面再切换到实际界面（闪烁）
  useEffect(() => {
    loadSettings().finally(() => {
      if (!isTauri()) return
      // 双 RAF：确保 React 完成首屏渲染并绘制后再显示窗口
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          getCurrentWebviewWindow()
            .show()
            .catch((e) => console.error('Failed to show window:', e))
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 监听应用运行期间由系统转发的目标文件 ──
  useEffect(() => {
    if (!isTauri() || isSecondaryWindow) return () => {}

    let unlisten: (() => void) | null = null
    let cancelled = false
    listen<string[]>('app://open-files', (event) => {
      for (const path of event.payload) void handleOpenFileRef.current(path)
    }).then((dispose) => {
      if (cancelled) dispose()
      else unlisten = dispose
    }).catch((e) => console.warn('Failed to listen for system open files:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [isSecondaryWindow])

  // 首次启动不会触发单实例事件，需要主动读取一次进程启动参数。
  useEffect(() => {
    if (!isTauri() || isSecondaryWindow || startupOpenHandledRef.current) return
    startupOpenHandledRef.current = true
    invoke<string[]>('get_startup_open_files')
      .then(async (paths) => {
        for (const path of paths) await handleOpenFileRef.current(path)
      })
      .catch((e) => console.warn('Failed to get startup open files:', e))
  }, [isSecondaryWindow])


  // ── 监听文件拖放（Tauri v2: onDragDropEvent，区分图片与文档）──
  useEffect(() => {
    if (!isTauri()) return () => {}
    let unlisten: (() => void) | null = null
    let cancelled = false
    getCurrentWebview().onDragDropEvent(async (event) => {
      // Tauri v2 的 DragDropEvent payload 有 type 字段：'enter' | 'over' | 'drop' | 'leave'
      if (event.payload.type !== 'drop') return
      const paths = event.payload.paths
      if (!paths || paths.length === 0) return
      for (const p of paths) {
        if (isImageFile(p)) {
          await handleImageDrop(p)
        } else {
          await handleOpenFile(p)
        }
      }
    }).then((u) => { if (cancelled) u(); else unlisten = u })
      .catch((e) => console.warn('Failed to setup drag-drop listener:', e))
    return () => { cancelled = true; unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile])

  // ── 自动保存 ──
  useEffect(() => {
    if (!settings.autoSave || !currentFile || !isModified) return
    const timer = setTimeout(() => handleSaveFile(), settings.autoSaveInterval * 1000)
    return () => clearTimeout(timer)
  }, [isModified, settings.autoSave, settings.autoSaveInterval, currentFile, fileContent])

  // ── 专注模式 body class ──
  useEffect(() => {
    document.body.classList.toggle('focus-mode', settings.focusMode)
  }, [settings.focusMode])

  // ── 键盘快捷键（可自定义：查 keymap 反查命令）──
  useEffect(() => {
    const keymap = resolveKeymap(settings.keymap)
    const handler = (e: KeyboardEvent) => {
      const cmd = matchKeymap(e, keymap)
      if (cmd) {
        switch (cmd) {
          case 'save': e.preventDefault(); handleSaveFile(); return
          case 'cycleMode': e.preventDefault(); cycleEditorMode(); return
          case 'focusMode': e.preventDefault(); handleSettingsChange({ ...settings, focusMode: !settings.focusMode }); return
          case 'newFile': e.preventDefault(); handleNewFile(); return
          case 'openFile': e.preventDefault(); handleOpenFileDialog(); return
          case 'openFolder': e.preventDefault(); handleOpenFolder(); return
          case 'find': e.preventDefault(); setFindReplaceMode('find'); setFindReplaceVisible(true); return
          case 'replace': e.preventDefault(); setFindReplaceMode('replace'); setFindReplaceVisible(true); return
          case 'palette': e.preventDefault(); setPaletteVisible(true); return
          case 'closeTab': e.preventDefault(); if (activeTabId) closeTab(activeTabId); return
          case 'recycleBin': e.preventDefault(); setRecycleBinOpen(true); return
        }
      }
      // ESC：阅读模式 → 实时编辑模式（结构性，不可自定义）
      if (e.key === 'Escape' && editorMode === 'read' && !settingsOpen && !findReplaceVisible && !paletteVisible && !recycleBinOpen && !imageManagerOpen) {
        e.preventDefault()
        handleEditorModeChange('live')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentFile, fileContent, settings, editorMode, settingsOpen, findReplaceVisible, paletteVisible, activeTabId, recycleBinOpen, imageManagerOpen])

  const onResizeStart = useSidebarResize(sidebarWidth, setSidebarWidth)


  // ─── 操作函数 ───

  // ── 标签页管理 ──
  async function loadSettings() {
    if (!isTauri()) {
      // 非 Tauri 环境：从 localStorage 恢复主题和 editorMode
      setSettings((prev) => ({ ...prev, theme: normalizeTheme(localStorage.getItem('theme') || prev.theme) }))
      setEditorMode(loadPersisted<EditorMode>('fkemark:editorMode', 'live'))
      return
    }
    try {
      const s = await invoke<Partial<AppSettings>>('get_settings')
      const merged = { ...DEFAULT_SETTINGS, ...s, theme: normalizeTheme(s.theme) }
      setSettings(merged)
      try { localStorage.setItem('theme', merged.theme) } catch { /* ignore */ }
      // 从持久化设置同步 editorMode（跨更新保留）
      setEditorMode(merged.editorMode as EditorMode)
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  function handleSettingsChange(newSettings: AppSettings) {
    setSettings(newSettings)
    try { localStorage.setItem('theme', newSettings.theme) } catch { /* ignore */ }
    // editorMode 变更同步到独立 state
    if (newSettings.editorMode !== editorMode) handleEditorModeChange(newSettings.editorMode)
    if (!isTauri()) {
      // 非 Tauri 环境用 localStorage 兜底
      savePersisted('fkemark:editorMode', newSettings.editorMode)
      return
    }
    invoke('save_settings', { settings: newSettings })
      .catch((e) => console.error('Failed to save settings:', e))
  }

  function handleToggleTheme() {
    // 在 明亮 → 黑暗 → 跟随系统 之间循环切换，避免忽略设置里的 system 选项
    const next =
      settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light'
    handleSettingsChange({ ...settings, theme: next })
  }

  // ── 视图模式循环：实时编辑 → 源码 → 阅读 → 实时编辑 ──
  function cycleEditorMode() {
    handleEditorModeChange(editorMode === 'live' ? 'source' : editorMode === 'source' ? 'read' : 'live')
  }

  function handleNewFile() {
    // 多标签：直接创建新标签
    createTab(translate(settings.language, 'document.untitledFileName'), null, translate(settings.language, 'document.defaultContent'))
  }

  // ── 新建窗口（同一应用，开一个新的 Tauri 主窗口） ──
  async function handleNewWindow() {
    if (!isTauri()) return
    try {
      await invoke('new_window')
    } catch (e) {
      console.error('新建窗口失败:', e)
    }
  }

  // ── 打开文件：弹文件选择对话框 ──
  async function handleOpenFileDialog() {
    if (!isTauri()) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown,.txt'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (file) {
          const text = await file.text()
          applyOpenedFile(file.name, text, file.lastModified)
        }
      }
      input.click()
      return
    }

    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      })
      if (typeof selected === 'string') await handleOpenFile(selected)
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }

  // ── 打开文件夹：选择文件夹并扫描 .md 文件树 ──
  async function handleOpenFolder() {
    if (!isTauri()) return

    try {
      // 选择文件夹
      const selected = await openDialog({ directory: true, multiple: false, title: translate(settings.language, 'file.selectFolder') })
      if (typeof selected === 'string') {
        await scanFolder(selected)
      }
    } catch (e) {
      console.error('Failed to open folder:', e)
    }
  }

  // ── 递归扫描文件夹中的 .md 文件，并记录到历史 ──
  async function scanFolder(dirPath: string) {
    if (!isTauri()) return
    try {
      const tree = await invoke<FileTreeNode[]>('scan_directory', { path: dirPath })
      setFileTree(tree)
      setCurrentFolderPath(dirPath)
      // 记录到文件夹历史
      const name = dirPath.split(/[\\/]/).pop() || dirPath
      setFolderHistory((prev) => {
        const filtered = prev.filter((f) => f.path !== dirPath)
        return [{ path: dirPath, name, openedAt: Date.now() }, ...filtered].slice(0, 10)
      })
    } catch (e) {
      console.error('Failed to scan directory:', e)
      showAlert(translate(settings.language, 'file.scanFolderFailed', { detail: String(e) }), translate(settings.language, 'common.error'))
    }
  }

  // ── 从历史重新打开文件夹 ──
  async function reopenFolder(dirPath: string) {
    await scanFolder(dirPath)
  }

  // ── 移除某条文件夹历史 ──
  function removeFolderHistory(path: string) {
    setFolderHistory((prev) => prev.filter((f) => f.path !== path))
  }

  // ── 判断是否图片文件 ──
  function isImageFile(path: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(path)
  }

  // ── 拖拽图片落盘：占位 + 进度 + 统一 Toast 反馈 ──
  async function handleImageDrop(srcPath: string) {
    if (!isTauri()) return
    if (!currentFile && settings.imageUploadMode === 'local') {
      notifyError(translate(settings.language, 'file.saveBeforeImageDrop'))
      return
    }
    // 由编辑器插入占位节点并驱动上传进度（成功/失败由编辑器内部 Toast 反馈）
    editorHandleRef.current?.insertImageUploadFromPath(srcPath)
  }

  async function handleOpenFile(filePath: string) {
    if (!isTauri()) {
      try {
        const res = await fetch(`/api/read-file?path=${encodeURIComponent(filePath)}`)
        if (res.ok) {
          const content = await res.text()
          applyOpenedFile(filePath, content)
        }
      } catch { /* ignore */ }
      return
    }
    try {
      const [content, metadata] = await Promise.all([
        invoke<string>('read_file_command', { path: filePath }),
        invoke<{ modified: string }>('get_file_info', { path: filePath }).catch(() => null),
      ])
      const modifiedAt = metadata ? new Date(metadata.modified).getTime() : null
      applyOpenedFile(filePath, content, Number.isFinite(modifiedAt) ? modifiedAt : null)
    } catch (e) {
      console.error('Failed to open file:', e)
      notifyError(translate(settings.language, 'file.openFailed', { detail: String(e) }))
    }
  }

  function applyOpenedFile(path: string, content: string, savedAt: number | null = null) {
    // 检查是否已有该文件的标签
    const existingTab = tabs.find((t) => t.path === path)
    if (existingTab) {
      // 已存在标签，切换过去
      switchToTab(existingTab.id)
      return
    }
    // 创建新标签
    const name = path.split(/[\\/]/).pop() || path
    createTab(name, path, content, undefined, savedAt)
    const entry: FileEntry = { name, path, isFile: true, isDir: false, size: content.length, modified: savedAt ?? Date.now() }
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== path)
      return [entry, ...filtered].slice(0, 10)
    })
  }

  handleOpenFileRef.current = handleOpenFile

  async function handleSaveFile() {
    const content = getCurrentContent()
    if (!isTauri()) {
      if (!currentFile) {
        const name = await showPrompt(translate(settings.language, 'tab.enterFileName'), translate(settings.language, 'document.untitledFileName'))
        if (!name) return
        const blob = new Blob([content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
        setCurrentFile(name)
        updateActiveTabPath(name, name)
        markActiveDocumentSaved(Date.now(), name)
        return
      }
      markActiveDocumentSaved()
      return
    }

    if (!currentFile) {
      try {
        const savePath = await openDialog({ directory: true, multiple: false, title: translate(settings.language, 'tab.selectSaveLocation') })
        if (typeof savePath === 'string') {
          const fileName = await showPrompt(translate(settings.language, 'tab.enterFileName'), translate(settings.language, 'document.untitledFileName'))
          if (!fileName) return
          const fullPath = `${savePath}/${fileName}`
          await invoke('write_file_command', { path: fullPath, content })
          updateActiveTabPath(fullPath, fileName)
          setCurrentFile(fullPath)
          markActiveDocumentSaved(Date.now(), fullPath)
          // 刷新文件树
          if (currentFolderPath) {
            scanFolder(currentFolderPath)
          }
        }
      } catch (e) {
        setSaveStatus('error')
        notifyError(translate(settings.language, 'file.saveFailed', { detail: String(e) }))
      }
      return
    }

    try {
      setSaveStatus('saving')
      await invoke('write_file_command', { path: currentFile, content })
      markActiveDocumentSaved()
    } catch (e) {
      setSaveStatus('error')
      notifyError(translate(settings.language, 'file.saveFailed', { detail: String(e) }))
    }
  }

  // ── 删除文件到回收站 ──
  async function handleDeleteFile(filePath: string) {
    if (!isTauri()) return
    if (!(await showConfirm(translate(settings.language, 'trash.confirmDelete')))) return
    try {
      await invoke('move_to_trash', { filePath })
      // 如果删除的是当前打开的文件，关闭对应标签
      const tab = tabs.find((t) => t.path === filePath)
      if (tab) {
        closeTab(tab.id)
      }
      // 刷新文件树
      if (currentFolderPath) {
        scanFolder(currentFolderPath)
      }
      // 从最近文件中移除
      setRecentFiles((prev) => prev.filter((f) => f.path !== filePath))
    } catch (e) {
      notifyError(`${translate(settings.language, 'trash.deleteFailed')}: ${e}`)
    }
  }

  function handleDocumentDirty() {
    setIsModified(true); setSaveStatus('unsaved'); updateActiveTabModified(true)
  }

  function handleDocumentContentChange(content: string) {
    setFileContent(content)
    handleDocumentDirty()
  }

  // ── 导出文档 ──
  const [exportFormatPicker, setExportFormatPicker] = useState(false)
  async function handleExport(format: ExportFormat) {
    const success = await exportFile(getCurrentContent(), format, settings.language)
    setExportFormatPicker(false)
    if (success) {
      notifySuccess(translate(settings.language, 'export.success'))
    } else {
      notifyError(translate(settings.language, 'export.fail'))
    }
  }

  // ── 导入文档（保留函数供未来快捷键/菜单使用）──
  // @ts-ignore: 保留供后续绑定到 UI
  async function handleImport() {
    const result = await importFile(settings.language)
    if (!result) return
    if (isModified && currentFile) {
      if (!(await showConfirm(translate(settings.language, 'file.overwriteUnsavedConfirm')))) return
    }
    setFileContent(result.content)
    setCurrentFile(null)
    setIsModified(false)
    setSaveStatus('unsaved')
    setLastSavedAt(null)
  }

  // ── 大纲跳转：查找编辑器中对应的 h1/h2/h3 并滚动 ──
  function handleTocJump(level: number, text: string) {
    const scrollEl = editorScrollRef.current
    if (!scrollEl) return
    const tag = `h${level}`
    const headings = scrollEl.querySelectorAll(tag)
    for (const h of headings) {
      if (h.textContent?.trim() === text) {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    // 如果没找到完全匹配的，尝试模糊匹配
    for (const h of headings) {
      if (h.textContent?.includes(text)) {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
  }

  // ─── TOC 提取 ───
  const tocItems = useMemo<TocItemData[]>(() => {
    if (!fileContent) return []
    const items: TocItemData[] = []
    for (const line of fileContent.split('\n')) {
      const h1 = line.match(/^#\s+(.+)/)
      if (h1) { items.push({ level: 1, text: h1[1].trim() }); continue }
      const h2 = line.match(/^##\s+(.+)/)
      if (h2) { items.push({ level: 2, text: h2[1].trim() }); continue }
      const h3 = line.match(/^###\s+(.+)/)
      if (h3) { items.push({ level: 3, text: h3[1].trim() }); continue }
    }
    return items
  }, [fileContent])

  // ─── 命令面板：命令列表 ───
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const lang = settings.language
    const cmds: PaletteCommand[] = [
      { id: 'newFile', title: tr(lang, 'palette.newFile'), shortcut: 'Ctrl+N', action: handleNewFile },
      { id: 'saveFile', title: tr(lang, 'palette.saveFile'), shortcut: 'Ctrl+S', action: handleSaveFile },
      { id: 'openFolder', title: tr(lang, 'palette.openFolder'), shortcut: 'Ctrl+O', action: handleOpenFolder },
      { id: 'exportDoc', title: tr(lang, 'palette.exportDoc'), action: () => setExportFormatPicker(true) },
      { id: 'openSettings', title: tr(lang, 'palette.openSettings'), action: () => setSettingsOpen(true) },
      { id: 'ai.continue', title: tr(lang, 'palette.aiContinue'), action: () => editorHandleRef.current?.runAiAction('continue') },
      { id: 'ai.summarize', title: tr(lang, 'palette.aiSummarize'), action: () => editorHandleRef.current?.runAiAction('summarize') },
      { id: 'ai.polish', title: tr(lang, 'palette.aiPolish'), action: () => editorHandleRef.current?.runAiAction('polish') },
      { id: 'ai.translate', title: tr(lang, 'palette.aiTranslate'), action: () => editorHandleRef.current?.runAiAction('translate') },
      { id: 'toggleTheme', title: tr(lang, 'palette.toggleTheme'), action: handleToggleTheme },
      { id: 'toggleSidebar', title: tr(lang, 'palette.toggleSidebar'), action: () => {
        const next = !sidebarOpen
        _setSidebarOpen(next)
        _setSidebarCollapsed(!next)
      }},
      { id: 'toggleFocusMode', title: tr(lang, 'palette.toggleFocusMode'), shortcut: 'F11', action: () => handleSettingsChange({ ...settings, focusMode: !settings.focusMode }) },
      { id: 'mode.live', title: tr(lang, 'palette.mode.live'), action: () => handleEditorModeChange('live') },
      { id: 'mode.read', title: tr(lang, 'palette.mode.read'), action: () => handleEditorModeChange('read') },
      { id: 'mode.source', title: tr(lang, 'palette.mode.source'), action: () => handleEditorModeChange('source') },
      { id: 'find', title: tr(lang, 'palette.cmd.find'), shortcut: 'Ctrl+F', action: () => { setFindReplaceMode('find'); setFindReplaceVisible(true) } },
      { id: 'findReplace', title: tr(lang, 'palette.cmd.findReplace'), shortcut: 'Ctrl+H', action: () => { setFindReplaceMode('replace'); setFindReplaceVisible(true) } },
      { id: 'openRecycleBin', title: tr(lang, 'palette.openRecycleBin'), shortcut: 'Ctrl+Shift+B', action: () => setRecycleBinOpen(true) },
      { id: 'exportPdf', title: tr(lang, 'palette.exportPdf'), action: () => handleExport('pdf') },
      { id: 'deleteCurrentFile', title: tr(lang, 'palette.deleteCurrentFile'), action: () => { if (currentFile) handleDeleteFile(currentFile) } },
    ]
    return cmds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language, settings, sidebarOpen, editorMode, fileContent])

  // ── 搜索结果点击：打开文件并跳转到行 ──
  async function handleSearchResultClick(match: SearchMatchResult) {
    await handleOpenFile(match.filePath)
    // 延迟跳转到对应行
    if (match.lineNumber > 0) {
      setTimeout(() => {
        const scrollEl = editorScrollRef.current
        if (!scrollEl) return
        // 在编辑器中找到对应行数的文本节点并滚动
        const editorDom = scrollEl.querySelector('.ProseMirror') as HTMLElement | null
        if (!editorDom) return
        const lines = editorDom.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr')
        let currentLine = 0
        for (const el of lines) {
          const text = el.textContent || ''
          const lineCount = text.split('\n').length
          currentLine += lineCount
          if (currentLine >= match.lineNumber) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            return
          }
        }
        // 如果没找到精确行，在 markdown 源码中搜索
        const allText = editorDom.textContent || ''
        const idx = allText.indexOf(match.lineText.trim().slice(0, 30))
        if (idx >= 0) {
          editorDom.focus()
        }
      }, 300)
    }
  }

  // ─── 统计 ───
  const documentStats = useMemo(() => getDocumentStatistics(fileContent), [fileContent])
  const lineCount = fileContent.split('\n').length
  const syncLabel = translate(settings.language, getSyncStatusKey(saveStatus))
  const lastSavedTime = formatLastSavedTime(lastSavedAt)
  const lastSavedLabel = lastSavedTime
    ? translate(settings.language, 'status.lastSaved', { time: lastSavedTime })
    : translate(settings.language, 'status.lastSavedNever')
  const showWelcome = tabs.length === 0 && !fileContent
  const displayName = currentFile ? (currentFile.split(/[\\/]/).pop() ?? currentFile) : (fileContent ? translate(settings.language, 'document.untitledFileName') : null)

  // ── 空状态检测：文档内容为空或仅有默认未命名标题 ──
  const trimmedContent = fileContent.trim()
  const isContentEmpty = trimmedContent === '' || DEFAULT_CONTENT_LANGS.some((lang) => {
    const defaultTitle = translate(lang, 'document.defaultTitle')
    return trimmedContent === `# ${defaultTitle}` || trimmedContent === translate(lang, 'document.defaultContent').trim()
  })
  const showEmptyState = !showWelcome && activeTabId !== null && !isModified && isContentEmpty && editorMode !== 'source' && editorMode !== 'split'

  // ── 插入模板内容 ──
  function handleInsertTemplate(content: string) {
    if (!activeTabId) {
      handleNewFile()
    }
    setTimeout(() => {
      setFileContent(content)
      setIsModified(true)
      setSaveStatus('unsaved')
      updateActiveTabModified(true)
    }, 50)
  }

  const layoutProps = {
    _setSidebarCollapsed, _setSidebarOpen, activeSettingsSection, activeTabId, appVersion, checkingUpdate, closeOtherTabs, closeTab,
    currentFile, currentFolderPath, displayName, doCheckUpdate, documentStats, editorHandleRef, editorMode, editorScrollRef,
    exportFormatPicker, fileContent, fileTree, finalizeNotice, findReplaceMode, findReplaceVisible, folderHistory, handleCloseWindow,
    handleDeleteFile, handleDocumentContentChange, handleDocumentDirty, handleExport, handleInsertTemplate, handleNewFile, handleNewWindow, handleOpenFile, handleOpenFileDialog,
    handleOpenFolder, handleSaveFile, handleSearchResultClick, handleSettingsChange, handleTocJump, handleToggleTheme, imageManagerOpen, isModified,
    lastSavedLabel, lineCount, onResizeStart, paletteCommands, paletteVisible, recentFiles, recycleBinOpen, removeFolderHistory,
    reopenFolder, rollbackAvailable, saveStatus, scanFolder, setActiveSettingsSection, setEditorMode: handleEditorModeChange, setExportFormatPicker, setFinalizeNotice,
    setFindReplaceMode, setFindReplaceVisible, setImageManagerOpen, setPaletteVisible, setRecycleBinOpen, setSettingsOpen, setShowOnboarding, setShowUpdateToast,
    setUpdateNotification, settings, settingsOpen, showEmptyState, showOnboarding, showUpdateToast, showWelcome, sidebarOpen,
    sidebarWidth, switchToTab, syncLabel, tabs, tocItems, updateInfo, updateNotification, updater,
    windowMaximized,
  }

  return <AppLayout {...layoutProps} />
}
