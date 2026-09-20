import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'
import { useI18n } from '../i18n'
import type { SearchMatchResult, SearchResultData } from './CommandPalette'

interface SidebarSearchPanelProps {
  /** 当前打开的文件夹；为空时不可搜索 */
  folderPath: string | null
  /** 点击某条结果：打开对应文件并跳转到该行 */
  onOpenResult: (match: SearchMatchResult) => void
  /** 没有搜索词时展示的内容（文件树） */
  children: React.ReactNode
}

/** 输入防抖时长：避免每次按键都触发一次目录扫描 */
const SEARCH_DEBOUNCE_MS = 300
/** 命中行两侧各保留的最大字符数，过长时截断 */
const CONTEXT_CHARS = 60

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
 */
export function SidebarSearchPanel({ folderPath, onOpenResult, children }: SidebarSearchPanelProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultData | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
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

  // 按文件分组，便于阅读同一文件的命中
  const groups = useMemo(() => {
    if (!results) return []
    const map = new Map<string, { fileName: string; filePath: string; matches: SearchMatchResult[] }>()
    for (const match of results.matches) {
      const group = map.get(match.filePath)
      if (group) {
        group.matches.push(match)
      } else {
        map.set(match.filePath, {
          fileName: match.fileName,
          filePath: match.filePath,
          matches: [match],
        })
      }
    }
    return Array.from(map.values())
  }, [results])

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
        children
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
              <div className="sidebar-search-summary">
                {t('sidebar.search.summary', {
                  matches: results.totalMatches,
                  files: groups.length,
                })}
              </div>
              {groups.map((group) => (
                <div key={group.filePath} className="sidebar-search-group">
                  <div className="sidebar-search-file" title={group.filePath}>
                    {group.fileName}
                  </div>
                  {group.matches.map((match, index) => (
                    <div
                      key={`${group.filePath}-${index}`}
                      className="sidebar-search-hit"
                      title={`${group.filePath}${match.lineNumber ? `:${match.lineNumber}` : ''}`}
                      onClick={() => onOpenResult(match)}
                    >
                      {match.isFileNameMatch ? (
                        <span className="sidebar-search-text">
                          <span className="highlight">{group.fileName}</span>
                        </span>
                      ) : (
                        <>
                          <span className="sidebar-search-line">{match.lineNumber}</span>
                          <span className="sidebar-search-text">{renderHitLine(match)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  )
}
