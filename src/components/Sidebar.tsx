import { FileText, Folder, Clock } from 'lucide-react'
import type { FileEntry } from '../types'

interface SidebarProps {
  onOpenFile: (path: string) => void
  recentFiles: FileEntry[]
}

export function Sidebar({ onOpenFile, recentFiles }: SidebarProps) {
  return (
    <div className="w-60 bg-muted/50 border-r flex flex-col overflow-hidden">
      {/* 最近文件区域 */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Clock size={14} />
          <span>最近文件</span>
        </div>

        {recentFiles.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            <p>暂无最近文件</p>
            <p className="mt-1">打开或保存文件后将显示在这里</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {recentFiles.map((file) => (
              <button
                key={file.path}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors text-left"
                onClick={() => onOpenFile(file.path)}
              >
                {file.isDir ? (
                  <Folder size={14} className="text-yellow-500 shrink-0" />
                ) : (
                  <FileText size={14} className="text-blue-400 shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="p-3 border-t text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>FkeMark v0.1.0</span>
        </div>
      </div>
    </div>
  )
}
