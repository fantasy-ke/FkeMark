import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { useI18n } from '../i18n'
import { isTauri } from '../utils/tauri'

interface TrashItem {
  name: string
  originalPath: string
  trashPath: string
  deletedAt: string
  size: number
}

interface RecycleBinPanelProps {
  open: boolean
  onClose: () => void
  onRestored: () => void
}

export function RecycleBinPanel({ open, onClose, onRestored }: RecycleBinPanelProps) {
  const { t } = useI18n()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadTrash = useCallback(async () => {
    if (!isTauri()) return
    setLoading(true)
    try {
      const result = await invoke<TrashItem[]>('list_trash')
      setItems(result)
    } catch (e) {
      console.error('Failed to load trash:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadTrash()
  }, [open, loadTrash])

  const handleRestore = async (item: TrashItem) => {
    try {
      await invoke('restore_from_trash', { trashPath: item.trashPath, restorePath: item.originalPath })
      await loadTrash()
      onRestored()
    } catch (e) {
      alert(`${t('trash.restoreFailed')}: ${e}`)
    }
  }

  const handlePurge = async (item: TrashItem) => {
    if (!confirm(t('trash.confirmPurge'))) return
    try {
      await invoke('purge_from_trash', { trashPath: item.trashPath })
      await loadTrash()
    } catch (e) {
      alert(`${t('trash.purgeFailed')}: ${e}`)
    }
  }

  const handleEmptyTrash = async () => {
    if (items.length === 0) return
    if (!confirm(t('trash.confirmEmpty'))) return
    try {
      await invoke('empty_trash')
      await loadTrash()
    } catch (e) {
      alert(`${t('trash.emptyFailed')}: ${e}`)
    }
  }

  // 格式化文件大小
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 格式化删除时间
  function formatTime(iso: string): string {
    try {
      const date = new Date(iso)
      const now = Date.now()
      const diff = now - date.getTime()
      const min = Math.floor(diff / 60000)
      const hour = Math.floor(diff / 3600000)
      const day = Math.floor(diff / 86400000)
      if (min < 1) return t('sidebar.time.now')
      if (min < 60) return t('sidebar.time.minutes', { n: min })
      if (hour < 24) return t('sidebar.time.hours', { n: hour })
      if (day < 7) return t('sidebar.time.days', { n: day })
      return `${date.getMonth() + 1}/${date.getDate()}`
    } catch {
      return ''
    }
  }

  if (!open) return null

  return (
    <div className="recycle-overlay" onClick={onClose}>
      <div className="recycle-panel" onClick={(e) => e.stopPropagation()}>
        <div className="recycle-header">
          <div className="recycle-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>{t('trash.title')}</span>
            {items.length > 0 && <span className="recycle-count">{items.length}</span>}
          </div>
          <div className="recycle-actions">
            {items.length > 0 && (
              <button className="recycle-empty-btn" onClick={handleEmptyTrash}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                {t('trash.emptyAll')}
              </button>
            )}
            <button className="recycle-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="recycle-list">
          {loading ? (
            <div className="recycle-empty">{t('trash.loading')}</div>
          ) : items.length === 0 ? (
            <div className="recycle-empty">{t('trash.empty')}</div>
          ) : (
            items.map((item, idx) => (
              <div key={idx} className="recycle-item">
                <div className="recycle-item-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="recycle-item-content">
                  <div className="recycle-item-name">{item.name}</div>
                  <div className="recycle-item-path" title={item.originalPath}>{item.originalPath}</div>
                </div>
                <div className="recycle-item-meta">
                  <span className="recycle-item-size">{formatSize(item.size)}</span>
                  <span className="recycle-item-time">{formatTime(item.deletedAt)}</span>
                </div>
                <div className="recycle-item-actions">
                  <button className="recycle-restore-btn" onClick={() => handleRestore(item)} title={t('trash.restore')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9"/>
                      <polyline points="3 4 3 12 11 12"/>
                    </svg>
                  </button>
                  <button className="recycle-purge-btn" onClick={() => handlePurge(item)} title={t('trash.purge')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
