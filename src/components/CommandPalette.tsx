import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'
import { useI18n } from '../i18n'
import type { FileTreeNode } from '../types'

// ── 类型定义 ──
export type PaletteTab = 'files' | 'commands' | 'search'

export interface PaletteCommand {
  id: string
  title: string
  description?: string
  icon?: string
  shortcut?: string
  action: () => void
}

export interface SearchMatchResult {
  filePath: string
  fileName: string
  lineNumber: number
  column: number
  lineText: string
  matchStart: number
  matchEnd: number
  isFileNameMatch: boolean
}

export interface SearchResultData {
  matches: SearchMatchResult[]
  totalFilesSearched: number
  totalMatches: number
}

interface CommandPaletteProps {
  visible: boolean
  onClose: () => void
  // 文件相关
  fileTree: FileTreeNode[]
  currentFile: string | null
  recentFiles: { name: string; path: string }[]
  onOpenFile: (path: string) => void
  // 文件夹路径（用于全文搜索）
  folderPath: string | null
  // 命令列表
  commands: PaletteCommand[]
  // 搜索结果跳转
  onSearchResultClick?: (match: SearchMatchResult) => void
}

/** 递归提取文件树中所有文件 */
function flattenFileTree(nodes: FileTreeNode[]): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = []
  function walk(node: FileTreeNode) {
    if (node.type === 'file') {
      result.push({ name: node.name, path: node.path })
    }
    if (node.children) {
      node.children.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return result
}

/** 模糊匹配：query 可以分散在 target 中 */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return true
  // 模糊匹配：每个字符按顺序出现
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

/** 高亮匹配文本 */
function highlightMatch(text: string, query: string): { text: string; isMatch: boolean }[] {
  if (!query) return [{ text, isMatch: false }]
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const parts: { text: string; isMatch: boolean }[] = []
  let lastEnd = 0
  let idx = t.indexOf(q)
  while (idx >= 0) {
    if (idx > lastEnd) {
      parts.push({ text: text.slice(lastEnd, idx), isMatch: false })
    }
    parts.push({ text: text.slice(idx, idx + q.length), isMatch: true })
    lastEnd = idx + q.length
    idx = t.indexOf(q, lastEnd)
  }
  if (lastEnd < text.length) {
    parts.push({ text: text.slice(lastEnd), isMatch: false })
  }
  return parts.length > 0 ? parts : [{ text, isMatch: false }]
}

export function CommandPalette({
  visible,
  onClose,
  fileTree,
  currentFile,
  recentFiles,
  onOpenFile,
  folderPath,
  commands,
  onSearchResultClick,
}: CommandPaletteProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<PaletteTab>('files')
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<SearchResultData | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchUseRegex, setSearchUseRegex] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 所有文件列表 ──
  const allFiles = useMemo(() => flattenFileTree(fileTree), [fileTree])

  // ── 文件过滤结果 ──
  const filteredFiles = useMemo(() => {
    if (!query.trim()) {
      // 无查询时：先显示最近文件，再显示全部文件
      const recent = recentFiles.slice(0, 5)
      const recentPaths = new Set(recent.map((f) => f.path))
      const rest = allFiles.filter((f) => !recentPaths.has(f.path))
      return [...recent, ...rest].slice(0, 50)
    }
    return allFiles
      .filter((f) => fuzzyMatch(query, f.name) || fuzzyMatch(query, f.path))
      .slice(0, 50)
  }, [query, allFiles, recentFiles])

  // ── 命令过滤结果 ──
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 30)
    return commands
      .filter((c) => fuzzyMatch(query, c.title) || (c.description && fuzzyMatch(query, c.description)))
      .slice(0, 30)
  }, [query, commands])

  // ── 搜索结果分组 ──
  const groupedSearchResults = useMemo(() => {
    if (!searchResults) return []
    // 按文件分组
    const groups = new Map<string, { fileName: string; filePath: string; matches: SearchMatchResult[] }>()
    for (const m of searchResults.matches) {
      if (!groups.has(m.filePath)) {
        groups.set(m.filePath, { fileName: m.fileName, filePath: m.filePath, matches: [] })
      }
      groups.get(m.filePath)!.matches.push(m)
    }
    return Array.from(groups.values())
  }, [searchResults])

  // ── 当前列表项总数 ──
  const totalItems = useMemo(() => {
    if (activeTab === 'files') return filteredFiles.length
    if (activeTab === 'commands') return filteredCommands.length
    if (activeTab === 'search') return searchResults?.matches.length ?? 0
    return 0
  }, [activeTab, filteredFiles.length, filteredCommands.length, searchResults])

  // ── 可见时聚焦输入框 ──
  useEffect(() => {
    if (visible) {
      setQuery('')
      setSelectedIndex(0)
      setSearchResults(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  // ── 切换 Tab 时重置 ──
  useEffect(() => {
    setQuery('')
    setSelectedIndex(0)
    setSearchResults(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [activeTab])

  // ── 全文搜索（防抖）──
  const performSearch = useCallback(async (q: string) => {
    if (activeTab !== 'search') return
    if (!q.trim() || !folderPath || !isTauri()) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    try {
      const result = await invoke<SearchResultData>('search_in_files', {
        dirPath: folderPath,
        query: q,
        caseSensitive: searchCaseSensitive,
        useRegex: searchUseRegex,
        wholeWord: false,
      })
      setSearchResults(result)
      setSelectedIndex(0)
    } catch (e) {
      console.error('Search failed:', e)
      setSearchResults(null)
    } finally {
      setSearching(false)
    }
  }, [activeTab, folderPath, searchCaseSensitive, searchUseRegex])

  // ── 输入变化时触发搜索 ──
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    if (activeTab === 'search' && query.trim()) {
      searchTimerRef.current = setTimeout(() => {
        performSearch(query)
      }, 300)
    } else if (activeTab === 'search') {
      setSearchResults(null)
    }
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [query, activeTab, performSearch])

  // ── 选择索引变化时滚动到可见 ──
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  // ── 查询变化时重置选中 ──
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // ── 键盘导航 ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(selectedIndex)
      return
    }
    // Tab 切换
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      const tabs: PaletteTab[] = ['files', 'commands', 'search']
      const idx = tabs.indexOf(activeTab)
      setActiveTab(tabs[(idx + 1) % tabs.length])
      return
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      const tabs: PaletteTab[] = ['files', 'commands', 'search']
      const idx = tabs.indexOf(activeTab)
      setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length])
      return
    }
  }

  // ── 选择某项 ──
  function handleSelect(index: number) {
    if (activeTab === 'files' && filteredFiles[index]) {
      onOpenFile(filteredFiles[index].path)
      onClose()
    } else if (activeTab === 'commands' && filteredCommands[index]) {
      filteredCommands[index].action()
      onClose()
    } else if (activeTab === 'search' && searchResults?.matches[index]) {
      const match = searchResults.matches[index]
      onSearchResultClick?.(match)
      onClose()
    }
  }

  if (!visible) return null

  return (
    <div className="cmd-palette-overlay" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={(e) => e.stopPropagation()}>
        {/* 输入区 */}
        <div className="cmd-palette-input-area">
          <svg className="cmd-palette-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder={
              activeTab === 'files' ? t('palette.placeholder.files') :
              activeTab === 'commands' ? t('palette.placeholder.commands') :
              t('palette.placeholder.search')
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          {searching && <span className="cmd-palette-spinner" />}
          {activeTab === 'search' && (
            <div className="cmd-palette-search-toggles">
              <button
                className={`cmd-toggle-btn ${searchCaseSensitive ? 'active' : ''}`}
                onClick={() => setSearchCaseSensitive(!searchCaseSensitive)}
                title={t('find.caseSensitive')}
              >Aa</button>
              <button
                className={`cmd-toggle-btn ${searchUseRegex ? 'active' : ''}`}
                onClick={() => setSearchUseRegex(!searchUseRegex)}
                title={t('find.regex')}
              >.*</button>
            </div>
          )}
        </div>

        {/* Tab 切换 */}
        <div className="cmd-palette-tabs">
          <button
            className={`cmd-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            {t('palette.tab.files')}
            <span className="cmd-tab-count">{allFiles.length}</span>
          </button>
          <button
            className={`cmd-tab ${activeTab === 'commands' ? 'active' : ''}`}
            onClick={() => setActiveTab('commands')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            {t('palette.tab.commands')}
            <span className="cmd-tab-count">{commands.length}</span>
          </button>
          <button
            className={`cmd-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            disabled={!folderPath}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            {t('palette.tab.search')}
          </button>
        </div>

        {/* 结果列表 */}
        <div className="cmd-palette-list" ref={listRef}>
          {/* 文件列表 */}
          {activeTab === 'files' && (
            filteredFiles.length === 0 ? (
              <div className="cmd-palette-empty">{t('palette.empty.files')}</div>
            ) : (
              filteredFiles.map((file, idx) => {
                const parts = highlightMatch(file.name, query)
                const isCurrent = file.path === currentFile
                const isRecent = idx < recentFiles.length && !query.trim()
                return (
                  <div
                    key={file.path}
                    data-idx={idx}
                    className={`cmd-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelect(idx)}
                  >
                    <svg className="cmd-item-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <div className="cmd-item-content">
                      <div className="cmd-item-title">
                        {parts.map((p, i) => (
                          <span key={i} className={p.isMatch ? 'highlight' : ''}>{p.text}</span>
                        ))}
                        {isCurrent && <span className="cmd-item-badge">{t('palette.current')}</span>}
                      </div>
                      <div className="cmd-item-sub">{file.path}</div>
                    </div>
                    {isRecent && !query.trim() && <span className="cmd-item-tag">{t('palette.recent')}</span>}
                  </div>
                )
              })
            )
          )}

          {/* 命令列表 */}
          {activeTab === 'commands' && (
            filteredCommands.length === 0 ? (
              <div className="cmd-palette-empty">{t('palette.empty.commands')}</div>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const parts = highlightMatch(cmd.title, query)
                return (
                  <div
                    key={cmd.id}
                    data-idx={idx}
                    className={`cmd-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelect(idx)}
                  >
                    <svg className="cmd-item-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                    </svg>
                    <div className="cmd-item-content">
                      <div className="cmd-item-title">
                        {parts.map((p, i) => (
                          <span key={i} className={p.isMatch ? 'highlight' : ''}>{p.text}</span>
                        ))}
                      </div>
                      {cmd.description && <div className="cmd-item-sub">{cmd.description}</div>}
                    </div>
                    {cmd.shortcut && <span className="cmd-item-shortcut">{cmd.shortcut}</span>}
                  </div>
                )
              })
            )
          )}

          {/* 搜索结果 */}
          {activeTab === 'search' && (
            !query.trim() ? (
              <div className="cmd-palette-empty">{t('palette.searchHint')}</div>
            ) : searching ? (
              <div className="cmd-palette-empty">{t('palette.searching')}</div>
            ) : !searchResults || searchResults.matches.length === 0 ? (
              <div className="cmd-palette-empty">{t('palette.empty.search')}</div>
            ) : (
              <>
                <div className="cmd-palette-search-summary">
                  {t('palette.searchSummary', { matches: searchResults.totalMatches, files: groupedSearchResults.length })}
                </div>
                {groupedSearchResults.map((group) =>
                  group.matches.map((match, matchIdx) => {
                    const flatIdx = searchResults.matches.indexOf(match)
                    // 高亮 lineText 中的匹配部分
                    const before = match.lineText.slice(0, match.matchStart)
                    const matched = match.lineText.slice(match.matchStart, match.matchEnd)
                    const after = match.lineText.slice(match.matchEnd)
                    // 截断过长的行
                    const maxLen = 80
                    let displayBefore = before
                    let displayAfter = after
                    if (before.length > maxLen / 2) {
                      displayBefore = '…' + before.slice(-maxLen / 2)
                    }
                    if (after.length > maxLen / 2) {
                      displayAfter = after.slice(0, maxLen / 2) + '…'
                    }
                    return (
                      <div
                        key={`${group.filePath}-${matchIdx}`}
                        data-idx={flatIdx}
                        className={`cmd-palette-item ${flatIdx === selectedIndex ? 'selected' : ''} ${match.isFileNameMatch ? 'file-name-match' : ''}`}
                        onMouseEnter={() => setSelectedIndex(flatIdx)}
                        onClick={() => handleSelect(flatIdx)}
                      >
                        <svg className="cmd-item-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          {match.isFileNameMatch ? (
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          ) : (
                            <>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </>
                          )}
                        </svg>
                        <div className="cmd-item-content">
                          <div className="cmd-item-title">
                            {match.isFileNameMatch ? (
                              <span className="highlight">{group.fileName}</span>
                            ) : (
                              <>
                                {displayBefore}
                                <span className="highlight">{matched}</span>
                                {displayAfter}
                              </>
                            )}
                          </div>
                          <div className="cmd-item-sub">
                            {group.fileName}
                            {!match.isFileNameMatch && ` : ${match.lineNumber}`}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </>
            )
          )}
        </div>

        {/* 底部提示 */}
        <div className="cmd-palette-footer">
          <span className="cmd-footer-hint">
            <kbd>↑↓</kbd> {t('palette.navigate')}
          </span>
          <span className="cmd-footer-hint">
            <kbd>Enter</kbd> {t('palette.select')}
          </span>
          <span className="cmd-footer-hint">
            <kbd>Tab</kbd> {t('palette.switchTab')}
          </span>
          <span className="cmd-footer-hint">
            <kbd>Esc</kbd> {t('palette.close')}
          </span>
        </div>
      </div>
    </div>
  )
}
