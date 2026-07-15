import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { Editor } from './components/Editor'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ThemeProvider } from './providers/ThemeProvider'
import { isTauri, safeTauriListener } from './utils/tauri'
import type { FileEntry, AppSettings } from './types'

export function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isModified, setIsModified] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'system',
    fontSize: 16,
    autoSave: true,
    autoSaveInterval: 300,
  })
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([])

  // 计算当前是否为暗色主题
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  // 加载设置
  useEffect(() => {
    loadSettings()
  }, [])

  // 监听文件打开事件（拖拽文件到窗口）
  useEffect(() => {
    // 只有在 Tauri 环境中才监听文件拖放事件
    if (!isTauri()) {
      console.log('非 Tauri 环境，跳过文件拖放监听')
      return () => {}
    }

    const cleanup = safeTauriListener(() => 
      listen('tauri://file-drop', (event) => {
        const paths = event.payload as string[]
        if (paths && paths.length > 0) {
          handleOpenFile(paths[0])
        }
      })
    )

    return () => {
      if (cleanup) cleanup()
    }
  }, [])

  // 自动保存
  useEffect(() => {
    if (!settings.autoSave || !currentFile || !isModified) return

    const timer = setTimeout(() => {
      handleSaveFile()
    }, settings.autoSaveInterval * 1000)

    return () => clearTimeout(timer)
  }, [isModified, settings.autoSave, settings.autoSaveInterval, currentFile])

  // 监听 Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentFile, fileContent])

  // 应用主题到 document
  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.setAttribute('data-theme', 'dark')
    } else {
      root.setAttribute('data-theme', 'light')
    }
  }, [isDark])

  const loadSettings = async () => {
    if (!isTauri()) {
      console.log('非 Tauri 环境，跳过加载设置')
      return
    }
    
    try {
      const loadedSettings = await invoke<AppSettings>('get_settings')
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const handleSettingsChange = async (newSettings: AppSettings) => {
    if (!isTauri()) {
      console.log('非 Tauri 环境，跳过保存设置')
      setSettings(newSettings)
      return
    }
    
    try {
      await invoke('save_settings', { settings: newSettings })
      setSettings(newSettings)
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  // 主题切换：light ↔ dark
  const handleToggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    handleSettingsChange({ ...settings, theme: newTheme })
  }

  const handleOpenFile = async (filePath: string) => {
    if (!isTauri()) {
      console.log('非 Tauri 环境，模拟打开文件')
      try {
        // 在浏览器环境中，我们可以模拟读取文件内容
        const response = await fetch(`/api/read-file?path=${encodeURIComponent(filePath)}`)
        if (response.ok) {
          const content = await response.text()
          setCurrentFile(filePath)
          setFileContent(content)
          setIsModified(false)
          
          // 添加到最近文件列表
          const fileName = filePath.split(/[\\/]/).pop() || filePath
          const fileInfo: FileEntry = {
            name: fileName,
            path: filePath,
            isFile: true,
            isDir: false,
            size: content.length,
            modified: Date.now(),
          }
          setRecentFiles((prev) => {
            const filtered = prev.filter((f) => f.path !== filePath)
            return [fileInfo, ...filtered].slice(0, 10)
          })
        } else {
          // 在浏览器中无法读取本地文件，提示用户
          alert('在浏览器中无法直接读取本地文件，请在 Tauri 应用中打开')
        }
      } catch (error) {
        console.error('Failed to open file:', error)
        alert(`打开文件失败: ${error}`)
      }
      return
    }
    
    try {
      const content = await invoke<string>('read_file_command', { path: filePath })
      setCurrentFile(filePath)
      setFileContent(content)
      setIsModified(false)

      // 添加到最近文件列表
      const fileName = filePath.split(/[\\/]/).pop() || filePath
      const fileInfo: FileEntry = {
        name: fileName,
        path: filePath,
        isFile: true,
        isDir: false,
        size: content.length,
        modified: Date.now(),
      }
      setRecentFiles((prev) => {
        const filtered = prev.filter((f) => f.path !== filePath)
        return [fileInfo, ...filtered].slice(0, 10)
      })
    } catch (error) {
      console.error('Failed to open file:', error)
      alert(`打开文件失败: ${error}`)
    }
  }

  const handleSaveFile = async () => {
    if (!isTauri()) {
      console.log('非 Tauri 环境，模拟保存文件')
      // 在浏览器环境中，模拟保存行为
      if (!currentFile) {
        const newPath = prompt('请输入文件保存路径（如: ~/Documents/test.md）:')
        if (!newPath) return
        
        setCurrentFile(newPath)
        setIsModified(false)
        alert('在浏览器环境中，文件保存为模拟操作。请在实际 Tauri 应用中使用完整功能。')
      } else {
        setIsModified(false)
        alert('在浏览器环境中，文件保存为模拟操作。请在实际 Tauri 应用中使用完整功能。')
      }
      return
    }
    
    if (!currentFile) {
      // 新文件保存 - 使用输入框获取路径
      const newPath = prompt('请输入文件保存路径（如: ~/Documents/test.md）:')
      if (!newPath) return

      try {
        await invoke('write_file_command', { path: newPath, content: fileContent })
        setCurrentFile(newPath)
        setIsModified(false)
      } catch (error) {
        console.error('Failed to save file:', error)
        alert(`保存文件失败: ${error}`)
      }
    } else {
      try {
        await invoke('write_file_command', { path: currentFile, content: fileContent })
        setIsModified(false)
      } catch (error) {
        console.error('Failed to save file:', error)
        alert(`保存文件失败: ${error}`)
      }
    }
  }

  return (
    <ThemeProvider settings={settings} onSettingsChange={handleSettingsChange}>
      <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
        <TopBar
          currentFile={currentFile}
          isModified={isModified}
          isDark={isDark}
          onSave={handleSaveFile}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleTheme={handleToggleTheme}
        />

        <div className="flex-1 flex overflow-hidden">
          {sidebarOpen && (
            <Sidebar
              onOpenFile={handleOpenFile}
              recentFiles={recentFiles}
            />
          )}

          <div className="flex-1 overflow-hidden">
            <Editor
              content={fileContent}
              onChange={(content) => {
                setFileContent(content)
                setIsModified(true)
              }}
              settings={settings}
            />
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="h-6 bg-muted border-t border-border px-3 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-3">
            <span>
              {currentFile ? currentFile.split(/[\\/]/).pop() : '未保存'}
              {isModified && <span className="text-orange-500 ml-1">● 未保存</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>字符数: {fileContent.length}</span>
            <span>行数: {fileContent.split('\n').length}</span>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
