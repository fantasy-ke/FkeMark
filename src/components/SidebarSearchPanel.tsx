import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, Folder, FolderTree, List } from 'lucide-react'
import { isTauri } from '../utils/tauri'
import { useI18n } from '../i18n'
import {
  buildSearchResultList,
  buildSearchResultTree,
  collectCollapsiblePaths,
  contentMatches,
  groupSearchMatches,
  hasFileNameMatch,
  type SearchTreeNode,
} from '../utils/searchResults'
import type { SearchMatchResult, SearchResultData } from './CommandPalette'

interface SidebarSearchPanelProps {
  /** 当前打开的文件夹；为空时不可搜索 */
  folderPath: string | null
  /** 点击某条结果：打开对应文件并跳转到该行 */
  onOpenResult: (match: SearchMatchResult) => void
  /** 没有搜索词时展示的内容（文件树）。独立搜索页不需要 */
  children?: React.ReactNode
  /** 作为侧栏「搜索」页签使用，空查询时显示引导而不是文件树 */
  dedicated?: boolean
}

/** 搜索结果的展示方式 */
type SearchViewMode = 'tree' | 'list'

/** 输入防抖时长：避免每次按键都触发一次目录扫描 */
const SEARCH_DEBOUNCE_MS = 300
/** 命中行两侧各保留的最大字符数，过长时截断 */
const CONTEXT_CHARS = 60
/** 每层缩进的像素数 */
const INDENT_STEP = 12

/** 高亮单行中的命中片段；后端返回的下标是 UTF-16 码元，可直接用于 JS 字符串切片 */
function renderHitLine(match: SearchMatchResult) {
  const { lineText } = match
  const start = Math.max(0, Math.min(match.matchStart, lineText.length))
  const end = Math.max(start, Math.min(match.matchEnd, lineText.length))
  let before = lineText.slice(0, start)
  let after = lineText.slice(end)
  if (before.length > CONTEXT_CHARS) before = `…${before.slice(-CONTEXT_CHARS)}`
  if (after.length > CONTEXT_CHARS) after = `${after.slice(0, CONTEXT_CHARS)}…`
  return (
    <>
      {before}
      <span className="highlight">{lineText.slice(start, end)}</span>
      {after}
    </>
  )
}

/**
 * 侧边栏文本搜索面板。
 *
 * 搜索词为空时原样展示文件树；输入后改为展示当前文件夹的全文搜索结果。
 * 结果由 Rust 侧的内容索引产出，这里只负责防抖、丢弃过期请求和渲染。
 * 结果支持树形与列表两种结构，文件与目录都可以折叠。
 */
export function SidebarSearchPanel({ folderPath, onOpenResult, children, dedicated = false }: SidebarSearchPanelProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultData | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const [viewMode, setViewMode] = useState<SearchViewMode>('tree')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const requestRef = useRef(0)

  const trimmedQuery = query.trim()
  const canSearch = Boolean(folderPath) && isTauri()

  useEffect(() => {
    // 每次输入都抬高请求号，晚到的旧响应会被丢弃。
    requestRef.current += 1
    const requestId = requestRef.current

    if (!trimmedQuery || !folderPath || !isTauri()) {
      setResults(null)
      setSearching(false)
      setFailed(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await invoke<SearchResultData>('search_in_files', {
            dirPath: folderPath,
            query: trimmedQuery,
            caseSensitive: false,
            useRegex: false,
            wholeWord: false,
          })
          if (requestId !== requestRef.current) return
          setResults(data)
          setFailed(false)
        } catch (error) {
          if (requestId !== requestRef.current) return
          console.error('侧边栏搜索失败:', error)
          setResults(null)
          setFailed(true)
        } finally {
          if (requestId === requestRef.current) setSearching(false)
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [trimmedQuery, folderPath])

  const groups = useMemo(() => groupSearchMatches(results?.matches ?? []), [results])
  // 两种结构共用同一套节点渲染，区别只在于是否保留目录层级
  const visibleNodes = useMemo(
    () => (viewMode === 'tree' ? buildSearchResultTree(groups, folderPath) : buildSearchResultList(groups)),
    [viewMode, groups, folderPath],
  )
  const collapsiblePaths = useMemo(() => collectCollapsiblePaths(visibleNodes), [visibleNodes])
  const allCollapsed = collapsiblePaths.length > 0
    && collapsiblePaths.every((path) => collapsed.has(path))

  function toggleCollapsed(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleCollapseAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(collapsiblePaths))
  }

  /** 打开某个文件节点：优先跳到第一条正文命中 */
  function openNode(node: SearchTreeNode) {
    const target = contentMatches(node)[0] ?? node.matches[0]
    if (target) onOpenResult(target)
  }

  function renderHit(match: SearchMatchResult, depth: number, key: string) {
    return (
      <div
        key={key}
        className="sidebar-search-hit"
        style={{ paddingLeft: 12 + depth * INDENT_STEP }}
        title={`${match.fileName}:${match.lineNumber}`}
        onClick={() => onOpenResult(match)}
      >
        <span className="sidebar-search-line">{match.lineNumber}</span>
        <span className="sidebar-search-text">{renderHitLine(match)}</span>
      </div>
    )
  }

  function renderNodes(nodes: SearchTreeNode[], depth: number): React.ReactNode[] {
    return nodes.map((node) => {
      const children = node.type === 'folder' ? node.children : contentMatches(node)
      const isCollapsed = collapsed.has(node.path)
      const isOpen = !isCollapsed
      return (
        <div key={node.path}>
          <div
            className={`sidebar-search-node ${node.type === 'folder' ? 'is-folder' : 'is-file'}`}
            style={{ paddingLeft: 12 + depth * INDENT_STEP }}
            title={node.path}
            onClick={node.type === 'folder' ? () => toggleCollapsed(node.path) : undefined}
          >
            <button
              type="button"
              className={`sidebar-search-chevron ${isCollapsed ? 'is-collapsed' : ''}`}
              aria-label={isCollapsed ? t('sidebar.search.expand') : t('sidebar.search.collapse')}
              onClick={(event) => {
                event.stopPropagation()
                if (children.length > 0) toggleCollapsed(node.path)
              }}
            >
              {children.length > 0 && <ChevronRight size={12} />}
            </button>
            <span className="sidebar-search-node-icon">
              {node.type === 'folder' ? <Folder size={13} /> : <FileText size={13} />}
            </span>
            <button
              type="button"
              className="sidebar-search-node-name"
              onClick={(event) => {
                event.stopPropagation()
                if (node.type === 'folder') toggleCollapsed(node.path)
                else openNode(node)
              }}
            >
              {hasFileNameMatch(node) ? <span className="highlight">{node.name}</span> : node.name}
            </button>
            {node.type === 'file' && (
              <span className="sidebar-search-count">{node.matches.length}</span>
            )}
          </div>
          {isOpen && children.length > 0 && (
            node.type === 'folder'
              ? renderNodes(node.children, depth + 1)
              : contentMatches(node).map((match, index) => (
                  renderHit(match, depth + 1, `${node.path}-${index}`)
                ))
          )}
        </div>
      )
    })
  }

  return (
    <>
      <div className="sidebar-search">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder={t('sidebar.search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.stopPropagation()
              setQuery('')
            }
          }}
          spellCheck={false}
          disabled={!canSearch}
        />
        {searching && <span className="sidebar-search-spinner" />}
        {!searching && query && (
          <button
            type="button"
            className="sidebar-search-clear"
            title={t('sidebar.search.clear')}
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </div>

      {!trimmedQuery ? (
        dedicated ? (
          <div className="sidebar-content">
            <div className="toc-empty">{folderPath ? t('sidebar.search.start') : t('sidebar.search.noFolder')}</div>
          </div>
        ) : children
      ) : (
        <div className="sidebar-content sidebar-search-results">
          {!canSearch ? (
            <div className="toc-empty">{t('sidebar.search.noFolder')}</div>
          ) : failed ? (
            <div className="toc-empty">{t('sidebar.search.failed')}</div>
          ) : searching && !results ? (
            <div className="toc-empty">{t('sidebar.search.searching')}</div>
          ) : !results || results.matches.length === 0 ? (
            <div className="toc-empty">{t('sidebar.search.empty')}</div>
          ) : (
            <>
              <div className="sidebar-search-toolbar">
                <button
                  type="button"
                  className={`sidebar-search-view ${viewMode === 'tree' ? 'active' : ''}`}
                  title={t('sidebar.search.viewTree')}
                  aria-label={t('sidebar.search.viewTree')}
                  onClick={() => setViewMode('tree')}
                >
                  <FolderTree size={14} />
                </button>
                <button
                  type="button"
                  className={`sidebar-search-view ${viewMode === 'list' ? 'active' : ''}`}
                  title={t('sidebar.search.viewList')}
                  aria-label={t('sidebar.search.viewList')}
                  onClick={() => setViewMode('list')}
                >
                  <List size={14} />
                </button>
                <span className="sidebar-search-toolbar-spacer" />
                <button
                  type="button"
                  className="sidebar-search-collapse-all"
                  title={allCollapsed ? t('sidebar.search.expandAll') : t('sidebar.search.collapseAll')}
                  aria-label={allCollapsed ? t('sidebar.search.expandAll') : t('sidebar.search.collapseAll')}
                  onClick={toggleCollapseAll}
                >
                  {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                </button>
              </div>
              <div className="sidebar-search-summary">
                {t('sidebar.search.summary', {
                  matches: results.totalMatches,
                  files: groups.length,
                })}
              </div>
              <div className="sidebar-search-tree">{renderNodes(visibleNodes, 0)}</div>
            </>
          )}
        </div>
      )}
    </>
  )
}
