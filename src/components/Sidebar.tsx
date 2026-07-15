import { useState } from 'react'
import type { FileEntry } from '../types'

interface SidebarProps {
  onOpenFile: (path: string) => void
  recentFiles: FileEntry[]
  currentFile: string | null
  tocItems: TocItemData[]
  onTocClick?: (level: number, text: string) => void
}

export interface TocItemData {
  level: number
  text: string
}

export function Sidebar({ onOpenFile, recentFiles, currentFile, tocItems, onTocClick }: SidebarProps) {
  const [filesCollapsed, setFilesCollapsed] = useState(false)
  const [tocCollapsed, setTocCollapsed] = useState(false)

  return (
    <aside className="sidebar">
      {/* 文件区块 */}
      <div
        className={`sidebar-section ${filesCollapsed ? 'collapsed' : ''}`}
        data-section="files"
        onClick={() => setFilesCollapsed(!filesCollapsed)}
      >
        <span className="sidebar-section-header">
          <span className="sidebar-section-chevron">
            <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
          文件
        </span>
      </div>
      <div className="sidebar-content file-tree">
        {recentFiles.length === 0 ? (
          <div className="toc-empty">暂无打开的文件</div>
        ) : (
          recentFiles.map((file) => (
            <div
              key={file.path}
              className={`file-item ${currentFile === file.path ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onOpenFile(file.path)
              }}
            >
              <span className="file-icon">{file.isDir ? '📁' : '📄'}</span>
              <span className="file-name">{file.name}</span>
              {currentFile === file.path && <span className="file-status active"></span>}
            </div>
          ))
        )}
      </div>

      {/* 大纲区块 */}
      <div
        className={`sidebar-section ${tocCollapsed ? 'collapsed' : ''}`}
        data-section="toc"
        onClick={() => setTocCollapsed(!tocCollapsed)}
      >
        <span className="sidebar-section-header">
          <span className="sidebar-section-chevron">
            <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
          大纲
        </span>
      </div>
      <div className="sidebar-content">
        {tocItems.length === 0 ? (
          <div className="toc-empty">在文档中编写标题以生成大纲</div>
        ) : (
          <div className="toc-list">
            {tocItems.map((item, idx) => (
              <div
                key={idx}
                className={`toc-item h${item.level}`}
                onClick={() => onTocClick?.(item.level, item.text)}
              >
                {item.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
