import { Minus, Square, X, Save, Menu, Sun, Moon } from 'lucide-react'
import { useTauriWindow } from '../hooks/useTauriWindow'

interface TopBarProps {
  currentFile: string | null
  isModified: boolean
  isDark: boolean
  onSave: () => void
  onToggleSidebar: () => void
  onToggleTheme: () => void
}

export function TopBar({ currentFile, isModified, isDark, onSave, onToggleSidebar, onToggleTheme }: TopBarProps) {
  const { minimize, toggleMaximize, close, startDragging } = useTauriWindow()

  return (
    <div
      className="flex items-center justify-between h-10 bg-muted border-b border-border select-none shrink-0"
      onMouseDown={(e) => {
        // 仅左键拖拽，且不在按钮上
        if (e.button === 0) {
          startDragging()
        }
      }}
    >
      {/* 左侧：菜单和文件信息 */}
      <div className="flex items-center gap-1 px-2 h-full">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onToggleSidebar()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="切换侧边栏"
        >
          <Menu size={16} />
        </button>

        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium text-foreground">FkeMark</span>
          {currentFile && (
            <>
              <span className="text-muted-foreground text-sm">—</span>
              <span className="text-sm text-muted-foreground truncate max-w-xs">
                {currentFile.split(/[\\/]/).pop()}
                {isModified && <span className="text-orange-500 ml-1">●</span>}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 中间：工具按钮 */}
      <div className="flex items-center gap-1 h-full">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onSave()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="保存 (Ctrl+S)"
        >
          <Save size={15} />
        </button>

        {/* 主题切换按钮 */}
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onToggleTheme()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title={isDark ? '切换到亮色主题' : '切换到暗色主题'}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center h-full">
        <button
          className="px-4 h-full hover:bg-accent transition-colors flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            minimize()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="最小化"
        >
          <Minus size={15} />
        </button>
        <button
          className="px-4 h-full hover:bg-accent transition-colors flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            toggleMaximize()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="最大化/还原"
        >
          <Square size={13} />
        </button>
        <button
          className="px-4 h-full hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            close()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
