import { Minus, Square, X, Copy, FolderOpen, Save, Menu } from 'lucide-react'
import { useTauriWindow } from '../hooks/useTauriWindow'

interface TopBarProps {
  currentFile: string | null
  isModified: boolean
  onSave: () => void
  onToggleSidebar: () => void
}

export function TopBar({ currentFile, isModified, onSave, onToggleSidebar }: TopBarProps) {
  const { minimize, toggleMaximize, close, startDragging } = useTauriWindow()

  return (
    <div
      className="flex items-center justify-between h-10 bg-muted border-b select-none"
      onMouseDown={startDragging}
    >
      {/* 左侧：菜单和文件信息 */}
      <div className="flex items-center gap-1 px-2">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSidebar()
          }}
          title="切换侧边栏"
        >
          <Menu size={16} />
        </button>

        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">FkeMark</span>
          {currentFile && (
            <>
              <span className="text-muted-foreground">—</span>
              <span className="text-sm text-muted-foreground">
                {currentFile.split(/[\\/]/).pop()}
                {isModified && <span className="text-orange-500 ml-1">●</span>}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 中间：工具按钮 */}
      <div className="flex items-center gap-1">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          title="保存 (Ctrl+S)"
        >
          <Save size={15} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors opacity-50 cursor-not-allowed"
          title="新建文件"
          disabled
        >
          <Copy size={15} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors opacity-50 cursor-not-allowed"
          title="打开文件夹"
          disabled
        >
          <FolderOpen size={15} />
        </button>
      </div>

      {/* 右侧：窗口控制 */}
      <div className="flex items-center h-full">
        <button
          className="px-3 h-full hover:bg-accent transition-colors flex items-center"
          onClick={(e) => {
            e.stopPropagation()
            minimize()
          }}
          title="最小化"
        >
          <Minus size={15} />
        </button>
        <button
          className="px-3 h-full hover:bg-accent transition-colors flex items-center"
          onClick={(e) => {
            e.stopPropagation()
            toggleMaximize()
          }}
          title="最大化/还原"
        >
          <Square size={13} />
        </button>
        <button
          className="px-3 h-full hover:bg-red-500 hover:text-white transition-colors flex items-center"
          onClick={(e) => {
            e.stopPropagation()
            close()
          }}
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
