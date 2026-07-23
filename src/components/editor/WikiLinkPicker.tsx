import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { clampPopupPosition } from '../../utils/popupPosition'
import type { WikiLinkSuggestion } from '../../utils/markdown/wikiLinks'

interface WikiLinkPickerProps {
  open: boolean
  query: string
  x: number
  y: number
  suggestions: WikiLinkSuggestion[]
  onSelect: (suggestion: WikiLinkSuggestion) => void
  onClose: () => void
}

export function WikiLinkPicker({ open, query, x, y, suggestions, onSelect, onClose }: WikiLinkPickerProps) {
  const { t } = useI18n()
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return suggestions
    return suggestions.filter((suggestion) =>
      suggestion.name.toLocaleLowerCase().includes(normalizedQuery)
      || suggestion.target.toLocaleLowerCase().includes(normalizedQuery)
      || suggestion.relativePath.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [query, suggestions])

  useEffect(() => { setSelected(0) }, [query])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault(); event.stopPropagation()
        setSelected((value) => (value + 1) % Math.max(filtered.length, 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation()
        setSelected((value) => (value - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
      } else if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation()
        if (filtered[selected]) onSelect(filtered[selected])
      } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [filtered, onClose, onSelect, open, selected])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.wiki-link-picker')) onClose()
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose, open])

  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null
  const position = clampPopupPosition(x, y, 340, 380, window.innerWidth, window.innerHeight)

  return (
    <div ref={listRef} className="slash-menu wiki-link-picker" style={{ left: position.left, top: position.top }}>
      <div className="slash-menu-title">
        <span>{t('wikiLink.picker.title')}</span>
        <span className="slash-menu-hint"><kbd>{'\u2191'}</kbd><kbd>{'\u2193'}</kbd> <kbd>{'\u21B5'}</kbd> <kbd>Esc</kbd></span>
      </div>
      {filtered.length === 0 ? (
        <div className="slash-menu-empty">{t(suggestions.length === 0 ? 'wikiLink.picker.empty' : 'wikiLink.picker.noMatch')}</div>
      ) : (
        <div className="slash-menu-group">
          <div className="slash-menu-header">{t('wikiLink.picker.documents', { count: filtered.length })}</div>
          {filtered.map((suggestion, index) => (
            <button
              key={suggestion.path}
              type="button"
              data-idx={index}
              data-wiki-target={suggestion.target}
              className={`slash-menu-item ${index === selected ? 'active' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onMouseDown={(event) => { event.preventDefault(); onSelect(suggestion) }}
            >
              <span className="slash-menu-icon">[[ ]]</span>
              <span className="slash-menu-text">
                <span className="slash-menu-label">{suggestion.name}</span>
              </span>
              <code className="slash-menu-syntax" title={suggestion.relativePath}>{suggestion.relativePath}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
