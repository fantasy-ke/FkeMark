import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { clearConsoleEntries, getConsoleEntries, installConsoleCapture, subscribeConsole, type ConsoleEntry } from '../utils/appConsole'

interface AppConsoleProps {
  onClose: () => void
}

function formatTime(time: number): string {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function AppConsole({ onClose }: AppConsoleProps) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<readonly ConsoleEntry[]>(() => getConsoleEntries())

  useEffect(() => {
    installConsoleCapture()
    return subscribeConsole(() => setEntries(getConsoleEntries().slice()))
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <section className="app-console" aria-label={t('sidebar.console')}>
      <header className="app-console-bar">
        <span>{t('sidebar.console')}</span>
        <span className="app-console-count">{entries.length}</span>
        <button type="button" onClick={clearConsoleEntries}>{t('sidebar.console.clear')}</button>
        <button type="button" onClick={onClose}>{t('sidebar.console.close')}</button>
      </header>
      <div className="app-console-log">
        {entries.length === 0 ? (
          <div className="app-console-empty">{t('sidebar.console.empty')}</div>
        ) : entries.map((entry) => (
          <div key={entry.id} className={`app-console-line is-${entry.level}`}>
            <span className="app-console-time">{formatTime(entry.time)}</span>
            <span className="app-console-level">{entry.level}</span>
            <span className="app-console-text">{entry.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
