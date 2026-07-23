import type { ReactNode } from 'react'

interface FlatGroupProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  badge?: string
}

// ??????????????????title/badge/defaultOpen ????????????????
export function FlatGroup({ children }: FlatGroupProps) {
  return (
    <div className="settings-group">
      <div className="settings-group-body">{children}</div>
    </div>
  )
}
