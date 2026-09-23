import type { SidebarView } from './layout'

interface ActivityRailProps {
  active: SidebarView
  onChange: (view: SidebarView) => void
  onOpenGraph?: () => void
  onOpenRecycleBin?: () => void
  onOpenSettings?: () => void
  onToggleConsole?: () => void
  consoleOpen?: boolean
  labels: Record<SidebarView | 'graph' | 'recycle' | 'settings' | 'console', string>
}

function RailIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const ICONS: Record<SidebarView, string> = {
  files: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  outline: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  backlinks: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

export function ActivityRail({ active, onChange, onOpenGraph, onOpenRecycleBin, onOpenSettings, onToggleConsole, consoleOpen = false, labels }: ActivityRailProps) {
  const views: SidebarView[] = ['files', 'outline', 'backlinks']
  return (
    <nav className="sidebar-rail" aria-label={labels.files}>
      {views.map((view) => (
        <button
          key={view}
          type="button"
          className={`sidebar-rail-btn ${active === view ? 'active' : ''}`}
          title={labels[view]}
          aria-label={labels[view]}
          aria-pressed={active === view}
          onClick={() => onChange(view)}
        >
          <RailIcon d={ICONS[view]} />
        </button>
      ))}
      <span className="sidebar-rail-spacer" />
      {onToggleConsole && (
        <button
          type="button"
          className={`sidebar-rail-btn ${consoleOpen ? 'active' : ''}`}
          title={labels.console}
          aria-label={labels.console}
          aria-pressed={consoleOpen}
          onClick={onToggleConsole}
        >
          <RailIcon d="M4 17l6-5-6-5M12 19h8" />
        </button>
      )}
      {onOpenGraph && (
        <button type="button" className="sidebar-rail-btn" title={labels.graph} aria-label={labels.graph} onClick={onOpenGraph}>
          <RailIcon d="M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9v3M7.5 15.5 10 13M16.5 15.5 14 13" />
        </button>
      )}
      {onOpenRecycleBin && (
        <button type="button" className="sidebar-rail-btn" title={labels.recycle} aria-label={labels.recycle} onClick={onOpenRecycleBin}>
          <RailIcon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </button>
      )}
      {onOpenSettings && (
        <button type="button" className="sidebar-rail-btn" title={labels.settings} aria-label={labels.settings} onClick={onOpenSettings}>
          <RailIcon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </button>
      )}
    </nav>
  )
}
