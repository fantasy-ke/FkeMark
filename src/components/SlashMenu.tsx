import { useEffect, useMemo, useRef, useState } from 'react'

export interface SlashCommand {
  id: string
  label: string
  desc: string
  icon: string
  keywords: string
}

/** 斜杠命令全集 */
const ALL_COMMANDS: SlashCommand[] = [
  { id: 'h1', label: '一级标题', desc: '# 标题', icon: 'H1', keywords: 'h1 heading 标题' },
  { id: 'h2', label: '二级标题', desc: '## 标题', icon: 'H2', keywords: 'h2 heading 标题' },
  { id: 'h3', label: '三级标题', desc: '### 标题', icon: 'H3', keywords: 'h3 heading 标题' },
  { id: 'h4', label: '四级标题', desc: '#### 标题', icon: 'H4', keywords: 'h4 heading 标题' },
  { id: 'bold', label: '粗体', desc: '**文本**', icon: 'B', keywords: 'bold 粗体 加粗' },
  { id: 'italic', label: '斜体', desc: '*文本*', icon: 'I', keywords: 'italic 斜体' },
  { id: 'strike', label: '删除线', desc: '~~文本~~', icon: 'S', keywords: 'strike 删除线' },
  { id: 'quote', label: '引用', desc: '> 引用', icon: '❝', keywords: 'quote 引用 blockquote' },
  { id: 'ul', label: '无序列表', desc: '- 列表项', icon: '•', keywords: 'ul list 列表 bullet' },
  { id: 'ol', label: '有序列表', desc: '1. 列表项', icon: '1.', keywords: 'ol list 列表 ordered' },
  { id: 'code', label: '行内代码', desc: '`代码`', icon: '</>', keywords: 'code 代码 inline' },
  { id: 'codeblock', label: '代码块', desc: '``` 代码块', icon: '{ }', keywords: 'codeblock 代码块 pre' },
  { id: 'hr', label: '分割线', desc: '---', icon: '―', keywords: 'hr 分割线 horizontal' },
  { id: 'image', label: '图片', desc: '![alt](url)', icon: '🖼', keywords: 'image 图片' },
  { id: 'link', label: '链接', desc: '[文本](url)', icon: '🔗', keywords: 'link 链接' },
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

  if (filtered.length === 0) {
    return (
      <div className="slash-menu" style={{ left: x, top: y }}>
        <div className="slash-menu-empty">无匹配命令</div>
      </div>
    )
  }

  return (
    <div className="slash-menu" style={{ left: x, top: y }} ref={listRef}>
      <div className="slash-menu-header">基本排版</div>
      {filtered.map((cmd, idx) => (
        <button
          key={cmd.id}
          data-idx={idx}
          className={`slash-menu-item ${idx === selected ? 'active' : ''}`}
          onMouseEnter={() => setSelected(idx)}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
        >
          <span className="slash-menu-icon">{cmd.icon}</span>
          <span className="slash-menu-text">
            <span className="slash-menu-label">{cmd.label}</span>
            <span className="slash-menu-desc">{cmd.desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
