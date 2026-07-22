import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useI18n } from '../i18n'
import { notifyError } from '../utils/toast'

export interface TabItem {
  id: string
  name: string
  path: string | null
  isModified: boolean
}

interface TabBarProps {
  tabs: TabItem[]
  activeTabId: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onCloseOthers: (tabId: string) => void
  onNewTab: () => void
}

interface TabContextMenu {
  x: number
  y: number
  tabId: string
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onCloseOthers, onNewTab }: TabBarProps) {
  const { t } = useI18n()
  const [ctxMenu, setCtxMenu] = useState<TabContextMenu | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 右键菜单关闭
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [ctxMenu])

  // 活动标签滚动到可见区域
  useEffect(() => {
    if (!scrollRef.current || !activeTabId) return
    const activeEl = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTabId])

  // 钳制菜单位置
  const clampPos = useCallback((x: number, y: number) => {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - 200 - pad)
    const maxY = Math.max(pad, window.innerHeight - 200 - pad)
    return { x: Math.min(Math.max(pad, x), maxX), y: Math.min(Math.max(pad, y), maxY) }
  }, [])

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ ...clampPos(e.clientX, e.clientY), tabId })
  }

  const handleCopyPath = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || !tab.path) return
    if (isTauri()) {
      await writeText(tab.path)
    } else {
      navigator.clipboard?.writeText(tab.path)
    }
    setCtxMenu(null)
  }

  const handleRevealInFileManager = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    setCtxMenu(null)
    if (!tab?.path || !isTauri()) return

    try {
      await invoke('reveal_in_file_manager', { filePath: tab.path })
    } catch (error) {
      notifyError(t('tab.revealFailed', { detail: String(error) }))
    }
  }

  const handleClose = (tabId: string) => {
    onTabClose(tabId)
    setCtxMenu(null)
  }

  const handleCloseOthers = (tabId: string) => {
    onCloseOthers(tabId)
    setCtxMenu(null)
  }

  // 中键关闭
  const handleAuxClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault()
      onTabClose(tabId)
    }
  }

  if (tabs.length === 0) return null

  return (
    <div className="tab-bar">
      <div className="tab-bar-scroll" ref={scrollRef}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onTabClick(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            onAuxClick={(e) => handleAuxClick(e, tab.id)}
            title={tab.path || tab.name}
          >
            <span className={`tab-dot ${tab.isModified ? 'modified' : ''}`} />
            <span className="tab-name">{tab.name}</span>
            <button
              className="tab-close-btn"
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id) }}
              title={t('tab.close')}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button className="tab-new-btn" onClick={onNewTab} title={t('tab.new')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {/* 右键菜单 — 通过 Portal 渲染到 body，避免被父级 stacking context 裁切 */}
      {ctxMenu && createPortal(
        <div
          className="tab-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tab-ctx-item" onClick={() => handleClose(ctxMenu.tabId)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            {t('tab.close')}
          </div>
          <div className="tab-ctx-item" onClick={() => handleCloseOthers(ctxMenu.tabId)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 9h6v6H9z"/><line x1="3" y1="9" x2="7" y2="9"/><line x1="3" y1="15" x2="7" y2="15"/><line x1="17" y1="9" x2="21" y2="9"/><line x1="17" y1="15" x2="21" y2="15"/></svg>
            {t('tab.closeOthers')}
          </div>
          <div className="tab-ctx-divider" />
          {tabs.find((tab) => tab.id === ctxMenu.tabId)?.path && (
            <div className="tab-ctx-item" onClick={() => handleRevealInFileManager(ctxMenu.tabId)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h4"/></svg>
              {t('tab.revealInFileManager')}
            </div>
          )}
          <div className="tab-ctx-item" onClick={() => handleCopyPath(ctxMenu.tabId)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {t('tab.copyPath')}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
