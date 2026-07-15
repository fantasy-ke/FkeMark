import { useState, useEffect } from 'react'
import type { FileEntry, FileTreeNode } from '../types'

interface SidebarProps {
  onOpenFile: (path: string) => void
  recentFiles: FileEntry[]
  currentFile: string | null
  tocItems: TocItemData[]
  onTocClick?: (level: number, text: string) => void
  fileTree?: FileTreeNode[]
  width?: number
}

export interface TocItemData {
  level: number
  text: string
}

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
function savePersisted(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

export function Sidebar({ onOpenFile, recentFiles, currentFile, tocItems, onTocClick, fileTree, width }: SidebarProps) {
  const [filesCollapsed, setFilesCollapsed] = useState(() => loadPersisted('fkemark:filesCollapsed', false))
  const [tocCollapsed, setTocCollapsed] = useState(() => loadPersisted('fkemark:tocCollapsed', false))
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(loadPersisted('fkemark:expandedFolders', ['__root__'])))

  useEffect(() => { savePersisted('fkemark:filesCollapsed', filesCollapsed) }, [filesCollapsed])
  useEffect(() => { savePersisted('fkemark:tocCollapsed', tocCollapsed) }, [tocCollapsed])
  useEffect(() => { savePersisted('fkemark:expandedFolders', Array.from(expandedFolders)) }, [expandedFolders])

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // 递归渲染文件树
  function renderTreeNodes(nodes: FileTreeNode[], depth: number = 0): React.ReactNode {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path)
      if (node.type === 'folder') {
        return (
          <div key={node.path}>
            <div
              className="file-item folder-item"
              style={{ paddingLeft: `${16 + depth * 16}px` }}
              onClick={(e) => { e.stopPropagation(); toggleFolder(node.path) }}
            >
              <span className="file-icon" style={{ opacity: 0.7 }}>
                {isExpanded ? '📂' : '📁'}
              </span>
              <span className="file-name">{node.name}</span>
              <span className="chevron" style={{ fontSize: '10px', opacity: 0.5, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms' }}>▶</span>
            </div>
            {isExpanded && node.children && renderTreeNodes(node.children, depth + 1)}
          </div>
        )
      }
      // 只显示 .md/.markdown 文件
      const isMd = /\.(md|markdown|MD)$/i.test(node.name)
      if (!isMd) return null
      return (
        <div
          key={node.path}
          className={`file-item ${currentFile === node.path ? 'active' : ''}`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
          onClick={(e) => { e.stopPropagation(); onOpenFile(node.path) }}
        >
          <span className="file-icon" style={{ opacity: 0.6 }}>📄</span>
          <span className="file-name">{node.name}</span>
          {currentFile === node.path && <span className="file-status active"></span>}
        </div>
      )
    })
  }

  const hasFileTree = fileTree && fileTree.length > 0

  return (
    <aside className="sidebar" style={{ width: width ? `${width}px` : undefined }}>
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
          {hasFileTree ? '文件树' : '文件'}
        </span>
      </div>
      <div className="sidebar-content file-tree">
        {hasFileTree ? (
          renderTreeNodes(fileTree!, 0)
        ) : recentFiles.length === 0 ? (
          <div className="toc-empty">暂无打开的文件<br/>点击「打开文件夹」选择目录</div>
        ) : (
          recentFiles.map((file) => (
            <div
              key={file.path}
              className={`file-item ${currentFile === file.path ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onOpenFile(file.path) }}
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
                title={`跳转到: ${item.text}`}
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
