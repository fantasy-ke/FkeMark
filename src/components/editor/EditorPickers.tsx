import { useState, useEffect, useRef, type RefObject } from 'react'
import { useI18n } from '../../i18n'
import { useClampedPopupPosition } from '../../utils/popupPosition'

/**
 * 表格网格选择器组件
 * 用于工具栏表格按钮，弹出 8x8 网格让用户选择行列数
 */
export function TableGridPicker(props: {
  x: number
  y: number
  onSelect: (rows: number, cols: number) => void
  onClose: () => void
}) {
  const { x, y, onSelect } = props
  const { t } = useI18n()
  const popupRef = useClampedPopupPosition<HTMLDivElement>(x, y)
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const maxRows = 8
  const maxCols = 8
  return (
    <div ref={popupRef} className="table-grid-picker" style={{ left: x, top: y }} onMouseLeave={() => setHover({ r: 0, c: 0 })}>
      <div className="table-grid">
        {Array.from({ length: maxRows }, (_, r) =>
          Array.from({ length: maxCols }, (_, c) => {
            const isHover = r < hover.r && c < hover.c
            return (
              <div
                key={`${r}-${c}`}
                className={`table-grid-cell ${isHover ? 'hover' : ''}`}
                onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                onMouseDown={(e) => { e.preventDefault(); onSelect(r + 1, c + 1) }}
              />
            )
          })
        )}
      </div>
      <div className="table-grid-label">
        {hover.r > 0 && hover.c > 0 ? `${hover.r} × ${hover.c}` : t('toolbar.tableGridHint')}
      </div>
    </div>
  )
}

/**
 * 有序列表样式选择器组件
 * 用于工具栏有序列表下拉按钮，弹出样式选项
 */
export function OlStylePicker(props: {
  x: number
  y: number
  onApply: (style: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const popupRef = useClampedPopupPosition<HTMLDivElement>(props.x, props.y)
  const styles: [string, string][] = [
    ['decimal', t('toolbar.olStyle.decimal')],
    ['lower-alpha', t('toolbar.olStyle.lowerAlpha')],
    ['upper-alpha', t('toolbar.olStyle.upperAlpha')],
    ['lower-roman', t('toolbar.olStyle.lowerRoman')],
    ['upper-roman', t('toolbar.olStyle.upperRoman')],
  ]

  return (
    <div
      ref={popupRef}
      className="ol-style-picker"
      style={{ left: props.x, top: props.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {styles.map(([val, label]) => (
        <button
          key={val}
          className="ol-style-item"
          onMouseDown={(e) => { e.preventDefault(); props.onApply(val) }}
        >
          <span className="ol-style-glyph">
            {val === 'decimal' ? '1.' :
             val === 'lower-alpha' ? 'a.' :
             val === 'upper-alpha' ? 'A.' :
             val === 'lower-roman' ? 'i.' :
             'I.'}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * 代码块语言选择器组件
 * 浮动在代码块右上角，支持从列表选择语言 + 手动输入自定义语言
 * 样式融入代码块（使用 code-bg 背景，无边框融合感）
 */
export function CodeBlockLangPicker(props: {
  pos: number
  language: string
  x: number
  y: number
  onChange: (lang: string) => void
  boundsRef?: RefObject<HTMLElement | null>
}) {
  const { t } = useI18n()
  const popupRef = useClampedPopupPosition<HTMLDivElement>(props.x, props.y, {
    containerRef: props.boundsRef,
    coordinates: 'local',
  })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(props.language)
  const [typing, setTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const languages = [
    'plaintext', 'javascript', 'typescript', 'python', 'bash', 'shell',
    'json', 'xml', 'html', 'css', 'scss', 'sql', 'markdown',
    'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'yaml',
    'dockerfile', 'php', 'ruby', 'kotlin', 'swift', 'scala',
    'perl', 'lua', 'r', 'dart', 'elixir', 'haskell', 'vue', 'svelte',
  ]

  // 仅在用户实际输入后才用 query 筛选；打开时显示全部语言
  const filtered = open && typing && query.trim()
    ? languages.filter((l) => l.toLowerCase().includes(query.toLowerCase()))
    : languages

  // 外部 language 变化时同步（非编辑状态）
  useEffect(() => {
    if (!open) setQuery(props.language)
  }, [props.language, open])

  const applyLang = (lang: string) => {
    const finalLang = lang.trim() || 'plaintext'
    // 仅当语言实际变化时才通知编辑器，避免无谓的 transaction
    if (finalLang !== props.language) {
      props.onChange(finalLang)
    }
    setQuery(finalLang)
    setTyping(false)
    setOpen(false)
  }

  return (
    <div
      ref={popupRef}
      className="code-lang-picker"
      style={{ left: props.x, top: props.y }}
    >
      <input
        ref={inputRef}
        className="code-lang-input"
        type="text"
        value={query}
        spellCheck={false}
        placeholder={t('codeLang.placeholder')}
        onFocus={() => { setOpen(true); setTyping(false) }}
        onChange={(e) => { setQuery(e.target.value); setTyping(true); setOpen(true) }}
        onBlur={() => {
          // 延迟以允许点击下拉选项；仅当有实际输入时才应用
          setTimeout(() => {
            const finalLang = query.trim() || 'plaintext'
            if (finalLang !== props.language) {
              props.onChange(finalLang)
            }
            setQuery(props.language)
            setTyping(false)
            setOpen(false)
          }, 150)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); applyLang(query) }
          if (e.key === 'Escape') { e.preventDefault(); setQuery(props.language); setTyping(false); setOpen(false); inputRef.current?.blur() }
        }}
      />
      <svg className="code-lang-caret" viewBox="0 0 24 24" width="10" height="10">
        <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open && filtered.length > 0 && (
        <div className="code-lang-dropdown">
          {filtered.map((l) => (
            <button
              key={l}
              className={`code-lang-option ${l === props.language ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyLang(l) }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
