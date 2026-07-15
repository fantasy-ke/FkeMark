import { useEffect, useMemo, useRef, useState } from 'react'

export interface SlashCommand {
  id: string
  label: string
  desc: string
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
  { id: 'h1', label: '一级标题', desc: '# 标题', category: 'heading', keywords: 'h1 heading 标题' },
  { id: 'h2', label: '二级标题', desc: '## 标题', category: 'heading', keywords: 'h2 heading 标题' },
  { id: 'h3', label: '三级标题', desc: '### 标题', category: 'heading', keywords: 'h3 heading 标题' },
  { id: 'h4', label: '四级标题', desc: '#### 标题', category: 'heading', keywords: 'h4 heading 标题' },
  { id: 'bold', label: '粗体', desc: '**文本**', category: 'format', keywords: 'bold 粗体 加粗' },
  { id: 'italic', label: '斜体', desc: '*文本*', category: 'format', keywords: 'italic 斜体' },
  { id: 'strike', label: '删除线', desc: '~~文本~~', category: 'format', keywords: 'strike 删除线' },
  { id: 'quote', label: '引用', desc: '> 引用文本', category: 'list', keywords: 'quote 引用 blockquote' },
  { id: 'ul', label: '无序列表', desc: '- 列表项', category: 'list', keywords: 'ul list 列表 bullet' },
  { id: 'ol', label: '有序列表', desc: '1. 列表项', category: 'list', keywords: 'ol list 列表 ordered' },
  { id: 'todo', label: '任务列表', desc: '- [ ] 待办', category: 'list', keywords: 'todo task 任务 待办 checkbox' },
  { id: 'code', label: '行内代码', desc: '`代码`', category: 'code', keywords: 'code 代码 inline' },
  { id: 'codeblock', label: '代码块', desc: '```lang ... ```', category: 'code', keywords: 'codeblock 代码块 pre highlight' },
  { id: 'table', label: '表格', desc: '| 列 | 列 |', category: 'code', keywords: 'table 表格 grid' },
  { id: 'hr', label: '分割线', desc: '---', category: 'code', keywords: 'hr 分割线 horizontal' },
  { id: 'image', label: '图片', desc: '![alt](url)', category: 'insert', keywords: 'image 图片' },
  { id: 'link', label: '链接', desc: '[文本](url)', category: 'insert', keywords: 'link 链接' },
]

/** 分组配置 */
const CATEGORIES: { key: SlashCommand['category']; label: string }[] = [
  { key: 'heading', label: '标题' },
  { key: 'format', label: '文本格式' },
  { key: 'list', label: '列表与引用' },
  { key: 'code', label: '代码与结构' },
  { key: 'insert', label: '插入对象' },
]

interface SlashMenuProps {
  query: string
  x: number
  y: number
  onSelect: (cmd: SlashCommand) => void
  onClose: () => void
}

export function SlashMenu({ query, x, y, onSelect, onClose }: SlashMenuProps) {
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return ALL_COMMANDS
    return ALL_COMMANDS.filter((c) =>
      c.id.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.keywords.toLowerCase().includes(q)
    )
  }, [query])

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
  const adjustedLeft = Math.min(x, window.innerWidth - MENU_W - 8)
  const adjustedTop = y + MENU_H > window.innerHeight
    ? Math.max(8, y - MENU_H)
    : y

  if (filtered.length === 0) {
    return (
      <div className="slash-menu" style={{ left: adjustedLeft, top: adjustedTop }}>
        <div className="slash-menu-empty">无匹配命令</div>
      </div>
    )
  }

  // 按分组组织命令，保留全局选中索引
  let runningIdx = 0
  return (
    <div className="slash-menu" style={{ left: adjustedLeft, top: adjustedTop }} ref={listRef}>
      <div className="slash-menu-title">
        <span>斜杠命令</span>
        <span className="slash-menu-hint">
          <kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> 确认 <kbd>Esc</kbd> 关闭
        </span>
      </div>
      {CATEGORIES.map((cat) => {
        const cmds = filtered.filter((c) => c.category === cat.key)
        if (cmds.length === 0) return null
        return (
          <div key={cat.key} className="slash-menu-group">
            <div className="slash-menu-header">{cat.label}</div>
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
                    <span className="slash-menu-label">{cmd.label}</span>
                  </span>
                  <code className="slash-menu-syntax">{cmd.desc}</code>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
