import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Editor, type EditorHandle } from './components/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SettingsPanel } from './components/SettingsPanel'
import type { TocItemData } from './components/Sidebar'
import { isTauri } from './utils/tauri'
import { I18nProvider, translate } from './i18n'
import type { Lang } from './i18n'
import { useTauriWindow } from './hooks/useTauriWindow'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { FileEntry, AppSettings, FileTreeNode, EditorMode, FolderHistoryEntry } from './types'
import { exportFile, importFile, EXPORT_FORMATS, type ExportFormat } from './utils/importExport'
import { getLocalVersion, checkForUpdate, getBuildChannel, finalizeUpdate, type UpdateInfo, type UpdateChannel } from './utils/updater'
import { DEFAULT_KEYMAP, resolveKeymap, matchKeymap } from './utils/keymap'
import { useUpdater } from './hooks/useUpdater'
import { CommandPalette, type PaletteCommand, type SearchMatchResult } from './components/CommandPalette'
import { TabBar, type TabItem } from './components/TabBar'
import { RecycleBinPanel } from './components/RecycleBinPanel'
import { Onboarding, isOnboarded } from './components/Onboarding'
import { EmptyState } from './components/EmptyState'
import { ConfirmDialog, showCloseActionDialog, showCloseTabDialog, showAlert, showPrompt, showConfirm } from './components/ConfirmDialog'
import { ToastCenter } from './components/ToastCenter'
import { notifyError, notifySuccess } from './utils/toast'
import { translate as tr } from './i18n'

const BUILD_CHANNEL = getBuildChannel()

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 16,
  fontFamily: 'system-ui',
  markdownFontFamily: 'inherit',
  markdownFontSize: 0,
  autoSave: true,
  autoSaveInterval: 300,
  lineHeight: 'normal',
  editorWidth: 'medium',
  showMarkers: true,
  autoBracket: true,
  showLineNumbers: false,
  showMinimap: false,
  minimapSide: 'right',
  editorMode: 'live',
  cornerRadius: 6,
  buttonRadius: 4,
  toolbarFloating: true,
  language: 'zh-CN',
  focusMode: false,
  updateChannel: BUILD_CHANNEL,
  autoCheckUpdate: true,
  closeAction: 'ask' as const,
  skipClosePrompt: false,
  mermaid: false,
  vim: false,
  keymap: DEFAULT_KEYMAP,
}

const UNTITLED_DEFAULT = '# 未命名文档\n\n开始编写...\n'

// ── localStorage 辅助 ──
function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
function savePersisted(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

export function App() {
  // ── 标签页状态 ──
  const [tabs, setTabs] = useState<TabItem[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  // 标签页内容缓存（tabId → content/isModified/editorMode）
  const tabContentCache = useRef<Map<string, { content: string; isModified: boolean; editorMode: EditorMode; path?: string }>>(new Map())
  let tabIdCounter = useRef(0)

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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // ── 版本更新状态 ──
  const [appVersion, setAppVersion] = useState<string>('0.1.0')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [showUpdateToast, setShowUpdateToast] = useState(false)
  // 更新检查结果通知：available(有新版本) / uptodate(已是最新) / error(检查失败)
  const [updateNotification, setUpdateNotification] = useState<'available' | 'uptodate' | 'error' | null>(null)
  // 是否存在可回滚的旧版本
  const [rollbackAvailable, setRollbackAvailable] = useState(false)
  // 安装后自愈提示：'success'(更新成功) / 'failed'(安装未生效)
  const [finalizeNotice, setFinalizeNotice] = useState<{ status: 'success' | 'failed'; version: string } | null>(null)

  // ── 查找替换状态 ──
  const [findReplaceVisible, setFindReplaceVisible] = useState(false)
  const [findReplaceMode, setFindReplaceMode] = useState<'find' | 'replace'>('find')

  // ── 命令面板状态 ──
  const [paletteVisible, setPaletteVisible] = useState(false)
  // 当前打开的文件夹路径（用于全文搜索）
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>(null)

  // ── 回收站面板状态 ──
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)

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
  // ── 编辑器命令式 ref（用于拖拽图片插入）──
  const editorHandleRef = useRef<EditorHandle>(null)

  // ── 窗口控制（最大化状态 + 关闭/托盘）──
  const { isMaximized: windowMaximized, close: closeWindow, hideToTray } = useTauriWindow()

  // ── 判断当前是否为"新建窗口"（通过 URL 参数 win=secondary 识别）──
  // 新窗口跳过自动更新检查等主窗口专属逻辑，避免重复网络请求与全局副作用，
  // 减少初始化负担（多窗口场景下更新提示只需主窗口负责）
  const isSecondaryWindow = useMemo(() => {
    if (!isTauri()) return false
    try {
      const url = new URL(window.location.href)
      return url.searchParams.get('win') === 'secondary'
    } catch {
      return false
    }
  }, [])

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
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && systemDark)

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
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

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

  // ── 获取当前版本号 ──
  useEffect(() => {
    getLocalVersion().then(v => setAppVersion(v))
  }, [])

  // ── 启动时自动检查更新 ──
  // 更新通道不持久化，直接使用构建时注入的通道（dev/stable/release），
  // 而非从设置配置读取，确保始终与当前构建类型一致
  useEffect(() => {
    if (!settings.autoCheckUpdate) return
    // 新窗口跳过更新检查：更新提示由主窗口统一负责，避免多窗口重复弹窗与网络请求
    if (isSecondaryWindow) return
    // 延迟 2 秒执行，避免与启动加载竞争
    const timer = setTimeout(() => {
      doCheckUpdate(BUILD_CHANNEL, false)
    }, 2000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoCheckUpdate, isSecondaryWindow])

  // ── 检查更新函数 ──
  async function doCheckUpdate(channel: UpdateChannel, showLoading = true) {
    if (showLoading) setCheckingUpdate(true)
    try {
      const currentVersion = await getLocalVersion()
      const info = await checkForUpdate(channel, currentVersion)
      setUpdateInfo(info)
      if (showLoading) {
        // 手动检查：始终显示通知
        if (info && info.isNewer) {
          setUpdateNotification('available')
          setShowUpdateToast(true)
        } else if (info && !info.isNewer) {
          setUpdateNotification('uptodate')
        } else {
          setUpdateNotification('error')
        }
      } else {
        // 自动检查（启动时）：仅在发现新版本时显示
        if (info && info.isNewer) {
          setUpdateNotification('available')
          setShowUpdateToast(true)
        }
      }
      return info
    } catch (e) {
      console.error('Auto-check update failed:', e)
      if (showLoading) {
        setUpdateNotification('error')
      }
      return null
    } finally {
      if (showLoading) setCheckingUpdate(false)
    }
  }

  // ── 安装前保存所有文档（保证数据一致性，避免更新丢失未保存内容）──
  const saveAllForUpdate = useCallback(async (): Promise<boolean> => {
    if (!isTauri()) return true
    try {
      // 1. 先把当前活跃标签的最新内容同步进缓存
      if (activeTabId) {
        tabContentCache.current.set(activeTabId, {
          content: fileContent,
          isModified,
          editorMode,
          path: currentFile ?? undefined,
        })
      }
      // 2. 逐个保存所有"已修改且有磁盘路径"的标签
      for (const [id, cached] of tabContentCache.current.entries()) {
        if (cached.isModified && cached.path) {
          await invoke('write_file_command', { path: cached.path, content: cached.content })
          tabContentCache.current.set(id, { ...cached, isModified: false })
        }
      }
      // 3. 刷新活跃标签的保存状态
      setIsModified(false)
      setSaveStatus('saved')
      return true
    } catch (e) {
      console.error('安装前保存失败:', e)
      // 保存失败时仍返回 true 由用户在确认框决定；但已提示错误
      notifyError(`保存文档失败，为避免数据丢失，已中止安装：${e}`)
      return false
    }
  }, [activeTabId, fileContent, isModified, editorMode, currentFile])

  // ── 应用内更新下载/安装状态机 ──
  const updater = useUpdater({ onBeforeInstall: saveAllForUpdate })

  // ── 启动时执行安装后自愈：判断上次更新是否成功 ──
  useEffect(() => {
    if (isSecondaryWindow) return
    finalizeUpdate().then((r) => {
      if (!r) return
      setRollbackAvailable(r.rollbackAvailable)
      if (r.status === 'success') {
        setFinalizeNotice({ status: 'success', version: r.newVersion })
      } else if (r.status === 'failed') {
        setFinalizeNotice({ status: 'failed', version: r.newVersion })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 自愈提示自动消失 ──
  useEffect(() => {
    if (finalizeNotice) {
      const timer = setTimeout(() => setFinalizeNotice(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [finalizeNotice])

  // ── uptodate/error 通知自动消失 ──
  useEffect(() => {
    if (updateNotification === 'uptodate' || updateNotification === 'error') {
      const timer = setTimeout(() => setUpdateNotification(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [updateNotification])

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
      if (e.key === 'Escape' && editorMode === 'read' && !settingsOpen && !findReplaceVisible && !paletteVisible && !recycleBinOpen) {
        e.preventDefault()
        setEditorMode('live')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentFile, fileContent, settings, editorMode, settingsOpen, findReplaceVisible, paletteVisible, activeTabId, recycleBinOpen])

  // ── 侧边栏拖拽拉伸 ──
  const draggingRef = useRef(false)
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: MouseEvent) => {
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
  }, [sidebarWidth])

  // ─── 操作函数 ───

  // ── 标签页管理 ──
  function generateTabId(): string {
    tabIdCounter.current += 1
    return `tab-${Date.now()}-${tabIdCounter.current}`
  }

  // 创建新标签
  function createTab(name: string, path: string | null, content: string, mode?: EditorMode) {
    const id = generateTabId()
    const tab: TabItem = { id, name, path, isModified: false }
    tabContentCache.current.set(id, { content, isModified: false, editorMode: mode || editorMode, path: path ?? undefined })
    setTabs((prev) => [...prev, tab])
    switchToTab(id)
    return id
  }

  // 切换标签：保存当前标签内容到缓存，加载目标标签内容
  function switchToTab(tabId: string) {
    // 保存当前标签的状态到缓存
    if (activeTabId) {
      const activeTab = tabs.find((t) => t.id === activeTabId)
      tabContentCache.current.set(activeTabId, {
        content: fileContent,
        isModified,
        editorMode,
        path: currentFile ?? activeTab?.path ?? undefined,
      })
    }

    const cached = tabContentCache.current.get(tabId)
    if (!cached) return

    setActiveTabId(tabId)
    // 优先从缓存获取 path（避免 React 状态批处理导致的闭包陷阱）
    const tabPath = cached.path ?? tabs.find((t) => t.id === tabId)?.path ?? null
    setCurrentFile(tabPath)
    setFileContent(cached.content)
    setIsModified(cached.isModified)
    setEditorMode(cached.editorMode)
    setSaveStatus(cached.isModified ? 'unsaved' : 'saved')
  }

  // 关闭标签
  async function closeTab(tabId: string) {
    const cached = tabContentCache.current.get(tabId)
    const tab = tabs.find((t) => t.id === tabId)
    if (cached?.isModified && tab) {
      const choice = await showCloseTabDialog(
        translate(settings.language, 'tab.closeConfirm'),
        translate(settings.language, 'tab.closeTitle'),
        {
          confirmText: translate(settings.language, 'tab.save'),
          tertiaryText: translate(settings.language, 'tab.discard'),
          cancelText: translate(settings.language, 'tab.cancel'),
        }
      )
      if (choice === 'cancel') return
      if (choice === 'save') {
        // 保存标签内容
        const content = cached.content
        const path = cached.path || tab.path
        if (path) {
          // 已有路径，直接保存
          try {
            await invoke('write_file_command', { path, content })
            tabContentCache.current.set(tabId, { ...cached, isModified: false })
            setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, isModified: false } : t))
          } catch (e) {
            await showAlert(`${translate(settings.language, 'tab.saveFailed')}: ${e}`, translate(settings.language, 'tab.closeTitle'))
            return
          }
        } else {
          // 新文件无路径，需要选择保存位置
          if (isTauri()) {
            try {
              const savePath = await openDialog({ directory: true, multiple: false, title: translate(settings.language, 'tab.selectSaveLocation') })
              if (typeof savePath === 'string') {
                const fileName = await showPrompt(translate(settings.language, 'tab.enterFileName'), '未命名.md', translate(settings.language, 'tab.closeTitle'))
                if (!fileName) return
                const fullPath = `${savePath}/${fileName}`
                await invoke('write_file_command', { path: fullPath, content })
                tabContentCache.current.set(tabId, { ...cached, isModified: false, path: fullPath })
                setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, isModified: false, path: fullPath, name: fileName } : t))
                if (currentFolderPath) {
                  scanFolder(currentFolderPath)
                }
              } else {
                return
              }
            } catch (e) {
              await showAlert(`${translate(settings.language, 'tab.saveFailed')}: ${e}`, translate(settings.language, 'tab.closeTitle'))
              return
            }
          } else {
            // 浏览器环境：下载文件
            const name = await showPrompt(translate(settings.language, 'tab.enterFileName'), '未命名.md', translate(settings.language, 'tab.closeTitle'))
            if (!name) return
            const blob = new Blob([content], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = name
            a.click()
            URL.revokeObjectURL(url)
            tabContentCache.current.set(tabId, { ...cached, isModified: false, path: name })
            setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, isModified: false, path: name, name } : t))
          }
        }
      }
      // choice === 'discard' → 不保存，直接关闭
    }

    const idx = tabs.findIndex((t) => t.id === tabId)
    const newTabs = tabs.filter((t) => t.id !== tabId)
    setTabs(newTabs)
    tabContentCache.current.delete(tabId)

    // 如果关闭的是当前标签，切换到相邻标签
    if (activeTabId === tabId) {
      if (newTabs.length === 0) {
        setActiveTabId(null)
        setCurrentFile(null)
        setFileContent('')
        setIsModified(false)
        setSaveStatus('saved')
      } else {
        const nextTab = newTabs[Math.min(idx, newTabs.length - 1)]
        const nextCached = tabContentCache.current.get(nextTab.id)
        if (nextCached) {
          setActiveTabId(nextTab.id)
          // 优先从缓存获取 path（避免 React 状态批处理导致的闭包陷阱）
          setCurrentFile(nextCached.path || nextTab.path)
          setFileContent(nextCached.content)
          setIsModified(nextCached.isModified)
          setEditorMode(nextCached.editorMode)
          setSaveStatus(nextCached.isModified ? 'unsaved' : 'saved')
        }
      }
    }
  }

  // Close other tabs
  async function closeOtherTabs(tabId: string) {
    const targetTab = tabs.find((t) => t.id === tabId)
    if (!targetTab) return

    if (activeTabId) {
      const activeTab = tabs.find((t) => t.id === activeTabId)
      tabContentCache.current.set(activeTabId, {
        content: fileContent,
        isModified,
        editorMode,
        path: currentFile ?? activeTab?.path ?? undefined,
      })
    }

    const modifiedOthers = tabs.filter((tab) => {
      if (tab.id === tabId) return false
      const cached = tabContentCache.current.get(tab.id)
      return cached?.isModified || tab.isModified
    })
    if (modifiedOthers.length > 0) {
      const ok = await showConfirm(
        `\u5176\u4ed6 ${modifiedOthers.length} \u4e2a\u6807\u7b7e\u6709\u672a\u4fdd\u5b58\u4fee\u6539\uff0c\u5173\u95ed\u4f1a\u4e22\u5f03\u8fd9\u4e9b\u4fee\u6539\u3002\u662f\u5426\u7ee7\u7eed\uff1f`,
        translate(settings.language, 'tab.closeTitle')
      )
      if (!ok) return
    }

    for (const tab of tabs) {
      if (tab.id !== tabId) {
        tabContentCache.current.delete(tab.id)
      }
    }
    setTabs(tabs.filter((t) => t.id === tabId))
    if (activeTabId !== tabId) {
      switchToTab(tabId)
    }
  }

  // 更新当前标签的修改状态
  function updateActiveTabModified(modified: boolean) {
    if (!activeTabId) return
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, isModified: modified } : t))
    const cached = tabContentCache.current.get(activeTabId)
    if (cached) {
      tabContentCache.current.set(activeTabId, { ...cached, isModified: modified })
    }
  }

  // 更新当前标签的路径（保存后文件名可能变化）
  function updateActiveTabPath(path: string, name: string) {
    if (!activeTabId) return
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, path, name } : t))
  }

  async function loadSettings() {
    if (!isTauri()) {
      // 非 Tauri 环境：从 localStorage 恢复 editorMode
      setEditorMode(loadPersisted<EditorMode>('fkemark:editorMode', 'live'))
      return
    }
    try {
      const s = await invoke<Partial<AppSettings>>('get_settings')
      const merged = { ...DEFAULT_SETTINGS, ...s }
      setSettings(merged)
      // 从持久化设置同步 editorMode（跨更新保留）
      setEditorMode(merged.editorMode as EditorMode)
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  function handleSettingsChange(newSettings: AppSettings) {
    setSettings(newSettings)
    // editorMode 变更同步到独立 state
    if (newSettings.editorMode !== editorMode) setEditorMode(newSettings.editorMode)
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
    setEditorMode((prev) =>
      prev === 'live' ? 'source' : prev === 'source' ? 'read' : 'live'
    )
  }

  function handleNewFile() {
    // 多标签：直接创建新标签
    createTab(translate(settings.language, 'tab.untitled') + '.md', null, UNTITLED_DEFAULT)
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
          applyOpenedFile(file.name, text)
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
      const selected = await openDialog({ directory: true, multiple: false, title: '选择文件夹' })
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
      showAlert('扫描文件夹失败: ' + String(e))
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
    if (!currentFile) {
      notifyError('请先保存文档后再拖入图片，以便确定 assets 目录位置。')
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
      const content = await invoke<string>('read_file_command', { path: filePath })
      applyOpenedFile(filePath, content)
    } catch (e) {
      console.error('Failed to open file:', e)
      notifyError(`打开文件失败: ${e}`)
    }
  }

  function applyOpenedFile(path: string, content: string) {
    // 检查是否已有该文件的标签
    const existingTab = tabs.find((t) => t.path === path)
    if (existingTab) {
      // 已存在标签，切换过去
      switchToTab(existingTab.id)
      return
    }
    // 创建新标签
    const name = path.split(/[\\/]/).pop() || path
    createTab(name, path, content)
    const entry: FileEntry = { name, path, isFile: true, isDir: false, size: content.length, modified: Date.now() }
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== path)
      return [entry, ...filtered].slice(0, 10)
    })
  }

  async function handleSaveFile() {
    if (!isTauri()) {
      if (!currentFile) {
        const name = await showPrompt('请输入文件名（如: my-note.md）:', '未命名.md')
        if (!name) return
        const blob = new Blob([fileContent], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
        setCurrentFile(name)
        updateActiveTabPath(name, name)
        updateActiveTabModified(false)
        setIsModified(false)
        setSaveStatus('saved')
        return
      }
      updateActiveTabModified(false)
      setIsModified(false)
      setSaveStatus('saved')
      return
    }

    if (!currentFile) {
      try {
        const savePath = await openDialog({ directory: true, multiple: false, title: '选择保存位置' })
        if (typeof savePath === 'string') {
          const fileName = await showPrompt('请输入文件名:', '未命名.md')
          if (!fileName) return
          const fullPath = `${savePath}/${fileName}`
          await invoke('write_file_command', { path: fullPath, content: fileContent })
          updateActiveTabPath(fullPath, fileName)
          setCurrentFile(fullPath)
          updateActiveTabModified(false)
          setIsModified(false)
          setSaveStatus('saved')
          // 刷新文件树
          if (currentFolderPath) {
            scanFolder(currentFolderPath)
          }
        }
      } catch (e) {
        notifyError(`保存失败: ${e}`)
      }
      return
    }

    try {
      setSaveStatus('saving')
      await invoke('write_file_command', { path: currentFile, content: fileContent })
      updateActiveTabModified(false)
      setIsModified(false)
      setSaveStatus('saved')
    } catch (e) {
      setSaveStatus('unsaved')
      alert(`保存失败: ${e}`)
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

  // ── 导出文档 ──
  const [exportFormatPicker, setExportFormatPicker] = useState(false)
  async function handleExport(format: ExportFormat) {
    const success = await exportFile(fileContent, format)
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
    const result = await importFile()
    if (!result) return
    if (isModified && currentFile) {
      if (!(await showConfirm('当前文档有未保存的修改，是否覆盖？'))) return
    }
    setFileContent(result.content)
    setCurrentFile(null)
    setIsModified(false)
    setSaveStatus('saved')
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
      { id: 'toggleTheme', title: tr(lang, 'palette.toggleTheme'), action: handleToggleTheme },
      { id: 'toggleSidebar', title: tr(lang, 'palette.toggleSidebar'), action: () => {
        const next = !sidebarOpen
        _setSidebarOpen(next)
        _setSidebarCollapsed(!next)
      }},
      { id: 'toggleFocusMode', title: tr(lang, 'palette.toggleFocusMode'), shortcut: 'F11', action: () => handleSettingsChange({ ...settings, focusMode: !settings.focusMode }) },
      { id: 'mode.live', title: tr(lang, 'palette.mode.live'), action: () => setEditorMode('live') },
      { id: 'mode.read', title: tr(lang, 'palette.mode.read'), action: () => setEditorMode('read') },
      { id: 'mode.source', title: tr(lang, 'palette.mode.source'), action: () => setEditorMode('source') },
      { id: 'find', title: tr(lang, 'palette.cmd.find'), shortcut: 'Ctrl+F', action: () => { setFindReplaceMode('find'); setFindReplaceVisible(true) } },
      { id: 'findReplace', title: tr(lang, 'palette.cmd.findReplace'), shortcut: 'Ctrl+H', action: () => { setFindReplaceMode('replace'); setFindReplaceVisible(true) } },
      { id: 'openRecycleBin', title: tr(lang, 'palette.openRecycleBin'), shortcut: 'Ctrl+Shift+B', action: () => setRecycleBinOpen(true) },
      { id: 'exportPdf', title: tr(lang, 'palette.exportPdf'), action: () => handleExport('pdf') },
      { id: 'deleteCurrentFile', title: tr(lang, 'palette.deleteCurrentFile'), action: () => { if (currentFile) handleDeleteFile(currentFile) } },
    ]
    return cmds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language, settings, sidebarOpen])

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
  const charCount = fileContent.length
  const lineCount = fileContent.split('\n').length
  const saveLabel = saveStatus === 'saved'
    ? translate(settings.language, 'status.saved')
    : saveStatus === 'saving'
      ? translate(settings.language, 'status.saving')
      : translate(settings.language, 'status.unsaved')
  const showWelcome = tabs.length === 0 && !fileContent
  const displayName = currentFile ? (currentFile.split(/[\\/]/).pop() ?? currentFile) : (fileContent ? '未命名.md' : null)

  // ── 空状态检测：文档内容为空或仅有默认未命名标题 ──
  const isContentEmpty = fileContent.trim() === '' || fileContent.trim() === '# 未命名文档' || /^#\s+未命名文档\s*\n*$/.test(fileContent.trim())
  const showEmptyState = !showWelcome && activeTabId !== null && isContentEmpty && editorMode !== 'source' && editorMode !== 'split'

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

  return (
    <I18nProvider
      language={settings.language}
      setLanguage={(l: Lang) => handleSettingsChange({ ...settings, language: l })}
    >
    <div className="app-container">
      <TopBar
        currentFile={displayName}
        isModified={isModified}
        theme={settings.theme}
        editorMode={editorMode}
        onToggleTheme={handleToggleTheme}
        onThemeChange={(newTheme) => handleSettingsChange({ ...settings, theme: newTheme })}
        onOpenSettings={(section?: string) => {
          if (section) setActiveSettingsSection(section)
          setSettingsOpen(true)
        }}
        onExport={() => setExportFormatPicker(true)}
        onSave={handleSaveFile}
        onEditorModeChange={setEditorMode}
        sidebarCollapsed={!sidebarOpen}
        onToggleSidebar={() => {
          const next = !sidebarOpen
          _setSidebarOpen(next)
          _setSidebarCollapsed(!next)
        }}
        hasUpdate={!!(updateInfo && updateInfo.isNewer)}
        onCloseAction={handleCloseWindow}
        isMaximized={windowMaximized}
        onNewTextFile={handleNewFile}
        onOpenFile={handleOpenFileDialog}
        onOpenFolder={handleOpenFolder}
        onNewWindow={handleNewWindow}
      />

      <div className="main-layout">
        <div
          className={`sidebar-wrapper ${sidebarOpen ? 'open' : 'closed'}`}
          style={{ width: sidebarOpen ? `${sidebarWidth + 2}px` : '0px' }}
        >
          <Sidebar
            onOpenFile={handleOpenFile}
            recentFiles={recentFiles}
            currentFile={currentFile}
            tocItems={tocItems}
            onTocClick={handleTocJump}
            fileTree={fileTree}
            width={sidebarWidth}
            folderHistory={folderHistory}
            onReopenFolder={reopenFolder}
            onRemoveFolderHistory={removeFolderHistory}
            onOpenFolder={handleOpenFolder}
            onDeleteFile={handleDeleteFile}
            onOpenRecycleBin={() => setRecycleBinOpen(true)}
          />
          {/* 拖拽手柄（细线条）*/}
          <div
            className="sidebar-resizer"
            onMouseDown={onResizeStart}
          />
        </div>

        <main className="editor-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
          {showWelcome && (
            <WelcomeScreen onNewFile={handleNewFile} onOpenFolder={handleOpenFolder} />
          )}
          {!showWelcome && (
            <div className="editor-pane" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabClick={switchToTab}
                onTabClose={closeTab}
                onCloseOthers={closeOtherTabs}
                onNewTab={handleNewFile}
              />
              <Editor
                ref={editorHandleRef}
                content={fileContent}
                onChange={(content) => {
                  setFileContent(content)
                  setIsModified(true)
                  setSaveStatus('unsaved')
                  updateActiveTabModified(true)
                }}
                settings={settings}
                editorMode={editorMode}
                onEditorModeChange={setEditorMode}
                scrollRef={editorScrollRef}
                onToggleMinimap={() => handleSettingsChange({ ...settings, showMinimap: !settings.showMinimap })}
                findReplaceVisible={findReplaceVisible}
                findReplaceMode={findReplaceMode}
                onFindReplaceClose={() => setFindReplaceVisible(false)}
                onFindReplaceModeChange={setFindReplaceMode}
                filePath={currentFile}
              />
              {/* 空状态提示 */}
              {showEmptyState && (
                <EmptyState onInsertTemplate={handleInsertTemplate} />
              )}
            </div>
          )}
          <div className="focus-overlay" />
        </main>
      </div>

            {/* 状态栏 — 对齐原型图布局 */}
      <footer className="statusbar" onContextMenu={(e) => e.preventDefault()}>
        <div className="statusbar-left">
          {/* 保存状态指示器 */}
          <span className="statusbar-item">
            <span className={`status-dot ${saveStatus}`} />
            <span>{saveLabel}</span>
          </span>
          {/* 文件格式标签 */}
          <span className="statusbar-item statusbar-format">Markdown</span>
          {/* 字数统计 */}
          <span className="statusbar-item word-count">{translate(settings.language, 'status.wordCount', { n: charCount })}</span>
        </div>
        <div className="statusbar-right">
          {/* 视图模式切换组 */}
          <div className="view-mode-group">
            <button className={`view-mode-btn ${editorMode === 'live' ? 'active' : ''}`} onClick={() => setEditorMode('live')}>{translate(settings.language, 'status.mode.live')}</button>
            <button className={`view-mode-btn ${editorMode === 'split' ? 'active' : ''}`} onClick={() => setEditorMode('split')}>{translate(settings.language, 'status.mode.split')}</button>
            <button className={`view-mode-btn ${editorMode === 'read' ? 'active' : ''}`} onClick={() => setEditorMode('read')}>{translate(settings.language, 'status.mode.read')}</button>
            <button className={`view-mode-btn ${editorMode === 'source' ? 'active' : ''}`} onClick={() => setEditorMode('source')}>{translate(settings.language, 'status.mode.source')}</button>
          </div>
          {/* 光标位置 */}
          <span className="statusbar-item">{translate(settings.language, 'status.line', { rows: lineCount, col: 1 })}</span>
          {/* 编码标识 */}
          <span className="statusbar-item statusbar-encoding">UTF-8</span>
          {/* 设置按钮 */}
          <button className="settings-gear-btn" onClick={() => setSettingsOpen(true)} title={translate(settings.language, 'status.settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            <span>{translate(settings.language, 'status.settings')}</span>
          </button>
        </div>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        initialSection={activeSettingsSection}
        appVersion={appVersion}
        updateInfo={updateInfo}
        checkingUpdate={checkingUpdate}
        onCheckUpdate={(ch) => doCheckUpdate(ch, true)}
        updater={updater}
        rollbackAvailable={rollbackAvailable}
        onOpenDevtools={async () => {
          if (!isTauri()) return
          try { await invoke('open_devtools') }
          catch (e) { console.error('打开开发者工具失败:', e) }
        }}
      />

      {/* 导出格式选择器 */}
      {exportFormatPicker && (
        <div className="link-dialog-overlay" onClick={() => setExportFormatPicker(false)}>
          <div className="link-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="link-dialog-title">{translate(settings.language, 'export.title')}</div>
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt}
                className="app-menu-item"
                style={{ width: '100%', margin: '4px 0' }}
                onClick={() => handleExport(fmt)}
              >
                <span className="menu-label">{translate(settings.language, `export.format.${fmt}`)}</span>
              </button>
            ))}
            <div className="link-dialog-actions">
              <button className="link-dialog-btn cancel" onClick={() => setExportFormatPicker(false)}>
                {translate(settings.language, 'linkDialog.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 更新通知 Toast */}
      {showUpdateToast && updateInfo && updateInfo.isNewer && (
        <div className="update-toast-overlay">
          <div className="update-toast">
            <div className="update-toast-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div className="update-toast-content">
              <div className="update-toast-title">{translate(settings.language, 'update.newVersionAvailable')}</div>
              <div className="update-toast-desc">{translate(settings.language, 'update.newVersionDesc', { version: updateInfo.version })}</div>
              <div className="update-toast-actions">
                <button className="update-toast-btn primary" onClick={() => {
                  setShowUpdateToast(false)
                  setActiveSettingsSection('about')
                  setSettingsOpen(true)
                }}>
                  {translate(settings.language, 'update.title')}
                </button>
                <button className="update-toast-btn" onClick={() => {
                  setShowUpdateToast(false)
                  setActiveSettingsSection('about')
                  setSettingsOpen(true)
                  // 直接开始下载（若当前平台有可用包）
                  updater.start(updateInfo)
                }}>
                  {translate(settings.language, 'update.download')}
                </button>
                <button className="update-toast-btn ghost" onClick={() => setShowUpdateToast(false)}>
                  {translate(settings.language, 'update.remindLater')}
                </button>
              </div>
            </div>
            <button className="update-toast-close" onClick={() => setShowUpdateToast(false)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 更新检查结果通知（已最新 / 检查失败） */}
      {(updateNotification === 'uptodate' || updateNotification === 'error') && (
        <div className="update-toast-overlay">
          <div className={`update-toast-mini ${updateNotification}`}>
            <div className="update-toast-mini-icon">
              {updateNotification === 'uptodate' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <span className="update-toast-mini-text">
              {updateNotification === 'uptodate'
                ? translate(settings.language, 'update.upToDate')
                : translate(settings.language, 'update.checkFailed')}
            </span>
            <button className="update-toast-mini-close" onClick={() => setUpdateNotification(null)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 安装后自愈通知（更新成功 / 安装未生效） */}
      {finalizeNotice && (
        <div className="update-toast-overlay">
          <div className={`update-toast-mini ${finalizeNotice.status === 'success' ? 'uptodate' : 'error'}`}>
            <div className="update-toast-mini-icon">
              {finalizeNotice.status === 'success' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <span className="update-toast-mini-text">
              {finalizeNotice.status === 'success'
                ? translate(settings.language, 'update.installSuccess', { version: finalizeNotice.version })
                : translate(settings.language, 'update.installFailed')}
            </span>
            <button className="update-toast-mini-close" onClick={() => setFinalizeNotice(null)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 命令面板（⌘P 风格）*/}
      <CommandPalette
        visible={paletteVisible}
        onClose={() => setPaletteVisible(false)}
        fileTree={fileTree}
        currentFile={currentFile}
        recentFiles={recentFiles}
        onOpenFile={handleOpenFile}
        folderPath={currentFolderPath}
        commands={paletteCommands}
        onSearchResultClick={handleSearchResultClick}
      />

      {/* 回收站面板 */}
      <RecycleBinPanel
        open={recycleBinOpen}
        onClose={() => setRecycleBinOpen(false)}
        onRestored={() => {
          // 文件还原后刷新文件树
          if (currentFolderPath) {
            scanFolder(currentFolderPath)
          }
        }}
      />

      {/* 首启引导 */}
      {showOnboarding && (
        <Onboarding
          onComplete={() => setShowOnboarding(false)}
          onOpenFolder={handleOpenFolder}
          onNewFile={handleNewFile}
        />
      )}

      {/* 自定义对话框（替代原生 alert/confirm/prompt） */}
      <ConfirmDialog lang={settings.language} />
      {/* 统一 Toast 通知中心 */}
      <ToastCenter />
    </div>
    </I18nProvider>
  )
}
