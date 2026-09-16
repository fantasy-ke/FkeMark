import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { placeAnchoredPopup } from '../utils/popupPosition'

// ════════════════════════════════════
// 自定义 Select 组件
//
// 替代原生 <select>，解决两个问题：
// 1. <option> 无法用 CSS 自定义样式（OS 原生渲染）
// 2. 字体列表 100+ 选项带 fontFamily 内联样式导致打开卡顿
//
// 用法完全兼容原生 select children 模式：
//   <Select value={v} onChange={setV} className="settings-select">
//     <Select.Option value="a">A</Select.Option>
//     <Select.Group label="Group">
//       <Select.Option value="b">B</Select.Option>
//     </Select.Group>
//   </Select>
// ════════════════════════════════════

// ── Context（用于 Option 向父组件通信）──
interface SelectCtx {
  value: string
  onSelect: (v: string) => void
  registerOption: (v: string, el: HTMLElement | null) => void
  selectedEl: HTMLElement | null
}
const Ctx = createContext<SelectCtx | null>(null)

// ── Option ──
interface OptionProps {
  value: string
  disabled?: boolean
  children: ReactNode
}
function Option({ value, disabled, children }: OptionProps) {
  const ctx = useContext(Ctx)
  const elRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctx) return
    ctx.registerOption(value, elRef.current)
    return () => ctx.registerOption(value, null)
  }, [ctx, value])

  if (!ctx) return null
  const selected = ctx.value === value
  return (
    <div
      ref={elRef}
      className={`fke-select-option${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      data-value={value}
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => {
        // 只拦截默认行为，避免 trigger blur；真正选中放到 click，防止菜单先卸导致 click 穿透遮罩
        if (disabled) { e.preventDefault(); return }
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (disabled) return
        ctx.onSelect(value)
      }}
    >
      {children}
    </div>
  )
}

// ── Group ──
interface GroupProps {
  label: string
  children: ReactNode
}
function Group({ label, children }: GroupProps) {
  return (
    <div className="fke-select-group">
      <div className="fke-select-group-label">{label}</div>
      {children}
    </div>
  )
}

// ── Select (主组件) ──
interface SelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  placeholder?: string
  children: ReactNode
}

function SelectRoot({ value, onChange, className, disabled, placeholder, children }: SelectProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const optionMap = useRef<Map<string, HTMLElement>>(new Map())
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null)
  const [activeIdx, setActiveIdx] = useState(-1)
  // 用 ref 保存最新 value，避免 registerOption 依赖 value 导致频繁重建
  const valueRef = useRef(value)
  valueRef.current = value

  // ── 收集 flat option values + 注册 option DOM 元素 ──
  const flatValuesRef = useRef<string[]>([])
  const registerOption = useCallback((v: string, el: HTMLElement | null) => {
    if (el) {
      optionMap.current.set(v, el)
      if (!flatValuesRef.current.includes(v)) {
        flatValuesRef.current.push(v)
      }
      // 注册的若为当前选中项，立即同步 selectedEl（解决关闭态 Option 未挂载导致显示文本丢失）
      if (v === valueRef.current) {
        setSelectedEl(el)
      }
    } else {
      optionMap.current.delete(v)
      flatValuesRef.current = flatValuesRef.current.filter((x) => x !== v)
      if (v === valueRef.current) {
        setSelectedEl(null)
      }
    }
  }, [])

  // 同步 selectedEl
  useEffect(() => {
    setSelectedEl(optionMap.current.get(value) || null)
  }, [value])

  // ── 点击外部关闭 ──
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.MouseEvent) => {
      const target = e.target as Node
      if (dropdownRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── ESC 关闭 ──
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // ── 打开时滚动到选中项 ──
  useEffect(() => {
    if (!open || !selectedEl) return
    requestAnimationFrame(() => {
      selectedEl.scrollIntoView?.({ block: 'nearest' })
    })
  }, [open, selectedEl])

  // ── 打开时按触发器定位，避免被设置页 overflow 裁切 ──
  useLayoutEffect(() => {
    const dropdown = dropdownRef.current
    const trigger = triggerRef.current
    if (!open || !dropdown || !trigger) {
      dropdown?.removeAttribute('data-placed')
      return
    }

    const updatePosition = () => {
      const triggerRect = trigger.getBoundingClientRect()
      const boundsEl = trigger.closest('.settings-page') as HTMLElement | null
      const boundsRect = boundsEl?.getBoundingClientRect()
      const bounds = boundsRect ?? {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      }

      dropdown.style.width = 'max-content'
      dropdown.style.maxHeight = 'none'
      const next = placeAnchoredPopup(
        triggerRect,
        {
          width: Math.max(triggerRect.width, dropdown.scrollWidth),
          height: dropdown.scrollHeight,
        },
        bounds,
      )
      dropdown.style.position = 'fixed'
      dropdown.style.left = `${Math.round(next.left)}px`
      dropdown.style.top = `${Math.round(next.top)}px`
      dropdown.style.width = `${Math.round(next.width)}px`
      dropdown.style.maxHeight = `${Math.round(next.maxHeight)}px`
      dropdown.style.right = 'auto'
      dropdown.dataset.placement = next.placement
      dropdown.dataset.placed = 'true'
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null
    observer?.observe(trigger)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      observer?.disconnect()
    }
  }, [open])

  // ── 键盘导航 ──
  const handleKey = (e: KeyboardEvent) => {
    const flat = flatValuesRef.current
    if (flat.length === 0) return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next = Math.max(0, Math.min(flat.length - 1, activeIdx + delta))
      setActiveIdx(next)
      // 滚动到可见
      const el = optionMap.current.get(flat[next])
      el?.scrollIntoView?.({ block: 'nearest' })
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (activeIdx >= 0 && activeIdx < flat.length) {
        const v = flat[activeIdx]
        onChange(v)
        setOpen(false)
      }
      return
    }

    if (e.key === 'Escape') {
      setOpen(false)
      return
    }

    // 字符搜索：按字母快速跳转
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase()
      const start = activeIdx + 1
      for (let i = 0; i < flat.length; i++) {
        const idx = (start + i) % flat.length
        const label = optionMap.current.get(flat[idx])?.textContent?.trim().toLowerCase()
        if (label?.startsWith(ch)) {
          setActiveIdx(idx)
          optionMap.current.get(flat[idx])?.scrollIntoView?.({ block: 'nearest' })
          break
        }
      }
    }
  }

  // ── 获取当前显示文本 ──
  const displayText = selectedEl?.textContent?.trim() || placeholder || ''

  const ctx: SelectCtx = { value, onSelect: (v) => { onChange(v); setOpen(false) }, registerOption, selectedEl }

  const dropdown = (
    <div
      ref={dropdownRef}
      className={`fke-select-dropdown${open ? ' open' : ''}`}
      role="listbox"
      hidden={!open}
      style={!open ? { display: 'none' } : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
    </div>
  )

  return (
    <div
      className={`fke-select-root${open ? ' open' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}
      onKeyDown={handleKey}
    >
      <button
        ref={triggerRef}
        type="button"
        className="fke-select-trigger"
        disabled={disabled}
        tabIndex={0}
        onClick={() => { if (!disabled) setOpen(!open) }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="fke-select-trigger-text">{displayText}</span>
      </button>

      {/* dropdown 始终挂载（CSS 控制显隐），保证 Option 始终注册到 optionMap，
          使 trigger 在关闭态也能正确显示当前选中项文本。挂到 body 以免被设置页裁切。 */}
      {typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body)}
    </div>
  )
}

// ── 导出（复合组件）──
export const Select = Object.assign(SelectRoot, { Option, Group })
