import { useState } from 'react'
import { useI18n } from '../../i18n'

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
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const maxRows = 8
  const maxCols = 8
  return (
    <div className="table-grid-picker" style={{ left: x, top: y }} onMouseLeave={() => setHover({ r: 0, c: 0 })}>
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
        {hover.r > 0 && hover.c > 0 ? `${hover.r} × ${hover.c}` : '拖拽选择行列'}
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
  const styles: [string, string][] = [
    ['decimal', t('toolbar.olStyle.decimal')],
    ['lower-alpha', t('toolbar.olStyle.lowerAlpha')],
    ['upper-alpha', t('toolbar.olStyle.upperAlpha')],
    ['lower-roman', t('toolbar.olStyle.lowerRoman')],
    ['upper-roman', t('toolbar.olStyle.upperRoman')],
  ]

  return (
    <div
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
 * 浮动在代码块右上角，允许用户选择代码块语言
 * 使用 <select> 替代 <input>+<datalist>，确保在 WebView 中所有选项正常显示
 */
export function CodeBlockLangPicker(props: {
  pos: number
  language: string
  x: number
  y: number
  onChange: (lang: string) => void
}) {
  const { t } = useI18n()
  const languages = [
    'javascript', 'typescript', 'python', 'bash', 'shell',
    'json', 'xml', 'css', 'sql', 'markdown', 'java', 'go',
    'rust', 'c', 'cpp', 'csharp', 'yaml', 'dockerfile', 'plaintext'
  ]

  // 如果当前语言不在预设列表中，将其添加到首位
  const allLangs = languages.includes(props.language)
    ? languages
    : [props.language, ...languages]

  return (
    <div
      className="code-lang-picker"
      style={{ left: props.x, top: props.y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <select
        className="code-lang-input"
        value={props.language}
        title={t('codeLang.placeholder')}
        onChange={(e) => {
          const lang = e.target.value || 'plaintext'
          props.onChange(lang)
        }}
      >
        {allLangs.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    </div>
  )
}
