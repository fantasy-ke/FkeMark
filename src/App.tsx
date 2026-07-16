import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/api/dialog'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Editor, type EditorHandle } from './components/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SettingsPanel } from './components/SettingsPanel'
import { AboutPage } from './components/AboutPage'
import type { TocItemData } from './components/Sidebar'
import { isTauri, safeTauriListener } from './utils/tauri'
import { I18nProvider, translate } from './i18n'
import type { Lang } from './i18n'
import { useTauriWindow } from './hooks/useTauriWindow'
import type { FileEntry, AppSettings, FileTreeNode, EditorMode, FolderHistoryEntry } from './types'
import { exportFile, importFile, EXPORT_FORMATS, type ExportFormat } from './utils/importExport'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 16,
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
  fontFamily: 'system-ui',
  language: 'zh-CN',
  focusMode: false,
  typewriterMode: false,
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
  // ── 文件状态 ──
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isModified, setIsModified] = useState(false)
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([])
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  // 文件夹打开历史（持久化到 localStorage）
  const [folderHistory, setFolderHistory] = useState<FolderHistoryEntry[]>(() => loadPersisted('fkemark:folderHistory', []))

  // ── 侧边栏状态（持久化）──
  const [sidebarOpen, setSidebarOpen] = useState(() => loadPersisted('fkemark:sidebarOpen', true))
  const [sidebarWidth, setSidebarWidth] = useState(() => loadPersisted('fkemark:sidebarWidth', 240))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadPersisted('fkemark:sidebarCollapsed', false))

  // ── 设置状态 ──
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  // ── UI 状态 ──
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('live')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // ── 编辑器 ref（用于大纲跳转）──
  const editorScrollRef = useRef<HTMLDivElement>(null)
  // ── 编辑器命令式 ref（用于拖拽图片插入）──
  const editorHandleRef = useRef<EditorHandle>(null)

  // ── 窗口最大化状态（用于圆角切换）──
  const { isMaximized: windowMaximized } = useTauriWindow()

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
  useEffect(() => { savePersisted('fkemark:sidebarCollapsed', sidebarCollapsed) }, [sidebarCollapsed])
  useEffect(() => { savePersisted('fkemark:folderHistory', folderHistory) }, [folderHistory])

  // ── 圆角变量动态注入到 documentElement ──
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--radius-base', `${settings.cornerRadius}px`)
    root.style.setProperty('--radius-btn', `${settings.buttonRadius}px`)
    root.style.setProperty('--radius-card', `${Math.max(settings.cornerRadius, settings.buttonRadius) + 2}px`)
  }, [settings.cornerRadius, settings.buttonRadius])

  // ── 窗口最大化时移除圆角（填满屏幕）──
  useEffect(() => {
    if (windowMaximized) document.body.classList.add('maximized')
    else document.body.classList.remove('maximized')
  }, [windowMaximized])

  // ── 应用阅读模式 body class（不隐藏头部）──
  useEffect(() => {
    document.body.classList.remove('read-mode', 'source-mode')
    if (editorMode === 'read') document.body.classList.add('read-mode')
    if (editorMode === 'source') document.body.classList.add('source-mode')
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
  useEffect(() => { loadSettings() }, [])

  // ── 监听文件拖放（区分图片与文档）──
  useEffect(() => {
    if (!isTauri()) return () => {}
    const cleanup = safeTauriListener(() =>
      listen('tauri://file-drop', async (event) => {
        const paths = event.payload as string[]
        if (!paths || paths.length === 0) return
        for (const p of paths) {
          if (isImageFile(p)) {
            await handleImageDrop(p)
          } else {
            await handleOpenFile(p)
          }
        }
      })
    )
    return () => { if (cleanup) cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile])

  // ── 自动保存 ──
  useEffect(() => {
    if (!settings.autoSave || !currentFile || !isModified) return
    const timer = setTimeout(() => handleSaveFile(), settings.autoSaveInterval * 1000)
    return () => clearTimeout(timer)
  }, [isModified, settings.autoSave, settings.autoSaveInterval, currentFile])

  // ── 专注模式 / 打字机模式 body class ──
  useEffect(() => {
    document.body.classList.toggle('focus-mode', settings.focusMode)
    document.body.classList.toggle('typewriter-mode', settings.typewriterMode)
  }, [settings.focusMode, settings.typewriterMode])

  // ── 打字机模式：光标始终保持在视口中央 ──
  useEffect(() => {
    if (!settings.typewriterMode) return
    const handler = () => {
      const editorEl = document.querySelector('.editor-inner')
      if (!editorEl) return
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const scrollEl = document.querySelector('.editor-scroll')
      if (!scrollEl) return
      const scrollRect = scrollEl.getBoundingClientRect()
      const center = scrollRect.top + scrollRect.height / 2
      const offset = rect.top - center
      if (Math.abs(offset) > 10) {
        scrollEl.scrollTop += offset
      }
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [settings.typewriterMode])

  // ── 键盘快捷键 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 's') { e.preventDefault(); handleSaveFile() }
      if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); cycleEditorMode() }
      // F11 切换专注模式
      if (e.key === 'F11') { e.preventDefault(); handleSettingsChange({ ...settings, focusMode: !settings.focusMode }) }
      // Ctrl+Shift+T 切换打字机模式
      if (ctrl && e.shiftKey && (e.key === 'T' || e.key === 't')) { e.preventDefault(); handleSettingsChange({ ...settings, typewriterMode: !settings.typewriterMode }) }
      if (ctrl && e.key === 'n') { e.preventDefault(); handleNewFile() }
      if (ctrl && e.key === 'o') { e.preventDefault(); handleOpenFolder() }
      // ESC：阅读模式 → 实时编辑模式
      if (e.key === 'Escape' && editorMode === 'read' && !settingsOpen) {
        e.preventDefault()
        setEditorMode('live')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentFile, fileContent, settings, editorMode, settingsOpen])

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
    if (isModified && currentFile) {
      if (!confirm('当前文档有未保存的修改，是否先保存？')) {
        // 用户选择不保存
      } else {
        handleSaveFile()
        return
      }
    }
    setCurrentFile(null)
    setFileContent(UNTITLED_DEFAULT)
    setIsModified(false)
    setSaveStatus('saved')
  }

  // ── 打开文件夹：扫描 .md 文件树 ──
  async function handleOpenFolder() {
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
      // 选择文件夹
      const selected = await openDialog({ directory: true, multiple: false, title: '选择文件夹' })
      if (typeof selected === 'string') {
        await scanFolder(selected)
      } else if (Array.isArray(selected) && selected.length > 0) {
        await scanFolder(selected[0])
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
      // 记录到文件夹历史
      const name = dirPath.split(/[\\/]/).pop() || dirPath
      setFolderHistory((prev) => {
        const filtered = prev.filter((f) => f.path !== dirPath)
        return [{ path: dirPath, name, openedAt: Date.now() }, ...filtered].slice(0, 10)
      })
    } catch (e) {
      console.error('Failed to scan directory:', e)
      // 降级：直接用 dialog 选文件
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      })
      if (typeof selected === 'string') await handleOpenFile(selected)
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

  // ── 拖拽图片落盘：复制到文档同级 assets 目录，插入相对路径 ──
  async function handleImageDrop(srcPath: string) {
    if (!isTauri()) return
    if (!currentFile) {
      alert('请先保存文档后再拖入图片，以便确定 assets 目录位置。')
      return
    }
    const docDir = currentFile.replace(/[\\/][^\\/]+$/, '')
    try {
      const relPath = await invoke<string>('copy_asset_to_assets', { src: srcPath, docDir })
      const fileName = srcPath.split(/[\\/]/).pop() || 'image'
      editorHandleRef.current?.insertImageMarkdown(relPath, fileName)
    } catch (e) {
      console.error('Failed to copy image asset:', e)
      alert(`图片插入失败: ${e}`)
    }
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
      alert(`打开文件失败: ${e}`)
    }
  }

  function applyOpenedFile(path: string, content: string) {
    setCurrentFile(path)
    setFileContent(content)
    setIsModified(false)
    setSaveStatus('saved')
    const name = path.split(/[\\/]/).pop() || path
    const entry: FileEntry = { name, path, isFile: true, isDir: false, size: content.length, modified: Date.now() }
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== path)
      return [entry, ...filtered].slice(0, 10)
    })
  }

  async function handleSaveFile() {
    if (!isTauri()) {
      if (!currentFile) {
        const name = prompt('请输入文件名（如: my-note.md）:', '未命名.md')
        if (!name) return
        const blob = new Blob([fileContent], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
        setCurrentFile(name)
        setIsModified(false)
        setSaveStatus('saved')
        return
      }
      setIsModified(false)
      setSaveStatus('saved')
      return
    }

    if (!currentFile) {
      try {
        const savePath = await openDialog({ directory: true, multiple: false, title: '选择保存位置' })
        if (typeof savePath === 'string') {
          const fileName = prompt('请输入文件名:', '未命名.md')
          if (!fileName) return
          const fullPath = `${savePath}/${fileName}`
          await invoke('write_file_command', { path: fullPath, content: fileContent })
          applyOpenedFile(fullPath, fileContent)
          setIsModified(false)
          setSaveStatus('saved')
        }
      } catch (e) {
        alert(`保存失败: ${e}`)
      }
      return
    }

    try {
      setSaveStatus('saving')
      await invoke('write_file_command', { path: currentFile, content: fileContent })
      setIsModified(false)
      setSaveStatus('saved')
    } catch (e) {
      setSaveStatus('unsaved')
      alert(`保存失败: ${e}`)
    }
  }

  function handleToggleSidebar() {
    setSidebarOpen(prev => !prev)
    setSidebarCollapsed(prev => !prev)
  }

  // ── 导出文档 ──
  const [exportFormatPicker, setExportFormatPicker] = useState(false)
  async function handleExport(format: ExportFormat) {
    const success = await exportFile(fileContent, format)
    setExportFormatPicker(false)
    if (success) {
      alert(translate(settings.language, 'export.success'))
    } else {
      alert(translate(settings.language, 'export.fail'))
    }
  }

  // ── 导入文档 ──
  async function handleImport() {
    const result = await importFile()
    if (!result) return
    if (isModified && currentFile) {
      if (!confirm('当前文档有未保存的修改，是否覆盖？')) return
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

  // ─── 统计 ───
  const charCount = fileContent.length
  const lineCount = fileContent.split('\n').length
  const modeLabel = editorMode === 'source'
    ? translate(settings.language, 'status.mode.source')
    : editorMode === 'read'
      ? translate(settings.language, 'status.mode.read')
      : translate(settings.language, 'status.mode.live')
  const saveLabel = saveStatus === 'saved'
    ? translate(settings.language, 'status.saved')
    : saveStatus === 'saving'
      ? translate(settings.language, 'status.saving')
      : translate(settings.language, 'status.unsaved')
  const showWelcome = !currentFile && !fileContent
  const displayName = currentFile ? (currentFile.split(/[\\/]/).pop() ?? currentFile) : (fileContent ? '未命名.md' : null)

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
        onToggleSidebar={handleToggleSidebar}
        onToggleTheme={handleToggleTheme}
        onNewFile={handleNewFile}
        onOpenFolder={handleOpenFolder}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        onCycleMode={cycleEditorMode}
        onExport={() => setExportFormatPicker(true)}
        onImport={handleImport}
        sidebarCollapsed={sidebarCollapsed}
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
              <Editor
                ref={editorHandleRef}
                content={fileContent}
                onChange={(content) => {
                  setFileContent(content)
                  setIsModified(true)
                  setSaveStatus('unsaved')
                }}
                settings={settings}
                editorMode={editorMode}
                onEditorModeChange={setEditorMode}
                scrollRef={editorScrollRef}
                onToggleMinimap={() => handleSettingsChange({ ...settings, showMinimap: !settings.showMinimap })}
              />
            </div>
          )}
          <div className="focus-overlay" />
        </main>
      </div>

      {/* 状态栏 */}
      <footer className="statusbar">
        <div className="statusbar-left">
          {/* 左下角设置按钮 */}
          <button
            className="statusbar-item settings-gear-btn"
            onClick={() => setSettingsOpen(true)}
            title="设置"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--icon-default)', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <span className="statusbar-item">
            <span className={`status-dot ${saveStatus}`} />
            <span>
              {saveLabel}
            </span>
          </span>
        </div>
        <div className="statusbar-right">
          <span className="statusbar-item">{translate(settings.language, 'status.line', { rows: lineCount, col: 1 })}</span>
          <span className="statusbar-item">{translate(settings.language, 'status.chars', { n: charCount })}</span>
          {/* 可点击的模式切换 */}
          <button
            className="statusbar-item mode-btn"
            onClick={cycleEditorMode}
            title="点击切换模式（实时编辑 → 源码 → 阅读），阅读模式下按 ESC 退回实时编辑"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--icon-default)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {modeLabel}
          </button>
        </div>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      <AboutPage
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
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
    </div>
    </I18nProvider>
  )
}
