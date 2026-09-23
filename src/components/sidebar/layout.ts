/** 左侧活动栏宽度。侧栏总宽 = 可拖拽面板 + 活动栏。 */
export const SIDEBAR_RAIL_WIDTH = 40

export type SidebarView = 'files' | 'history' | 'outline' | 'backlinks'
export type SidebarSortMode = 'source' | 'name' | 'name-desc'

export function loadSidebarView(value: unknown): SidebarView {
  return value === 'outline' || value === 'backlinks' || value === 'history' || value === 'files' ? value : 'files'
}

export function folderTitle(folderPath: string | null | undefined, fallback: string): string {
  if (!folderPath) return fallback
  const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || fallback
}
