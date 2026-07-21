import { useState, useRef, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { useI18n } from '../i18n'

// ── ProseMirror 搜索插件 ──
const searchPluginKey = new PluginKey<DecorationSet>('fkeMarkSearch')

/** 在纯文本中查找正则匹配，返回 { index, length } 数组 */
function findMatchesInText(text: string, regex: RegExp): { index: number; length: number }[] {
  const matches: { index: number; length: number }[] = []
  regex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length })
    if (m[0].length === 0) regex.lastIndex++
  }
  return matches
}

/** 计算 textarea 中从行首到指定 charIndex 的总行数（用于估算 scrollTop） */
function countLinesToIndex(text: string, charIndex: number): number {
  let lines = 0
  for (let i = 0; i < Math.min(charIndex, text.length); i++) {
    if (text[i] === '\n') lines++
  }
  return lines
}

function buildRegex(query: string, opts: { caseSensitive: boolean; useRegex: boolean; wholeWord: boolean }): RegExp | null {
  if (!query) return null
  try {
    let pattern: string
    if (opts.useRegex) {
      pattern = query
    } else if (opts.wholeWord) {
      pattern = `\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
    } else {
      pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    const flags = opts.caseSensitive ? 'g' : 'gi'
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

/** 将文档文本偏移映射回 ProseMirror 位置 */
function findMatchesInDoc(state: EditorState, regex: RegExp): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = []
  const doc = state.doc

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    const text = node.text
    let m: RegExpExecArray | null
    // 重置 regex lastIndex（全局标志 g 会保留状态）
    regex.lastIndex = 0
    while ((m = regex.exec(text)) !== null) {
      const from = pos + m.index
      const to = from + m[0].length
      matches.push({ from, to })
      if (m[0].length === 0) {
        regex.lastIndex++
      }
    }
    return true
  })

  return matches
}

function createSearchPlugin() {
  return new Plugin<DecorationSet>({
    key: searchPluginKey,
    state: {
      init() {
        return DecorationSet.empty
      },
      apply(tr, oldState) {
        // 如果有 meta 更新，重新计算
        const meta = tr.getMeta(searchPluginKey)
        if (meta) {
          return meta.decorations
        }
        // 文档变更时，映射旧装饰
        if (tr.docChanged) {
          return oldState.map(tr.mapping, tr.doc)
        }
        return oldState
      },
    },
    props: {
      decorations(state) {
        return searchPluginKey.getState(state) || DecorationSet.empty
      },
    },
  })
}

interface FindReplaceBarProps {
  editor: Editor | null
  visible: boolean
  mode: 'find' | 'replace'
  onClose: () => void
  onModeChange: (mode: 'find' | 'replace') => void
  /** 强制使用纯文本搜索模式（源码/分栏视图） */
  forceTextMode?: boolean
  /** 纯文本搜索模式下的内容源（源码 Markdown） */
  content?: string
  /** 纯文本搜索模式下的替换回调 */
  onContentChange?: (newContent: string) => void
}

export function FindReplaceBar({ editor, visible, mode, onClose, onModeChange, forceTextMode, content, onContentChange }: FindReplaceBarProps) {
  const { t } = useI18n()
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [searchInSelection, setSearchInSelection] = useState(false)
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null)

  const findInputRef = useRef<HTMLInputElement>(null)
  const pluginRegistered = useRef(false)

  // ── 文本模式（源码/分栏视图）状态 ──
  const textMatchesRef = useRef<{ index: number; length: number }[]>([])
  const isTextMode = forceTextMode || false

  // ── 注册搜索插件 ──
  useEffect(() => {
    if (!editor || pluginRegistered.current) return
    const { state } = editor
    // 检查是否已注册
    if (searchPluginKey.getState(state)) {
      pluginRegistered.current = true
      return
    }
    // 通过 registerPlugin 注册
    editor.registerPlugin(createSearchPlugin())
    pluginRegistered.current = true
  }, [editor])

  // ── 文本模式：在 textarea 中选中匹配文本并滚动到可见位置 ──
  // 注意：不调用 ta.focus()，避免每次搜索/导航都从检索框抢走焦点
  const selectTextMatch = useCallback((index: number) => {
    const ta = document.querySelector('.editor-pane .source-textarea') as HTMLTextAreaElement | null
    if (!ta) return
    const matches = textMatchesRef.current
    if (index < 0 || index >= matches.length) return
    const m = matches[index]
    ta.setSelectionRange(m.index, m.index + m.length)
    // 滚动到可见位置
    const lineHeight = 20
    const lineNum = countLinesToIndex(ta.value, m.index)
    const targetScroll = lineNum * lineHeight - ta.clientHeight / 3
    ta.scrollTop = Math.max(0, targetScroll)
    setCurrentIndex(index)
  }, [])

  // ── 执行搜索 ──
  const doSearch = useCallback(() => {
    // 文本模式分支
    if (isTextMode) {
      const src = content ?? ''
      const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
      if (!regex || !findText) {
        textMatchesRef.current = []
        setMatchCount(0)
        setCurrentIndex(-1)
        return
      }
      const matches = findMatchesInText(src, regex)
      textMatchesRef.current = matches
      setMatchCount(matches.length)
      if (matches.length > 0) {
        selectTextMatch(0)
      } else {
        setCurrentIndex(-1)
      }
      return
    }

    // ProseMirror 分支
    if (!editor) return
    const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
    if (!regex) {
      setMatchCount(0)
      setCurrentIndex(-1)
      // 清除装饰
      const tr = editor.state.tr.setMeta(searchPluginKey, { decorations: DecorationSet.empty })
      editor.view.dispatch(tr)
      return
    }

    let matches = findMatchesInDoc(editor.state, regex)

    // 如果选区范围搜索，过滤
    if (searchInSelection && selectionRange) {
      matches = matches.filter((m) => m.from >= selectionRange.from && m.to <= selectionRange.to)
    }

    // 创建装饰
    const decorations = matches.map((m, idx) =>
      Decoration.inline(m.from, m.to, {
        class: idx === 0 ? 'search-match search-match-current' : 'search-match',
      })
    )
    const decoSet = DecorationSet.create(editor.state.doc, decorations)

    const tr = editor.state.tr.setMeta(searchPluginKey, {
      decorations: decoSet,
    })
    editor.view.dispatch(tr)

    setMatchCount(matches.length)
    setCurrentIndex(matches.length > 0 ? 0 : -1)

    // 滚动到第一个匹配
    if (matches.length > 0) {
      try {
        const coords = editor.view.coordsAtPos(matches[0].from)
        const scrollEl = editor.view.dom.closest('.editor-scroll')
        if (scrollEl) {
          const rect = scrollEl.getBoundingClientRect()
          if (coords.top < rect.top || coords.bottom > rect.bottom) {
            scrollEl.scrollTop += coords.top - rect.top - rect.height / 3
          }
        }
      } catch { /* ignore */ }
    }
  }, [editor, findText, caseSensitive, useRegex, wholeWord, searchInSelection, selectionRange, isTextMode, content, selectTextMatch])

  // 搜索内容变化时自动搜索
  useEffect(() => {
    if (visible) {
      doSearch()
    }
  }, [findText, caseSensitive, useRegex, wholeWord, visible, doSearch])

  // 可见时聚焦输入框
  useEffect(() => {
    if (visible) {
      // 记录当前选区用于选区范围搜索
      if (editor && !selectionRange) {
        const { from, to, empty } = editor.state.selection
        if (!empty) {
          setSelectionRange({ from, to })
        }
      }
      setTimeout(() => findInputRef.current?.focus(), 50)
    } else {
      // 关闭时清除高亮（ProseMirror）
      if (editor && pluginRegistered.current) {
        const tr = editor.state.tr.setMeta(searchPluginKey, { decorations: DecorationSet.empty })
        editor.view.dispatch(tr)
      }
      // 关闭时清除 textarea 选中
      if (isTextMode) {
        const ta = document.querySelector('.editor-pane .source-textarea') as HTMLTextAreaElement | null
        if (ta) {
          const end = ta.selectionStart
          ta.setSelectionRange(end, end)
        }
      }
      setSelectionRange(null)
      setSearchInSelection(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // ── 更新当前匹配的高亮 ──
  const updateCurrentMatch = useCallback((index: number) => {
    // 文本模式分支
    if (isTextMode) {
      selectTextMatch(index)
      return
    }
    if (!editor || matchCount === 0) return
    const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
    if (!regex) return

    let matches = findMatchesInDoc(editor.state, regex)
    if (searchInSelection && selectionRange) {
      matches = matches.filter((m) => m.from >= selectionRange.from && m.to <= selectionRange.to)
    }

    if (matches.length === 0) return

    const decorations = matches.map((m, idx) =>
      Decoration.inline(m.from, m.to, {
        class: idx === index ? 'search-match search-match-current' : 'search-match',
      })
    )
    const decoSet = DecorationSet.create(editor.state.doc, decorations)
    const tr = editor.state.tr.setMeta(searchPluginKey, { decorations: decoSet })
    editor.view.dispatch(tr)

    setCurrentIndex(index)

    // 滚动到当前匹配
    try {
      const coords = editor.view.coordsAtPos(matches[index].from)
      const scrollEl = editor.view.dom.closest('.editor-scroll')
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect()
        if (coords.top < rect.top || coords.bottom > rect.bottom) {
          scrollEl.scrollTop += coords.top - rect.top - rect.height / 3
        }
      }
    } catch { /* ignore */ }
  }, [editor, findText, caseSensitive, useRegex, wholeWord, matchCount, searchInSelection, selectionRange, isTextMode, selectTextMatch])

  // ── 下一个匹配 ──
  const findNext = useCallback(() => {
    if (matchCount === 0) return
    const next = (currentIndex + 1) % matchCount
    updateCurrentMatch(next)
  }, [matchCount, currentIndex, updateCurrentMatch])

  // ── 上一个匹配 ──
  const findPrev = useCallback(() => {
    if (matchCount === 0) return
    const prev = currentIndex <= 0 ? matchCount - 1 : currentIndex - 1
    updateCurrentMatch(prev)
  }, [matchCount, currentIndex, updateCurrentMatch])

  // ── 替换当前 ──
  const replaceCurrent = useCallback(() => {
    // 文本模式分支
    if (isTextMode) {
      const src = content ?? ''
      if (matchCount === 0 || currentIndex < 0 || !onContentChange) return
      const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
      if (!regex) return
      const matches = textMatchesRef.current
      if (currentIndex >= matches.length) return
      const m = matches[currentIndex]
      const matchText = src.slice(m.index, m.index + m.length)
      let replacement = replaceText
      if (useRegex) {
        const fullRegex = new RegExp(regex.source, regex.flags.replace('g', ''))
        replacement = matchText.replace(fullRegex, replaceText)
      }
      const newContent = src.slice(0, m.index) + replacement + src.slice(m.index + m.length)
      onContentChange(newContent)
      // 更新 textMatchesRef 中后续匹配的偏移
      const delta = replacement.length - m.length
      textMatchesRef.current = textMatchesRef.current.map((t, i) => {
        if (i > currentIndex) return { index: t.index + delta, length: t.length }
        return t
      })
      setTimeout(() => doSearch(), 0)
      return
    }

    if (!editor || matchCount === 0 || currentIndex < 0) return
    const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
    if (!regex) return

    let matches = findMatchesInDoc(editor.state, regex)
    if (searchInSelection && selectionRange) {
      matches = matches.filter((m) => m.from >= selectionRange.from && m.to <= selectionRange.to)
    }

    if (currentIndex >= matches.length) return
    const match = matches[currentIndex]
    const matchText = editor.state.doc.textBetween(match.from, match.to, '')

    let replacement = replaceText
    if (useRegex) {
      // 正则替换：支持 $1, $2 等捕获组
      const fullRegex = new RegExp(regex.source, regex.flags.replace('g', ''))
      replacement = matchText.replace(fullRegex, replaceText)
    }

    editor.chain()
      .focus()
      .deleteRange({ from: match.from, to: match.to })
      .insertContent(replacement)
      .run()

    // 重新搜索
    setTimeout(() => doSearch(), 0)
  }, [editor, findText, replaceText, caseSensitive, useRegex, wholeWord, matchCount, currentIndex, searchInSelection, selectionRange, doSearch, isTextMode, content, onContentChange])

  // ── 全部替换 ──
  const replaceAll = useCallback(() => {
    // 文本模式分支
    if (isTextMode) {
      const src = content ?? ''
      if (matchCount === 0 || !onContentChange) return
      const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
      if (!regex) return
      const matches = textMatchesRef.current
      if (matches.length === 0) return
      // 从后往前替换
      let result = src
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        const matchText = result.slice(m.index, m.index + m.length)
        let replacement = replaceText
        if (useRegex) {
          const fullRegex = new RegExp(regex.source, regex.flags.replace('g', ''))
          replacement = matchText.replace(fullRegex, replaceText)
        }
        result = result.slice(0, m.index) + replacement + result.slice(m.index + m.length)
      }
      onContentChange(result)
      textMatchesRef.current = []
      setTimeout(() => doSearch(), 0)
      return
    }

    if (!editor || matchCount === 0) return
    const regex = buildRegex(findText, { caseSensitive, useRegex, wholeWord })
    if (!regex) return

    let matches = findMatchesInDoc(editor.state, regex)
    if (searchInSelection && selectionRange) {
      matches = matches.filter((m) => m.from >= selectionRange.from && m.to <= selectionRange.to)
    }

    if (matches.length === 0) return

    // 从后往前替换，避免位置偏移
    let chain = editor.chain().focus()
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i]
      const matchText = editor.state.doc.textBetween(match.from, match.to, '')
      let replacement = replaceText
      if (useRegex) {
        const fullRegex = new RegExp(regex.source, regex.flags.replace('g', ''))
        replacement = matchText.replace(fullRegex, replaceText)
      }
      chain = chain.deleteRange({ from: match.from, to: match.to }).insertContentAt(match.from, replacement)
    }
    chain.run()

    setTimeout(() => doSearch(), 0)
  }, [editor, findText, replaceText, caseSensitive, useRegex, wholeWord, matchCount, searchInSelection, selectionRange, doSearch, isTextMode, content, onContentChange])

  // ── 键盘快捷键 ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        findPrev()
      } else {
        findNext()
      }
    } else if (e.key === 'F3') {
      e.preventDefault()
      if (e.shiftKey) findPrev()
      else findNext()
    }
  }

  if (!visible) return null

  return (
    <div className="find-replace-bar" onKeyDown={handleKeyDown}>
      <div className="find-replace-row">
        <div className="find-replace-input-group">
          <input
            ref={findInputRef}
            type="text"
            className="find-replace-input"
            placeholder={t('find.placeholder')}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            spellCheck={false}
          />
          <span className="find-replace-count">
            {matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : (findText ? '0/0' : '')}
          </span>
        </div>

        <div className="find-replace-toggles">
          <button
            className={`find-toggle-btn ${caseSensitive ? 'active' : ''}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
            title={t('find.caseSensitive')}
          >Aa</button>
          <button
            className={`find-toggle-btn ${wholeWord ? 'active' : ''}`}
            onClick={() => setWholeWord(!wholeWord)}
            title={t('find.wholeWord')}
          >W</button>
          <button
            className={`find-toggle-btn ${useRegex ? 'active' : ''}`}
            onClick={() => setUseRegex(!useRegex)}
            title={t('find.regex')}
          >.*</button>
          <button
            className={`find-toggle-btn ${searchInSelection ? 'active' : ''}`}
            onClick={() => setSearchInSelection(!searchInSelection)}
            title={t('find.inSelection')}
          >∥</button>
        </div>

        <div className="find-replace-actions">
          <button className="find-action-btn" onClick={findPrev} title={t('find.previous')} disabled={matchCount === 0}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button className="find-action-btn" onClick={findNext} title={t('find.next')} disabled={matchCount === 0}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {mode === 'replace' && (
            <>
              <button className="find-action-btn" onClick={replaceCurrent} title={t('find.replace')} disabled={matchCount === 0}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
                </svg>
              </button>
              <button className="find-action-btn" onClick={replaceAll} title={t('find.replaceAll')} disabled={matchCount === 0}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
                  <path d="M3 21h18"/>
                </svg>
              </button>
            </>
          )}
        </div>

        <button
          className="find-action-btn"
          onClick={() => onModeChange(mode === 'find' ? 'replace' : 'find')}
          title={mode === 'find' ? t('find.expandReplace') : t('find.collapseReplace')}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mode === 'find' ? (
              <polyline points="6 9 12 15 18 9"/>
            ) : (
              <polyline points="18 15 12 9 6 15"/>
            )}
          </svg>
        </button>

        <button className="find-action-btn close" onClick={onClose} title={t('find.close')}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {mode === 'replace' && (
        <div className="find-replace-row">
          <div className="find-replace-input-group">
            <input
              type="text"
              className="find-replace-input"
              placeholder={t('find.replacePlaceholder')}
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  replaceCurrent()
                }
              }}
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
