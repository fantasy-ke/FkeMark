import type {
  ToolbarButtonConfig,
  ToolbarButtonId,
  ToolbarButtonPlacement,
  ToolbarItemId,
  ToolbarSeparatorId,
} from '../types'

export type ToolbarDropdownGroupId = Exclude<ToolbarButtonPlacement, 'toolbar' | 'hidden'>
export type ToolbarDropZone = 'toolbar' | 'hidden'

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
  { id: 'wikilink', labelKey: 'toolbar.wikilink', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'image', labelKey: 'toolbar.image', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'codeblock', labelKey: 'toolbar.codeblock', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'slash', labelKey: 'toolbar.slash', defaultPlacement: 'toolbar', defaultSeparatorBefore: false },
  { id: 'snippets', labelKey: 'snippets.open', defaultPlacement: 'hidden', defaultSeparatorBefore: false, allowedPlacements: ['toolbar', 'hidden'] },
  { id: 'spellCheck', labelKey: 'toolbar.spellCheck', defaultPlacement: 'hidden', defaultSeparatorBefore: false, allowedPlacements: ['toolbar', 'hidden'] },
  { id: 'presentation', labelKey: 'toolbar.presentation', defaultPlacement: 'hidden', defaultSeparatorBefore: false, allowedPlacements: ['toolbar', 'hidden'] },
] as const

export const TOOLBAR_SEPARATOR_IDS: readonly ToolbarSeparatorId[] = ['separator-1', 'separator-2', 'separator-3']

const TOOLBAR_BUTTON_IDS = new Set<ToolbarButtonId>(TOOLBAR_BUTTONS.map((item) => item.id))
const TOOLBAR_SEPARATOR_ID_SET = new Set<ToolbarSeparatorId>(TOOLBAR_SEPARATOR_IDS)
const TOOLBAR_ITEM_IDS = new Set<ToolbarItemId>([...TOOLBAR_BUTTON_IDS, ...TOOLBAR_SEPARATOR_IDS])
const TOOLBAR_PLACEMENTS = new Set<ToolbarButtonPlacement>(['toolbar', 'hidden', ...TOOLBAR_BUTTON_GROUPS.map((group) => group.id)])

function createDefaultToolbarItems(): ToolbarButtonConfig[] {
  let separatorIndex = 0
  const items: ToolbarButtonConfig[] = []
  for (const button of TOOLBAR_BUTTONS) {
    if (button.defaultSeparatorBefore) {
      items.push({ id: TOOLBAR_SEPARATOR_IDS[separatorIndex++], placement: button.defaultPlacement, separatorBefore: false })
    }
    items.push({ id: button.id, placement: button.defaultPlacement, separatorBefore: false })
  }
  return items
}

export const DEFAULT_TOOLBAR_ITEMS: ToolbarButtonConfig[] = createDefaultToolbarItems()

export function isToolbarButtonId(value: string): value is ToolbarButtonId {
  return TOOLBAR_BUTTON_IDS.has(value as ToolbarButtonId)
}

export function isToolbarSeparatorId(value: string): value is ToolbarSeparatorId {
  return TOOLBAR_SEPARATOR_ID_SET.has(value as ToolbarSeparatorId)
}

export function isToolbarItemId(value: string): value is ToolbarItemId {
  return TOOLBAR_ITEM_IDS.has(value as ToolbarItemId)
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

function normalizeToolbarItem(item: ToolbarButtonConfig): ToolbarButtonConfig {
  if (isToolbarSeparatorId(item.id)) {
    return {
      id: item.id,
      placement: item.placement === 'hidden' ? 'hidden' : 'toolbar',
      separatorBefore: false,
    }
  }

  const definition = getToolbarButtonDefinition(item.id)
  const placement = normalizeToolbarPlacement(item.placement)
  return {
    id: item.id,
    placement: placementAllowed(definition, placement) ? placement : definition.defaultPlacement,
    separatorBefore: false,
  }
}

function sortToolbarZones(items: ToolbarButtonConfig[]) {
  return [
    ...items.filter((item) => item.placement !== 'hidden'),
    ...items.filter((item) => item.placement === 'hidden'),
  ]
}

function resolveExplicitToolbarItems(saved: ToolbarButtonConfig[]) {
  const seen = new Set<ToolbarItemId>()
  const items: ToolbarButtonConfig[] = []
  for (const item of saved) {
    if (!item || !isToolbarItemId(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(normalizeToolbarItem(item))
  }
  for (const fallback of DEFAULT_TOOLBAR_ITEMS) {
    if (!seen.has(fallback.id)) items.push({ ...fallback })
  }
  return sortToolbarZones(items)
}

function resolveLegacyToolbarButtons(saved: ToolbarButtonConfig[]) {
  const savedById = new Map<ToolbarButtonId, ToolbarButtonConfig>()
  for (const item of saved) {
    if (item && isToolbarButtonId(item.id)) savedById.set(item.id, item)
  }

  const items: ToolbarButtonConfig[] = []
  const groupedPlacements = new Set<ToolbarDropdownGroupId>()
  let separatorIndex = 0
  for (const definition of TOOLBAR_BUTTONS) {
    const savedItem = savedById.get(definition.id)
    const placement = savedItem ? normalizeToolbarPlacement(savedItem.placement) : definition.defaultPlacement
    const resolvedPlacement = placementAllowed(definition, placement) ? placement : definition.defaultPlacement
    const groupAlreadyRendered = isToolbarGroupPlacement(resolvedPlacement) && groupedPlacements.has(resolvedPlacement)
    const shouldAddSeparator = (savedItem ? Boolean(savedItem.separatorBefore) : definition.defaultSeparatorBefore) && !groupAlreadyRendered

    if (shouldAddSeparator && separatorIndex < TOOLBAR_SEPARATOR_IDS.length) {
      items.push({
        id: TOOLBAR_SEPARATOR_IDS[separatorIndex++],
        placement: resolvedPlacement === 'hidden' ? 'hidden' : 'toolbar',
        separatorBefore: false,
      })
    }
    items.push({ id: definition.id, placement: resolvedPlacement, separatorBefore: false })
    if (isToolbarGroupPlacement(resolvedPlacement)) groupedPlacements.add(resolvedPlacement)
  }

  while (separatorIndex < TOOLBAR_SEPARATOR_IDS.length) {
    items.push({ id: TOOLBAR_SEPARATOR_IDS[separatorIndex++], placement: 'hidden', separatorBefore: false })
  }
  return sortToolbarZones(items)
}

export function resolveToolbarItems(saved?: ToolbarButtonConfig[] | null): ToolbarButtonConfig[] {
  if (!saved?.length) return DEFAULT_TOOLBAR_ITEMS.map((item) => ({ ...item }))
  return saved.some((item) => item && isToolbarSeparatorId(item.id))
    ? resolveExplicitToolbarItems(saved)
    : resolveLegacyToolbarButtons(saved)
}

export function moveToolbarItem(
  items: ToolbarButtonConfig[],
  id: ToolbarItemId,
  placement: ToolbarDropZone,
  targetIndex: number,
): ToolbarButtonConfig[] {
  const moved = items.find((item) => item.id === id)
  if (!moved) return items.map((item) => ({ ...item }))

  const sourcePlacement: ToolbarDropZone = moved.placement === 'hidden' ? 'hidden' : 'toolbar'
  const sourceItems = items.filter((item) => (item.placement === 'hidden' ? 'hidden' : 'toolbar') === sourcePlacement)
  const sourceIndex = sourceItems.findIndex((item) => item.id === id)
  const remaining = items.filter((item) => item.id !== id)
  const visible = remaining.filter((item) => item.placement !== 'hidden')
  const hidden = remaining.filter((item) => item.placement === 'hidden')
  const target = placement === 'toolbar' ? visible : hidden
  const adjustedIndex = sourcePlacement === placement && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  const index = Math.max(0, Math.min(adjustedIndex, target.length))
  target.splice(index, 0, { ...moved, placement, separatorBefore: false })
  return [...visible, ...hidden]
}
