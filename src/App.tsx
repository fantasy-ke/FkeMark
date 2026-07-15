import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { Editor } from './components/Editor'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ThemeProvider } from './providers/ThemeProvider'
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

  // 加载设置
  useEffect(() => {
    loadSettings()
  }, [])

  // 监听文件打开事件（拖拽文件到窗口）
  useEffect(() => {
    const unlisten = listen('tauri://file-drop', (event) => {
      const paths = event.payload as string[]
      if (paths && paths.length > 0) {
        handleOpenFile(paths[0])
      }
    })

    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
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

  const loadSettings = async () => {
    try {
      const loadedSettings = await invoke<AppSettings>('get_settings')
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const handleSettingsChange = async (newSettings: AppSettings) => {
    try {
      await invoke('save_settings', { settings: newSettings })
      setSettings(newSettings)
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  const handleOpenFile = async (filePath: string) => {
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
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        <TopBar
          currentFile={currentFile}
          isModified={isModified}
          onSave={handleSaveFile}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
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
        <div className="h-6 bg-muted border-t px-3 flex items-center justify-between text-xs text-muted-foreground">
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
