import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { clampPopupPosition } from '../utils/popupPosition'

export interface SlashCommand {
  id: string
  labelKey: string
  descKey: string
  /** 命令分类，用于分组显示 */
  category: 'heading' | 'format' | 'list' | 'code' | 'insert'
  keywords: string
}

/** 渲染命令对应的 SVG 图标（统一 16x16 线框风格，currentColor 继承） */
function CommandIcon({ id }: { id: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (id) {
    case 'h1':
      return (
        <svg {...common}>
          <path d="M4 6v12M12 6v12M4 12h8" />
          <path d="M17 9l3-1v10" strokeWidth={1.6} />
        </svg>
      )
    case 'h2':
      return (
        <svg {...common}>
          <path d="M4 6v12M12 6v12M4 12h8" />
          <path d="M16 10c0-1 1-2 2.5-2s2.5 1 2.5 2-1 1.8-2.5 2.5S16 14 16 15.5s1 2.5 2.5 2.5 2.5-1 2.5-2" strokeWidth={1.4} />
        </svg>
      )
    case 'h3':
      return (
        <svg {...common}>
          <path d="M4 6v12M12 6v12M4 12h8" />
          <path d="M16 8h5l-2.5 3c1.5 0 2.5 1 2.5 2.5S20 16 18.5 16 16 15 16 14" strokeWidth={1.4} />
        </svg>
      )
    case 'h4':
      return (
        <svg {...common}>
          <path d="M4 6v12M12 6v12M4 12h8" />
          <path d="M17 8v8M17 12h4M21 9v6" strokeWidth={1.5} />
        </svg>
      )
    case 'bold':
      return (
        <svg {...common}>
          <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
        </svg>
      )
    case 'italic':
      return (
        <svg {...common}>
          <path d="M19 5h-6M11 19H5M15 5L9 19" />
        </svg>
      )
    case 'strike':
      return (
        <svg {...common}>
          <path d="M4 12h16M7 8c0-2 2-3 5-3s5 1 5 3-2 3-5 3M7 16c0 2 2 3 5 3s5-1 5-3-2-3-5-3" />
        </svg>
      )
    case 'quote':
      return (
        <svg {...common}>
          <path d="M5 8h4v4H6c0 2 1 3 3 3M13 8h4v4h-3c0 2 1 3 3 3" />
        </svg>
      )
    case 'ul':
      return (
        <svg {...common}>
          <circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
          <path d="M9 7h11M9 12h11M9 17h11" />
        </svg>
      )
    case 'ol':
      return (
        <svg {...common}>
          <path d="M9 7h11M9 12h11M9 17h11" />
          <path d="M4 6.5c1 .5 1 1.5 0 2M4 11.5h2L4 14h2M4 17h2M4 19h2" strokeWidth={1.4} />
        </svg>
      )
    case 'todo':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="6" height="6" rx="1.2" />
          <rect x="3" y="14" width="6" height="6" rx="1.2" />
          <path d="M12 9h9M12 17h9" />
          <path d="M4.2 9l1.2 1.2L7.5 7.5" strokeWidth={1.6} />
        </svg>
      )
    case 'code':
      return (
        <svg {...common}>
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
        </svg>
      )
    case 'codeblock':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M9 10l-2 2 2 2M15 10l2 2-2 2" strokeWidth={1.6} />
        </svg>
      )
    case 'table':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="M3 10h18M3 14h18M9 5v14M15 5v14" strokeWidth={1.4} />
        </svg>
      )
    case 'hr':
      return (
        <svg {...common}>
          <path d="M4 8h16M4 12h16M4 16h16" strokeWidth={1.4} />
          <path d="M4 12h16" strokeWidth={2.5} />
        </svg>
      )
    case 'image':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5L5 19" />
        </svg>
      )
    case 'link':
    case 'wikilink':
      return (
        <svg {...common}>
          <path d="M9 15l6-6" />
          <path d="M10 7l1-1a3.5 3.5 0 0 1 5 5l-1 1M14 17l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
        </svg>
      )
    default:
      return null
  }
}

/** 斜杠命令全集 */
const ALL_COMMANDS: SlashCommand[] = [
  { id: 'h1', labelKey: 'slash.cmd.h1', descKey: 'slash.desc.h1', category: 'heading', keywords: 'h1 heading 标题' },
  { id: 'h2', labelKey: 'slash.cmd.h2', descKey: 'slash.desc.h2', category: 'heading', keywords: 'h2 heading 标题' },
  { id: 'h3', labelKey: 'slash.cmd.h3', descKey: 'slash.desc.h3', category: 'heading', keywords: 'h3 heading 标题' },
  { id: 'h4', labelKey: 'slash.cmd.h4', descKey: 'slash.desc.h4', category: 'heading', keywords: 'h4 heading 标题' },
  { id: 'bold', labelKey: 'slash.cmd.bold', descKey: 'slash.desc.bold', category: 'format', keywords: 'bold 粗体 加粗' },
  { id: 'italic', labelKey: 'slash.cmd.italic', descKey: 'slash.desc.italic', category: 'format', keywords: 'italic 斜体' },
  { id: 'strike', labelKey: 'slash.cmd.strike', descKey: 'slash.desc.strike', category: 'format', keywords: 'strike 删除线' },
  { id: 'quote', labelKey: 'slash.cmd.quote', descKey: 'slash.desc.quote', category: 'list', keywords: 'quote 引用 blockquote' },
  { id: 'ul', labelKey: 'slash.cmd.ul', descKey: 'slash.desc.ul', category: 'list', keywords: 'ul list 列表 bullet' },
  { id: 'ol', labelKey: 'slash.cmd.ol', descKey: 'slash.desc.ol', category: 'list', keywords: 'ol list 列表 ordered' },
  { id: 'todo', labelKey: 'slash.cmd.todo', descKey: 'slash.desc.todo', category: 'list', keywords: 'todo task 任务 待办 checkbox' },
  { id: 'code', labelKey: 'slash.cmd.code', descKey: 'slash.desc.code', category: 'code', keywords: 'code 代码 inline' },
  { id: 'codeblock', labelKey: 'slash.cmd.codeblock', descKey: 'slash.desc.codeblock', category: 'code', keywords: 'codeblock 代码块 pre highlight' },
  { id: 'table', labelKey: 'slash.cmd.table', descKey: 'slash.desc.table', category: 'code', keywords: 'table 表格 grid' },
  { id: 'hr', labelKey: 'slash.cmd.hr', descKey: 'slash.desc.hr', category: 'code', keywords: 'hr 分割线 horizontal' },
  { id: 'image', labelKey: 'slash.cmd.image', descKey: 'slash.desc.image', category: 'insert', keywords: 'image 图片' },
  { id: 'link', labelKey: 'slash.cmd.link', descKey: 'slash.desc.link', category: 'insert', keywords: 'link 链接' },
  { id: 'wikilink', labelKey: 'slash.cmd.wikilink', descKey: 'slash.desc.wikilink', category: 'insert', keywords: 'wiki wikilink backlink 双向链接 双链 文档 笔记' },
  { id: 'mathblock', labelKey: 'slash.cmd.mathblock', descKey: 'slash.desc.mathblock', category: 'insert', keywords: 'math katex 公式 块级 数学' },
  { id: 'mathinline', labelKey: 'slash.cmd.mathinline', descKey: 'slash.desc.mathinline', category: 'insert', keywords: 'math katex 公式 行内 数学' },
]

/** 分组配置 */
const CATEGORIES: { key: SlashCommand['category']; i18n: string }[] = [
  { key: 'heading', i18n: 'slash.cat.heading' },
  { key: 'format', i18n: 'slash.cat.format' },
  { key: 'list', i18n: 'slash.cat.list' },
  { key: 'code', i18n: 'slash.cat.code' },
  { key: 'insert', i18n: 'slash.cat.insert' },
]

interface SlashMenuProps {
  query: string
  x: number
  y: number
  onSelect: (cmd: SlashCommand) => void
  onClose: () => void
}

export function SlashMenu({ query, x, y, onSelect, onClose }: SlashMenuProps) {
  const { t } = useI18n()
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return ALL_COMMANDS
    return ALL_COMMANDS.filter((c) =>
      c.id.toLowerCase().includes(q) ||
      t(c.labelKey).toLowerCase().includes(q) ||
      c.keywords.toLowerCase().includes(q)
    )
  }, [query, t])

  useEffect(() => { setSelected(0) }, [query])

  // 键盘导航：capture 阶段拦截（编辑器聚焦时事件先到 window）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setSelected((s) => (s + 1) % Math.max(filtered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setSelected((s) => (s - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        if (filtered[selected]) onSelect(filtered[selected])
        else onClose()
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [filtered, selected, onSelect, onClose])

  // 滚动选中项到可视区
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // 智能定位：防止菜单超出视口底部/右侧
  const MENU_W = 320
  const MENU_H = 380
  const preferredTop = y + MENU_H > window.innerHeight ? y - MENU_H : y
  const { left: adjustedLeft, top: adjustedTop } = clampPopupPosition(
    x,
    preferredTop,
    MENU_W,
    MENU_H,
    window.innerWidth,
    window.innerHeight,
  )

  if (filtered.length === 0) {
    return (
      <div className="slash-menu" style={{ left: adjustedLeft, top: adjustedTop }}>
        <div className="slash-menu-empty">{t('slash.empty')}</div>
      </div>
    )
  }

  // 按分组组织命令，保留全局选中索引
  let runningIdx = 0
  return (
    <div className="slash-menu" style={{ left: adjustedLeft, top: adjustedTop }} ref={listRef}>
      <div className="slash-menu-title">
        <span>{t('slash.title')}</span>
        <span className="slash-menu-hint">
          <kbd>↑</kbd><kbd>↓</kbd> {t('slash.navigate')} <kbd>↵</kbd> {t('slash.confirm')} <kbd>Esc</kbd> {t('slash.close')}
        </span>
      </div>
      {CATEGORIES.map((cat) => {
        const cmds = filtered.filter((c) => c.category === cat.key)
        if (cmds.length === 0) return null
        return (
          <div key={cat.key} className="slash-menu-group">
            <div className="slash-menu-header">{t(cat.i18n)}</div>
            {cmds.map((cmd) => {
              const idx = runningIdx++
              return (
                <button
                  key={cmd.id}
                  data-idx={idx}
                  className={`slash-menu-item ${idx === selected ? 'active' : ''}`}
                  onMouseEnter={() => setSelected(idx)}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
                >
                  <span className="slash-menu-icon" data-cmd={cmd.id}>
                    <CommandIcon id={cmd.id} />
                  </span>
                  <span className="slash-menu-text">
                    <span className="slash-menu-label">{t(`slash.cmd.${cmd.id}`)}</span>
                  </span>
                  <code className="slash-menu-syntax">{t(cmd.descKey)}</code>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
