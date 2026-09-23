import type { FileEntry, FileTreeNode } from '../../types'
import type { SidebarSortMode } from './layout'
import { sortFileTree } from './fileTreeModel'
import { useI18n } from '../../i18n'
import { pathsEqual } from '../../utils/filePaths'
import { isExcalidrawFilePath } from '../../utils/markdown/excalidraw'
import { openExcalidrawFile } from '../editor/excalidrawSession'

export interface TreeContextTarget {
  path: string
  name: string
  type: FileTreeNode['type']
}

interface FileTreeViewProps {
  fileTree?: FileTreeNode[]
  currentFile: string | null
  recentFiles: FileEntry[]
  expandedFolders: Set<string>
  sortMode: SidebarSortMode
  onToggleFolder: (path: string) => void
  onOpenFile: (path: string) => void
  onContextMenu: (event: React.MouseEvent, target: TreeContextTarget) => void
}

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

export function FileTreeView({
  fileTree,
  currentFile,
  recentFiles,
  expandedFolders,
  sortMode,
  onToggleFolder,
  onOpenFile,
  onContextMenu,
}: FileTreeViewProps) {
  const { t } = useI18n()
  const hasFileTree = Boolean(fileTree && fileTree.length > 0)
  const visibleTree = sortFileTree(fileTree ?? [], sortMode)

  function renderTreeNodes(nodes: FileTreeNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const isExpanded = expandedFolders.has(node.path)
      if (node.type === 'folder') {
        return (
          <div key={node.path}>
            <div
              className="file-item folder-item"
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              title={node.path}
              onClick={(event) => { event.stopPropagation(); onToggleFolder(node.path) }}
              onContextMenu={(event) => onContextMenu(event, { path: node.path, name: node.name, type: 'folder' })}
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
      const isSketch = isExcalidrawFilePath(node.name)
      const isMarkdown = /\.(md|markdown|MD)$/i.test(node.name)
      if (!isMarkdown && !isSketch) return null
      return (
        <div
          key={node.path}
          className={`file-item ${currentFile && pathsEqual(currentFile, node.path) ? 'active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          title={node.path}
          onClick={(event) => {
            event.stopPropagation()
            if (isSketch) void openExcalidrawFile(node.path)
            else onOpenFile(node.path)
          }}
          onContextMenu={(event) => onContextMenu(event, { path: node.path, name: node.name, type: 'file' })}
        >
          <span className="tree-toggle tree-toggle-spacer" />
          <span className="file-icon file-doc-icon"><FileIcon /></span>
          <span className="file-name">{node.name}</span>
          {currentFile && pathsEqual(currentFile, node.path) && <span className="file-status active" />}
        </div>
      )
    })
  }

  return (
    <div className="sidebar-content file-tree">
      {hasFileTree ? (
        <>
          {renderTreeNodes(visibleTree)}
        </>
        ) : recentFiles.length === 0 ? (
          <div className="toc-empty">{t('sidebar.empty')}<br />{t('sidebar.emptyHint')}</div>
        ) : (
          recentFiles.map((file) => (
            <div
              key={file.path}
              className={`file-item ${currentFile && pathsEqual(currentFile, file.path) ? 'active' : ''}`}
              title={file.path}
              onClick={(event) => {
                event.stopPropagation()
                if (isExcalidrawFilePath(file.path)) void openExcalidrawFile(file.path)
                else onOpenFile(file.path)
              }}
              onContextMenu={(event) => onContextMenu(event, { path: file.path, name: file.name, type: file.isDir ? 'folder' : 'file' })}
            >
              <span className="tree-toggle tree-toggle-spacer" />
              <span className={`file-icon ${file.isDir ? 'folder-icon' : 'file-doc-icon'}`}>
                {file.isDir ? <FolderClosedIcon /> : <FileIcon />}
              </span>
              <span className="file-name">{file.name}</span>
              {currentFile && pathsEqual(currentFile, file.path) && <span className="file-status active" />}
            </div>
          ))
        )}
    </div>
  )
}
