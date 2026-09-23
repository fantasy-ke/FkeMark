import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileEntry, FileTreeNode, FolderHistoryEntry } from '../types'
import type { TocItemData } from '../utils/markdown/outline'
import { useI18n } from '../i18n'
import { clampPopupPosition } from '../utils/popupPosition'
import { isExcalidrawFilePath } from '../utils/markdown/excalidraw'
import { requestInsertExcalidraw } from './editor/excalidrawSession'
import { SidebarSearchPanel } from './SidebarSearchPanel'
import { BacklinksPanel } from './BacklinksPanel'
import { ActivityRail } from './sidebar/ActivityRail'
import { FileTreeView, type TreeContextTarget } from './sidebar/FileTreeView'
import { collectFolderPaths } from './sidebar/fileTreeModel'
import { SIDEBAR_RAIL_WIDTH, folderTitle, loadSidebarView, type SidebarSortMode, type SidebarView } from './sidebar/layout'
import type { SearchMatchResult } from './CommandPalette'

interface CachedMarkdownFile {
  path?: string
  content: string
}

interface SidebarProps {
  onOpenFile: (path: string) => void
  recentFiles: FileEntry[]
  currentFile: string | null
  tocItems: TocItemData[]
  onTocClick?: (level: TocItemData['level'], text: string, index: number) => void
  fileTree?: FileTreeNode[]
  width?: number
  folderHistory?: FolderHistoryEntry[]
  onReopenFolder?: (path: string) => void
  onRemoveFolderHistory?: (path: string) => void
  onOpenFolder?: () => void
  onCopyPath?: (path: string, type: FileTreeNode['type']) => void
  onDeleteFile?: (path: string, type: FileTreeNode['type']) => void
  onDuplicatePath?: (path: string, type: FileTreeNode['type']) => void
  onOpenLocation?: (path: string, type: FileTreeNode['type']) => void
  onRenamePath?: (path: string, type: FileTreeNode['type']) => void
  onCreateMarkdown?: (path: string, type: FileTreeNode['type']) => void
  onCreateExcalidraw?: (path: string, type: FileTreeNode['type']) => void
  onOpenRecycleBin?: () => void
  onOpenGraph?: () => void
  /** 当前打开的文件夹，用于标题和全文搜索 */
  folderPath?: string | null
  /** 已打开标签的最新内容，反向链接优先读这里 */
  cachedFiles?: ReadonlyMap<string, CachedMarkdownFile>
  /** 点击搜索结果：打开文件并跳到对应行 */
  onSearchResultOpen?: (match: SearchMatchResult) => void
}

export type { TocItemData } from '../utils/markdown/outline'

interface SidebarContextMenu {
  x: number
  y: number
  target: TreeContextTarget
}

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch { return fallback }
}

function savePersisted(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 存储不可用时忽略 */ }
}

const VIEWS: SidebarView[] = ['files', 'outline', 'backlinks', 'search']

function HeaderIcon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Sidebar({
  onOpenFile, recentFiles, currentFile, tocItems, onTocClick, fileTree, width, folderHistory,
  onReopenFolder, onRemoveFolderHistory, onOpenFolder, onCopyPath, onDeleteFile, onDuplicatePath,
  onOpenLocation, onRenamePath, onCreateMarkdown, onCreateExcalidraw, onOpenRecycleBin, onOpenGraph,
  folderPath, cachedFiles, onSearchResultOpen,
}: SidebarProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SidebarView>(() => loadSidebarView(loadPersisted('fkemark:sidebarTab', 'files')))
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(loadPersisted('fkemark:expandedFolders', ['__root__'])))
  const [sortMode, setSortMode] = useState<SidebarSortMode>(() => {
    const saved = loadPersisted<string>('fkemark:sidebarSort', 'source')
    return saved === 'name' || saved === 'name-desc' ? saved : 'source'
  })
  const [contextMenu, setContextMenu] = useState<SidebarContextMenu | null>(null)
  const folderOpen = Boolean(folderPath)

  useEffect(() => { savePersisted('fkemark:sidebarTab', activeTab) }, [activeTab])
  useEffect(() => { savePersisted('fkemark:expandedFolders', Array.from(expandedFolders)) }, [expandedFolders])
  useEffect(() => { savePersisted('fkemark:sidebarSort', sortMode) }, [sortMode])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  const openContextMenu = (event: React.MouseEvent, target: TreeContextTarget) => {
    event.preventDefault()
    event.stopPropagation()
    const position = clampPopupPosition(event.clientX, event.clientY, 208, 252, window.innerWidth, window.innerHeight)
    setContextMenu({ x: position.left, y: position.top, target })
  }

  const runContextAction = (action?: (path: string, type: TreeContextTarget['type']) => void) => {
    const target = contextMenu?.target
    setContextMenu(null)
    if (target) action?.(target.path, target.type)
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const collapsed = fileTree ? collectFolderPaths(fileTree).every((path) => !expandedFolders.has(path)) : true
  const cycleSort = () => {
    setSortMode((mode) => mode === 'source' ? 'name' : mode === 'name' ? 'name-desc' : 'source')
  }
  const sortLabel = sortMode === 'source'
    ? t('sidebar.header.sortName')
    : sortMode === 'name'
      ? t('sidebar.header.sortDesc')
      : t('sidebar.header.sortSource')

  return (
    <>
      <div className="sidebar-shell" style={width ? { width: `${width + SIDEBAR_RAIL_WIDTH}px` } : undefined}>
        <ActivityRail
          active={activeTab}
          onChange={setActiveTab}
          onOpenGraph={onOpenGraph}
          onOpenRecycleBin={onOpenRecycleBin}
          labels={{
            files: t('sidebar.tab.files'),
            outline: t('sidebar.tab.outline'),
            backlinks: t('sidebar.tab.backlinks'),
            search: t('sidebar.tab.search'),
            graph: t('graph.toggle'),
            recycle: t('trash.title'),
          }}
        />
        <aside className="sidebar" onContextMenu={(event) => event.preventDefault()}>
          <header className="sidebar-header">
            <div className="sidebar-header-text">
              <div className="sidebar-header-title" title={folderPath ?? undefined}>
                {folderTitle(folderPath, t('sidebar.header.noFolder'))}
              </div>
              {folderPath && <div className="sidebar-header-path" title={folderPath}>{folderPath}</div>}
            </div>
            <div className="sidebar-header-actions">
              {folderOpen && (
                <button type="button" className="sidebar-icon-btn" title={t('sidebar.header.newFile')} aria-label={t('sidebar.header.newFile')} onClick={() => onCreateMarkdown?.(folderPath!, 'folder')}>
                  <HeaderIcon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6" />
                </button>
              )}
              {folderOpen && (
                <button type="button" className="sidebar-icon-btn" title={t('sidebar.header.newSketch')} aria-label={t('sidebar.header.newSketch')} onClick={() => onCreateExcalidraw?.(folderPath!, 'folder')}>
                  <HeaderIcon d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586" />
                </button>
              )}
              <button
                type="button"
                className="sidebar-icon-btn"
                title={collapsed ? t('sidebar.header.expandAll') : t('sidebar.header.collapseAll')}
                aria-label={collapsed ? t('sidebar.header.expandAll') : t('sidebar.header.collapseAll')}
                onClick={() => setExpandedFolders(collapsed && fileTree ? new Set(collectFolderPaths(fileTree)) : new Set())}
              >
                <HeaderIcon d={collapsed ? 'M7 8l5 5 5-5M7 13l5 5 5-5' : 'M7 16l5-5 5 5M7 11l5-5 5 5'} />
              </button>
              <button type="button" className="sidebar-icon-btn" title={sortLabel} aria-label={sortLabel} onClick={cycleSort}>
                <HeaderIcon d="M3 6h18M6 12h12M10 18h4" />
              </button>
            </div>
          </header>

          <div className="sidebar-tabs" role="tablist">
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={activeTab === view}
                className={`sidebar-tab ${activeTab === view ? 'active' : ''}`}
                onClick={() => setActiveTab(view)}
              >
                {t(`sidebar.tab.${view}`)}
              </button>
            ))}
          </div>

          <div className="sidebar-tab-content">
            {activeTab === 'files' && (
              <FileTreeView
                fileTree={fileTree}
                currentFile={currentFile}
                recentFiles={recentFiles}
                folderHistory={folderHistory}
                expandedFolders={expandedFolders}
                sortMode={sortMode}
                onToggleFolder={toggleFolder}
                onOpenFile={onOpenFile}
                onContextMenu={openContextMenu}
                onReopenFolder={onReopenFolder}
                onRemoveFolderHistory={onRemoveFolderHistory}
                onOpenFolder={onOpenFolder}
              />
            )}
            {activeTab === 'outline' && (
              <div className="sidebar-content">
                {tocItems.length === 0 ? (
                  <div className="toc-empty">{t('sidebar.tocEmpty')}</div>
                ) : (
                  <div className="toc-list">
                    {tocItems.map((item, index) => (
                      <div
                        key={`${item.level}-${item.index}-${index}`}
                        className={`toc-item h${item.level}`}
                        onClick={() => onTocClick?.(item.level, item.text, item.index)}
                        title={t('sidebar.jumpTo', { text: item.text })}
                      >
                        {item.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'backlinks' && (
              <BacklinksPanel
                variant="embedded"
                currentFile={currentFile}
                fileTree={fileTree ?? []}
                cachedFiles={cachedFiles}
                onOpenFile={onOpenFile}
              />
            )}
            {activeTab === 'search' && (
              <SidebarSearchPanel
                dedicated
                folderPath={folderPath ?? null}
                onOpenResult={onSearchResultOpen ?? (() => {})}
              />
            )}
          </div>
        </aside>
      </div>

      {contextMenu && createPortal(
        <div
          className="sidebar-context-menu"
          role="menu"
          aria-label={contextMenu.target.name}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextMenu.target.type === 'folder' && (
            <>
              <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => {
                const target = contextMenu.target
                setContextMenu(null)
                setExpandedFolders((prev) => new Set(prev).add(target.path))
                onCreateMarkdown?.(target.path, target.type)
              }}>
                {t('sidebar.context.newMarkdown')}
              </button>
              <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => {
                const target = contextMenu.target
                setContextMenu(null)
                setExpandedFolders((prev) => new Set(prev).add(target.path))
                onCreateExcalidraw?.(target.path, target.type)
              }}>
                {t('sidebar.context.newExcalidraw')}
              </button>
              <div className="sidebar-ctx-divider" />
            </>
          )}
          {contextMenu.target.type === 'file' && isExcalidrawFilePath(contextMenu.target.path) && (
            <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => {
              const target = contextMenu.target
              setContextMenu(null)
              requestInsertExcalidraw(target.path)
            }}>
              {t('sidebar.context.insertExcalidraw')}
            </button>
          )}
          <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => runContextAction(onRenamePath)}>
            {t('sidebar.context.rename')}
          </button>
          <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => runContextAction(onDuplicatePath)}>
            {t('sidebar.context.duplicate')}
          </button>
          <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => runContextAction(onCopyPath)}>
            {t('sidebar.context.copyPath')}
          </button>
          <button type="button" className="sidebar-ctx-item" role="menuitem" onClick={() => runContextAction(onOpenLocation)}>
            {t('sidebar.context.openLocation')}
          </button>
          <div className="sidebar-ctx-divider" />
          <button type="button" className="sidebar-ctx-item danger" role="menuitem" onClick={() => runContextAction(onDeleteFile)}>
            {t('sidebar.context.delete')}
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
