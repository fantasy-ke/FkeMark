import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, GitCompareArrows, History, Plus, RotateCcw, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '../../i18n'
import { showConfirm } from '../ConfirmDialog'
import { createVersionDiff, normalizeVersionSnapshotLimit, type VersionSnapshot } from '../../utils/versionHistory'
import { clampPopupPosition } from '../../utils/popupPosition'

interface VersionHistoryMenuProps {
  filePath?: string | null
  getCurrentContent: () => string
  onRestore: (content: string) => void
  closeWhen?: boolean
  onBeforeOpen?: () => void
  snapshotLimit?: number
}

interface ComparedSnapshot {
  snapshot: VersionSnapshot
  content: string
  current: string
}

const MAX_RENDERED_DIFF_LINES = 5000

export function VersionHistoryMenu({
  filePath,
  getCurrentContent,
  onRestore,
  closeWhen,
  onBeforeOpen,
  snapshotLimit,
}: VersionHistoryMenuProps) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([])
  const [error, setError] = useState('')
  const [compared, setCompared] = useState<ComparedSnapshot | null>(null)
  const [activeDiffNavIndex, setActiveDiffNavIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLElement>(null)
  const diffContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (closeWhen) setOpen(false)
  }, [closeWhen])

  useEffect(() => {
    setOpen(false)
    setCompared(null)
    setSnapshots([])
    setError('')
  }, [filePath])

  useEffect(() => {
    setActiveDiffNavIndex(-1)
  }, [compared])

  useEffect(() => {
    if (!open && !compared) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (compared) setCompared(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [compared, open])

  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!open || !trigger || !popover) return

    const updatePosition = () => {
      const triggerRect = trigger.getBoundingClientRect()
      const popupRect = popover.getBoundingClientRect()
      const toolbar = trigger.closest('.editor-toolbar')
      let x = triggerRect.right - popupRect.width
      let y = triggerRect.bottom + 8

      if (toolbar?.classList.contains('position-left')) {
        x = triggerRect.right + 8
        y = triggerRect.top
      } else if (toolbar?.classList.contains('position-right')) {
        x = triggerRect.left - popupRect.width - 8
        y = triggerRect.top
      } else if (toolbar?.classList.contains('position-bottom')) {
        y = triggerRect.top - popupRect.height - 8
      }

      const position = clampPopupPosition(
        x,
        y,
        popupRect.width,
        popupRect.height,
        window.innerWidth,
        window.innerHeight,
      )
      popover.style.left = `${position.left}px`
      popover.style.top = `${position.top}px`
    }

    updatePosition()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    observer?.observe(popover)
    window.addEventListener('resize', updatePosition)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [creating, error, loading, open, snapshots.length])

  async function loadSnapshots() {
    if (!filePath) return
    setLoading(true)
    setError('')
    try {
      setSnapshots(await invoke<VersionSnapshot[]>('list_version_snapshots', { path: filePath }))
    } catch (reason) {
      setError(t('versions.loadFailed', { detail: String(reason) }))
    } finally {
      setLoading(false)
    }
  }

  async function toggleMenu() {
    if (open) {
      setOpen(false)
      return
    }
    onBeforeOpen?.()
    setOpen(true)
    await loadSnapshots()
  }

  async function createSnapshot() {
    if (!filePath) return
    setCreating(true)
    setError('')
    try {
      await invoke('create_version_snapshot', {
        path: filePath,
        content: getCurrentContent(),
        snapshotLimit: normalizeVersionSnapshotLimit(snapshotLimit),
      })
      await loadSnapshots()
    } catch (reason) {
      setError(t('versions.createFailed', { detail: String(reason) }))
    } finally {
      setCreating(false)
    }
  }

  async function compareSnapshot(snapshot: VersionSnapshot) {
    if (!filePath) return
    setError('')
    try {
      const content = await invoke<string>('read_version_snapshot', {
        path: filePath,
        snapshotId: snapshot.id,
      })
      setCompared({ snapshot, content, current: getCurrentContent() })
    } catch (reason) {
      setError(t('versions.readFailed', { detail: String(reason) }))
    }
  }

  async function restoreSnapshot() {
    if (!compared) return
    if (!(await showConfirm(t('versions.restoreConfirm'), t('versions.diffTitle')))) return
    onRestore(compared.content)
    setCompared(null)
    setOpen(false)
  }

  const diff = useMemo(
    () => compared ? createVersionDiff(compared.content, compared.current) : [],
    [compared],
  )
  const additions = diff.filter((line) => line.kind === 'add').length
  const deletions = diff.filter((line) => line.kind === 'remove').length
  const visibleDiff = diff.slice(0, MAX_RENDERED_DIFF_LINES)
  const visibleChangeIndexes = visibleDiff.reduce<number[]>((indexes, line, index) => {
    if (line.kind !== 'same') indexes.push(index)
    return indexes
  }, [])
  const activeDiffLineIndex = activeDiffNavIndex >= 0 ? visibleChangeIndexes[activeDiffNavIndex] : null
  const diffNavLabel = visibleChangeIndexes.length === 0
    ? t('versions.noDiffToNavigate')
    : activeDiffNavIndex >= 0
      ? t('versions.diffPosition', { current: activeDiffNavIndex + 1, total: visibleChangeIndexes.length })
      : t('versions.diffPositionEmpty', { total: visibleChangeIndexes.length })

  function jumpToDiff(direction: -1 | 1) {
    if (visibleChangeIndexes.length === 0) return
    const nextNavIndex = activeDiffNavIndex < 0
      ? (direction > 0 ? 0 : visibleChangeIndexes.length - 1)
      : (activeDiffNavIndex + direction + visibleChangeIndexes.length) % visibleChangeIndexes.length
    setActiveDiffNavIndex(nextNavIndex)
    const lineIndex = visibleChangeIndexes[nextNavIndex]
    diffContentRef.current
      ?.querySelector<HTMLElement>(`[data-diff-index="${lineIndex}"]`)
      ?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
  }

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }), [language])

  return (
    <div className="version-history-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`tb-btn version-history-trigger ${open ? 'active' : ''}`.trim()}
        title={t(filePath ? 'versions.open' : 'versions.saveFirst')}
        aria-label={t(filePath ? 'versions.open' : 'versions.saveFirst')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-toolbar-button="versions"
        disabled={!filePath}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleMenu}
      >
        <History size={16} />
      </button>

      {open && createPortal(
        <section ref={popoverRef} className="version-history-popover" role="menu" aria-label={t('versions.title')}>
          <header className="version-history-header">
            <div>
              <strong>{t('versions.title')}</strong>
              <span>{t('versions.subtitle')}</span>
            </div>
            <button type="button" title={t('versions.close')} onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>

          <button type="button" className="version-create-button" disabled={creating} onClick={createSnapshot}>
            <Plus size={15} />
            {t(creating ? 'versions.creating' : 'versions.create')}
          </button>

          {error && <div className="version-history-error">{error}</div>}
          {loading ? (
            <div className="version-history-empty">{t('versions.loading')}</div>
          ) : snapshots.length === 0 ? (
            <div className="version-history-empty">{t('versions.empty')}</div>
          ) : (
            <div className="version-history-list">
              {snapshots.map((snapshot) => (
                <button type="button" className="version-history-item" key={snapshot.id} onClick={() => compareSnapshot(snapshot)}>
                  <Clock3 size={15} />
                  <span>
                    <strong>{dateFormatter.format(new Date(snapshot.createdAt))}</strong>
                    <small>{formatBytes(snapshot.size, language)}</small>
                  </span>
                  <GitCompareArrows size={15} />
                </button>
              ))}
            </div>
          )}
        </section>,
        document.body,
      )}

      {compared && createPortal(
        <div className="version-diff-overlay">
          <section className="version-diff-dialog" role="dialog" aria-modal="true" aria-label={t('versions.diffTitle')}>
            <header className="version-diff-header">
              <div>
                <strong>{t('versions.diffTitle')}</strong>
                <span>{dateFormatter.format(new Date(compared.snapshot.createdAt))}</span>
              </div>
              <button type="button" title={t('versions.close')} onClick={() => setCompared(null)}>
                <X size={18} />
              </button>
            </header>

            <div className="version-diff-summary">
              <span className="version-diff-compare-label">{t('versions.compareCurrent')}</span>
              <b className="version-diff-add">+{additions}</b>
              <b className="version-diff-remove">-{deletions}</b>
              <div className="version-diff-nav" aria-label={t('versions.diffNav')}>
                <button
                  type="button"
                  data-version-diff-prev
                  disabled={visibleChangeIndexes.length === 0}
                  onClick={() => jumpToDiff(-1)}
                >{t('versions.prevDiff')}</button>
                <span>{diffNavLabel}</span>
                <button
                  type="button"
                  data-version-diff-next
                  disabled={visibleChangeIndexes.length === 0}
                  onClick={() => jumpToDiff(1)}
                >{t('versions.nextDiff')}</button>
              </div>
            </div>

            <div ref={diffContentRef} className="version-diff-content">
              {diff.length === 0 ? (
                <div className="version-diff-empty">{t('versions.noChanges')}</div>
              ) : visibleDiff.map((line, index) => (
                <div
                  className={`version-diff-line is-${line.kind}${activeDiffLineIndex === index ? ' is-active' : ''}`}
                  key={`${line.kind}-${index}`}
                  data-diff-index={index}
                >
                  <span className="version-diff-number">{line.oldLine ?? ''}</span>
                  <span className="version-diff-number">{line.newLine ?? ''}</span>
                  <span className="version-diff-marker">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
                  <code>{line.text || ' '}</code>
                </div>
              ))}
              {diff.length > visibleDiff.length && (
                <div className="version-diff-truncated">{t('versions.truncated', { count: diff.length - visibleDiff.length })}</div>
              )}
            </div>

            <footer className="version-diff-actions">
              <button type="button" className="btn-secondary" onClick={() => setCompared(null)}>{t('versions.close')}</button>
              <button type="button" className="btn-primary" onClick={restoreSnapshot}>
                <RotateCcw size={15} />
                {t('versions.restore')}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}

function formatBytes(size: number, language: string) {
  if (size < 1024) return language === 'zh-CN' ? `${size} 字节` : `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}