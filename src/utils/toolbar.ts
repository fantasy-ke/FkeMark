import type { ToolbarButtonConfig, ToolbarButtonId, ToolbarButtonPlacement } from '../types'

export type ToolbarDropdownGroupId = Exclude<ToolbarButtonPlacement, 'toolbar' | 'hidden'>

export interface ToolbarButtonDefinition {
  id: ToolbarButtonId
  labelKey: string
  defaultPlacement: ToolbarButtonPlacement
  defaultSeparatorBefore: boolean
  allowedPlacements?: readonly ToolbarButtonPlacement[]
}

export const TOOLBAR_BUTTON_GROUPS: readonly { id: ToolbarDropdownGroupId; labelKey: string; icon: string }[] = [
  { id: 'format', labelKey: 'settings.toolbarGroup.format', icon: 'Aa' },
  { id: 'block', labelKey: 'settings.toolbarGroup.block', icon: '\u00B6' },
  { id: 'insert', labelKey: 'settings.toolbarGroup.insert', icon: '+' },
  { id: 'utility', labelKey: 'settings.toolbarGroup.utility', icon: '\u22EF' },
] as const

export const TOOLBAR_BUTTONS: readonly ToolbarButtonDefinition[] = [
  { id: 'heading', labelKey: 'toolbar.heading', defaultPlacement: 'toolbar', defaultSeparatorBefore: false, allowedPlacements: ['toolbar', 'hidden'] },
  { id: 'bold', labelKey: 'toolbar.bold', defaultPlacement: 'toolbar', defaultSeparatorBefore: true },
  { id: 'italic', labelKey: 'toolbar.italic', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'strike', labelKey: 'toolbar.strike', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'code', labelKey: 'toolbar.code', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'quote', labelKey: 'toolbar.quote', defaultPlacement: 'toolbar', defaultSeparatorBefore: true },
  { id: 'ul', labelKey: 'toolbar.ul', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'ol', labelKey: 'toolbar.ol', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'todo', labelKey: 'toolbar.todo', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'hr', labelKey: 'toolbar.hr', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'table', labelKey: 'toolbar.table', defaultPlacement: 'toolbar', defaultSeparatorBefore: true },
  { id: 'link', labelKey: 'toolbar.link', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'image', labelKey: 'toolbar.image', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'codeblock', labelKey: 'toolbar.codeblock', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'slash', labelKey: 'toolbar.slash', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
] as const

const TOOLBAR_BUTTON_IDS = new Set<ToolbarButtonId>(TOOLBAR_BUTTONS.map((item) => item.id))
const TOOLBAR_PLACEMENTS = new Set<ToolbarButtonPlacement>(['toolbar', 'hidden', ...TOOLBAR_BUTTON_GROUPS.map((group) => group.id)])

export const DEFAULT_TOOLBAR_BUTTONS: ToolbarButtonConfig[] = TOOLBAR_BUTTONS.map((item) => ({
  id: item.id,
  placement: item.defaultPlacement,
  separatorBefore: item.defaultSeparatorBefore,
}))

export function isToolbarButtonId(value: string): value is ToolbarButtonId {
  return TOOLBAR_BUTTON_IDS.has(value as ToolbarButtonId)
}

export function isToolbarGroupPlacement(value: string): value is ToolbarDropdownGroupId {
  return TOOLBAR_BUTTON_GROUPS.some((group) => group.id === value)
}

export function normalizeToolbarPlacement(value: string): ToolbarButtonPlacement {
  return TOOLBAR_PLACEMENTS.has(value as ToolbarButtonPlacement) ? value as ToolbarButtonPlacement : 'toolbar'
}

export function getToolbarButtonDefinition(id: ToolbarButtonId): ToolbarButtonDefinition {
  return TOOLBAR_BUTTONS.find((item) => item.id === id) || TOOLBAR_BUTTONS[0]
}

function placementAllowed(definition: ToolbarButtonDefinition, placement: ToolbarButtonPlacement) {
  return (definition.allowedPlacements || Array.from(TOOLBAR_PLACEMENTS)).includes(placement)
}

export function resolveToolbarButtons(saved?: ToolbarButtonConfig[] | null): ToolbarButtonConfig[] {
  const savedById = new Map<ToolbarButtonId, ToolbarButtonConfig>()
  for (const item of saved || []) {
    if (item && isToolbarButtonId(item.id)) savedById.set(item.id, item)
  }

  return DEFAULT_TOOLBAR_BUTTONS.map((fallback) => {
    const definition = getToolbarButtonDefinition(fallback.id)
    const savedItem = savedById.get(fallback.id)
    if (!savedItem) return { ...fallback }

    const placement = normalizeToolbarPlacement(savedItem.placement)
    return {
      id: fallback.id,
      placement: placementAllowed(definition, placement) ? placement : fallback.placement,
      separatorBefore: Boolean(savedItem.separatorBefore),
    }
  })
}
