import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/api/dialog'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SettingsPanel } from './components/SettingsPanel'
import type { TocItemData } from './components/Sidebar'
import { isTauri, safeTauriListener } from './utils/tauri'
import type { FileEntry, AppSettings } from './types'

type FocusMode = 'normal' | 'focus' | 'immersive'

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
  miniSidebar: false,
}

const UNTITLED_DEFAULT = '# 未命名文档\n\n开始编写...\n'

export function App() {
  // ── 文件状态 ──
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isModified, setIsModified] = useState(false)
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // ── 设置状态 ──
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  // ── UI 状态 ──
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusMode, setFocusMode] = useState<FocusMode>('normal')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // ── 暗色判定 ──
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  // ── 应用 focus/immersive body class ──
  useEffect(() => {
    document.body.classList.remove('focus-mode', 'immersive-mode')
    if (focusMode === 'focus') document.body.classList.add('focus-mode')
    if (focusMode === 'immersive') document.body.classList.add('immersive-mode')
  }, [focusMode])

  // ── 主题应用 ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // ── 加载设置 ──
  useEffect(() => { loadSettings() }, [])

  // ── 监听文件拖放 ──
  useEffect(() => {
    if (!isTauri()) return () => {}
    const cleanup = safeTauriListener(() =>
      listen('tauri://file-drop', (event) => {
        const paths = event.payload as string[]
        if (paths?.length > 0) handleOpenFile(paths[0])
      })
    )
    return () => { if (cleanup) cleanup() }
  }, [])

  // ── 自动保存 ──
  useEffect(() => {
    if (!settings.autoSave || !currentFile || !isModified) return
    const timer = setTimeout(() => handleSaveFile(), settings.autoSaveInterval * 1000)
    return () => clearTimeout(timer)
  }, [isModified, settings.autoSave, settings.autoSaveInterval, currentFile])

  // ── 键盘快捷键 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 's') { e.preventDefault(); handleSaveFile() }
      if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); toggleFocusMode() }
      if (ctrl && e.key === 'n') { e.preventDefault(); handleNewFile() }
      if (ctrl && e.key === 'o') { e.preventDefault(); handleOpenFolder() }
      if (ctrl && e.key === ',') { e.preventDefault(); setSettingsOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentFile, fileContent, settings])

  // ─── 操作函数 ───

  async function loadSettings() {
    if (!isTauri()) return
    try {
      const s = await invoke<Partial<AppSettings>>('get_settings')
      // 合并默认值，确保新字段有默认值
      setSettings({ ...DEFAULT_SETTINGS, ...s })
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  function handleSettingsChange(newSettings: AppSettings) {
    setSettings(newSettings)
    if (!isTauri()) return
    invoke('save_settings', { settings: newSettings })
      .catch((e) => console.error('Failed to save settings:', e))
  }

  function handleToggleTheme() {
    handleSettingsChange({ ...settings, theme: isDark ? 'light' : 'dark' })
  }

  function toggleFocusMode() {
    setFocusMode((prev) =>
      prev === 'normal' ? 'focus' : prev === 'focus' ? 'immersive' : 'normal'
    )
  }

  // ── 新建文件 ──
  function handleNewFile() {
    // 如果有未保存的内容，提示保存
    if (isModified && currentFile) {
      if (!confirm('当前文档有未保存的修改，是否先保存？')) {
        // 用户选择不保存，直接新建
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

  // ── 打开文件夹/文件 ──
  async function handleOpenFolder() {
    if (!isTauri()) {
      // 浏览器环境用 input[type=file] 模拟
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
      // 使用 Tauri dialog 选择文件
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      if (typeof selected === 'string') {
        await handleOpenFile(selected)
      }
    } catch (e) {
      console.error('Failed to open dialog:', e)
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

  // ── 保存文件 ──
  async function handleSaveFile() {
    if (!isTauri()) {
      // 浏览器环境：用 download 模拟保存
      if (!currentFile) {
        // 新文件：提示输入文件名
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

    // Tauri 环境
    if (!currentFile) {
      // 新文件：用 dialog 选择保存路径
      try {
        const savePath = await openDialog({
          directory: true,
          multiple: false,
          title: '选择保存位置',
        })
        if (typeof savePath === 'string') {
          const fileName = prompt('请输入文件名:', '未命名.md')
          if (!fileName) return
          const fullPath = `${savePath}/${fileName}`
          await invoke('write_file_command', { path: fullPath, content: fileContent })
          setCurrentFile(fullPath)
          setIsModified(false)
          setSaveStatus('saved')
          // 加入最近文件
          applyOpenedFile(fullPath, fileContent)
        }
      } catch (e) {
        alert(`保存失败: ${e}`)
      }
      return
    }

    // 已有文件：直接保存
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
    if (sidebarOpen) {
      setSidebarOpen(false)
      setSidebarCollapsed(true)
    } else {
      setSidebarOpen(true)
      setSidebarCollapsed(false)
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
  const modeLabel = focusMode === 'focus' ? '聚焦模式' : focusMode === 'immersive' ? '沉浸模式' : '编辑模式'
  const showWelcome = !currentFile && !fileContent
  const displayName = currentFile ? (currentFile.split(/[\\/]/).pop() ?? currentFile) : (fileContent ? '未命名.md' : null)

  return (
    <div className="app-container">
      <TopBar
        currentFile={displayName}
        isModified={isModified}
        isDark={isDark}
        onToggleSidebar={handleToggleSidebar}
        onToggleTheme={handleToggleTheme}
        onNewFile={handleNewFile}
        onOpenFolder={handleOpenFolder}
        onOpenSettings={() => setSettingsOpen(true)}
        onFocusMode={toggleFocusMode}
        sidebarCollapsed={sidebarCollapsed}
      />

      <div className="main-layout">
        {sidebarOpen && (
          <Sidebar
            onOpenFile={handleOpenFile}
            recentFiles={recentFiles}
            currentFile={currentFile}
            tocItems={tocItems}
          />
        )}

        <main className="editor-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
          {showWelcome && (
            <WelcomeScreen onNewFile={handleNewFile} onOpenFolder={handleOpenFolder} />
          )}
          {!showWelcome && (
            <div className="editor-pane" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <Editor
                content={fileContent}
                onChange={(content) => {
                  setFileContent(content)
                  setIsModified(true)
                  setSaveStatus('unsaved')
                }}
                settings={settings}
              />
            </div>
          )}
          <div className="focus-overlay" />
        </main>
      </div>

      {/* 状态栏 */}
      <footer className="statusbar">
        <div className="statusbar-left">
          <span className="statusbar-item">
            <span className={`status-dot ${saveStatus}`} />
            <span>
              {saveStatus === 'saved' ? '已保存' : saveStatus === 'saving' ? '保存中…' : '未保存'}
            </span>
          </span>
        </div>
        <div className="statusbar-right">
          <span className="statusbar-item">行 {lineCount}, 列 1</span>
          <span className="statusbar-item">{charCount} 字</span>
          <span className="statusbar-item">{modeLabel}</span>
        </div>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        isDark={isDark}
      />
    </div>
  )
}
