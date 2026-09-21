import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'
import { createVersionDiff } from '../utils/versionHistory'

interface VersionDiffDialogProps {
  /** 已翻译的标题。 */
  title: string
  subtitle?: string
  previousContent: string
  currentContent: string
  onClose: () => void
  /** 标题下方的附加内容，例如切换对比文件的入口。 */
  toolbar?: ReactNode
  /** 底部除“关闭”以外的附加操作，例如恢复版本。 */
  actions?: ReactNode
}

const MAX_RENDERED_DIFF_LINES = 5000

/** 通用差异对比对话框：版本历史与 Agent 变更查看共用同一套渲染。 */
export function VersionDiffDialog({
  title,
  subtitle,
  previousContent,
  currentContent,
  onClose,
  toolbar,
  actions,
}: VersionDiffDialogProps) {
  const { t } = useI18n()
  const [activeDiffNavIndex, setActiveDiffNavIndex] = useState(-1)
  const diffContentRef = useRef<HTMLDivElement>(null)

  const diff = useMemo(
    () => createVersionDiff(previousContent, currentContent),
    [currentContent, previousContent],
  )

  useEffect(() => {
    setActiveDiffNavIndex(-1)
  }, [currentContent, previousContent])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

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

  return createPortal(
    <div className="version-diff-overlay">
      <section className="version-diff-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="version-diff-header">
          <div>
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" title={t('versions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {toolbar}

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
          {actions}
          <button type="button" className="btn-secondary" onClick={onClose}>{t('versions.close')}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
