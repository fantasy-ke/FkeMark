import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { VersionDiffDialog } from '../VersionDiffDialog'
import type { AgentFileChange } from '../../utils/agent/tools'

interface AgentChangeDialogProps {
  changes: AgentFileChange[]
  onClose: () => void
}

function noteName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function countChangedLines(before: string, after: string): number {
  const beforeLines = before ? before.split('\n').length : 0
  const afterLines = after ? after.split('\n').length : 0
  return Math.abs(afterLines - beforeLines)
}

/** 查看 Agent 本次会话写入过的文件与前后差异。 */
export function AgentChangeDialog({ changes, onClose }: AgentChangeDialogProps) {
  const { t } = useI18n()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [changes.length])

  if (changes.length === 0) return null
  const active = changes[Math.min(activeIndex, changes.length - 1)]

  return (
    <VersionDiffDialog
      title={t('ai.agent.changes.title')}
      subtitle={active.path}
      previousContent={active.before}
      currentContent={active.after}
      onClose={onClose}
      toolbar={(
        <div className="agent-change-list" role="tablist" aria-label={t('ai.agent.changes.title')}>
          {changes.map((change, index) => (
            <button
              type="button"
              role="tab"
              key={`${change.path}-${change.createdAt}`}
              aria-selected={index === activeIndex}
              className={`agent-change-item${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              <strong>{noteName(change.path)}</strong>
              <small>{t('ai.agent.changes.lines', { count: countChangedLines(change.before, change.after) })}</small>
            </button>
          ))}
        </div>
      )}
    />
  )
}
