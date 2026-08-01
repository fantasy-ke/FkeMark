import type { ReactNode } from 'react'

interface FlatGroupProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  badge?: string
}

export function FlatGroup({ title, children, badge }: FlatGroupProps) {
  return (
    <section className="settings-group">
      <div className="settings-group-heading">
        <h3 className="settings-group-title">{title}</h3>
        {badge && <span className="settings-group-badge">{badge}</span>}
      </div>
      <div className="settings-group-body">{children}</div>
    </section>
  )
}
