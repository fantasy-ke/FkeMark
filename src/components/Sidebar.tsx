import { useState, useEffect } from 'react'
import type { FileEntry, FileTreeNode, FolderHistoryEntry } from '../types'
import { useI18n } from '../i18n'

interface SidebarProps {
  onOpenFile: (path: string) => void
  recentFiles: FileEntry[]
  currentFile: string | null
  tocItems: TocItemData[]
  onTocClick?: (level: number, text: string) => void
  fileTree?: FileTreeNode[]
  width?: number
  folderHistory?: FolderHistoryEntry[]
  onReopenFolder?: (path: string) => void
  onRemoveFolderHistory?: (path: string) => void
  onOpenFolder?: () => void
  onDeleteFile?: (path: string) => void
  onOpenRecycleBin?: () => void
}

export interface TocItemData {
  level: number
  text: string
}

type SidebarTab = 'files' | 'outline'

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
function savePersisted(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

// ── 文件树 SVG 图标 ──
function TreeChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}
function FolderOpenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5V7a2 2 0 0 1 2-2h4.2l2 2H18a2.5 2.5 0 0 1 2.5 2.5" />
      <path d="M3.8 9.5h16.8l-1.8 7.4a2 2 0 0 1-2 1.6H5.3a2 2 0 0 1-2-1.6z" />
    </svg>
  )
}
function FolderClosedIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 7a2 2 0 0 1 2-2h4.2l2 2H18.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 10h17" opacity="0.55" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  )
}

export function Sidebar({ onOpenFile, recentFiles, currentFile, tocItems, onTocClick, fileTree, width, folderHistory, onReopenFolder, onRemoveFolderHistory, onOpenFolder, onDeleteFile: _onDeleteFile, onOpenRecycleBin }: SidebarProps) {
  const { t } = useI18n()
  // 标签页：'files' | 'outline'，持久化记忆
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => loadPersisted('fkemark:sidebarTab', 'files'))
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(loadPersisted('fkemark:expandedFolders', ['__root__'])))

  useEffect(() => { savePersisted('fkemark:sidebarTab', activeTab) }, [activeTab])
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
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onClick={(e) => { e.stopPropagation(); toggleFolder(node.path) }}
            >
              <span className={`tree-toggle ${isExpanded ? 'expanded' : ''}`}>
                <TreeChevronIcon />
              </span>
              <span className="file-icon folder-icon">
                {isExpanded ? <FolderOpenIcon /> : <FolderClosedIcon />}
              </span>
              <span className="file-name">{node.name}</span>
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
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={(e) => { e.stopPropagation(); onOpenFile(node.path) }}
        >
          <span className="tree-toggle tree-toggle-spacer" />
          <span className="file-icon file-doc-icon"><FileIcon /></span>
          <span className="file-name">{node.name}</span>
          {currentFile === node.path && <span className="file-status active"></span>}
        </div>
      )
    })
  }

  const hasFileTree = fileTree && fileTree.length > 0
  const hasFolderHistory = folderHistory && folderHistory.length > 0

  // 格式化历史时间
  function formatHistoryTime(ts: number): string {
    const now = Date.now()
    const diff = now - ts
    const min = Math.floor(diff / 60000)
    const hour = Math.floor(diff / 3600000)
    const day = Math.floor(diff / 86400000)
    if (min < 1) return t('sidebar.time.now')
    if (min < 60) return t('sidebar.time.minutes', { n: min })
    if (hour < 24) return t('sidebar.time.hours', { n: hour })
    if (day < 7) return t('sidebar.time.days', { n: day })
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <>
    <aside className="sidebar" style={{ width: width ? `${width}px` : undefined }} onContextMenu={(e) => e.preventDefault()}>
      {/* 标签页头 */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          {hasFileTree ? t('sidebar.tab.tree') : t('sidebar.tab.files')}
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'outline' ? 'active' : ''}`}
          onClick={() => setActiveTab('outline')}
        >
          {t('sidebar.tab.outline')}
        </button>
      </div>

      {/* 标签页内容 */}
      <div className="sidebar-tab-content">
        {activeTab === 'files' ? (
          <div className="sidebar-content file-tree">
            {hasFileTree ? (
              <>
                {renderTreeNodes(fileTree!, 0)}
                {/* 文件夹历史区 */}
                {hasFolderHistory && (
                  <>
                    <div className="sidebar-section" style={{ marginTop: 12, marginBottom: 4 }}>
                      {t('sidebar.recent')}
                    </div>
                    {folderHistory!.map((entry) => (
                      <div
                        key={entry.path}
                        className="file-item folder-item"
                        title={entry.path}
                        onClick={(e) => { e.stopPropagation(); onReopenFolder?.(entry.path) }}
                      >
                        <span className="tree-toggle tree-toggle-spacer" />
                        <span className="file-icon folder-icon">
                          <FolderClosedIcon />
                        </span>
                        <span className="file-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0, marginRight: 4 }}>
                          {formatHistoryTime(entry.openedAt)}
                        </span>
                        <button
                          className="history-remove-btn"
                          title={t('sidebar.remove')}
                          onClick={(e) => { e.stopPropagation(); onRemoveFolderHistory?.(entry.path) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, opacity: 0.5, fontSize: 12, lineHeight: 1 }}
                        >×</button>
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : hasFolderHistory ? (
              <>
                {/* 无文件树但有历史：显示历史 + 打开按钮 */}
                <div className="sidebar-section" style={{ marginBottom: 4 }}>{t('sidebar.recentFolders')}</div>
                {folderHistory!.map((entry) => (
                  <div
                    key={entry.path}
                    className="file-item folder-item"
                    title={entry.path}
                    onClick={(e) => { e.stopPropagation(); onReopenFolder?.(entry.path) }}
                  >
                    <span className="tree-toggle tree-toggle-spacer" />
                    <span className="file-icon folder-icon">
                      <FolderClosedIcon />
                    </span>
                    <span className="file-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0, marginRight: 4 }}>
                      {formatHistoryTime(entry.openedAt)}
                    </span>
                    <button
                      title={t('common.remove')}
                      onClick={(e) => { e.stopPropagation(); onRemoveFolderHistory?.(entry.path) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, opacity: 0.5, fontSize: 12, lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
                <div className="toc-empty" style={{ marginTop: 16 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenFolder?.() }}
                    style={{
                      padding: '6px 14px', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-btn)', background: 'var(--surface)',
                      color: 'var(--fg)', fontSize: 12, cursor: 'pointer',
                    }}
                  >{t('sidebar.openOther')}</button>
                </div>
              </>
            ) : recentFiles.length === 0 ? (
              <div className="toc-empty">{t('sidebar.empty')}<br/>{t('sidebar.emptyHint')}</div>
            ) : (
              recentFiles.map((file) => (
                <div
                  key={file.path}
                  className={`file-item ${currentFile === file.path ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onOpenFile(file.path) }}
                >
                  <span className="tree-toggle tree-toggle-spacer" />
                  <span className={`file-icon ${file.isDir ? 'folder-icon' : 'file-doc-icon'}`}>
                    {file.isDir ? <FolderClosedIcon /> : <FileIcon />}
                  </span>
                  <span className="file-name">{file.name}</span>
                  {currentFile === file.path && <span className="file-status active"></span>}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="sidebar-content">
            {tocItems.length === 0 ? (
              <div className="toc-empty">{t('sidebar.tocEmpty')}</div>
            ) : (
              <div className="toc-list">
                {tocItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`toc-item h${item.level}`}
                    onClick={() => onTocClick?.(item.level, item.text)}
                    title={t('sidebar.jumpTo', { text: item.text })}
                  >
                    {item.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部：回收站按钮 */}
      {onOpenRecycleBin && (
        <div className="sidebar-footer">
          <button className="sidebar-recycle-btn" onClick={onOpenRecycleBin} title={t('trash.title')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>{t('trash.title')}</span>
          </button>
        </div>
      )}
    </aside>
    </>)
}
