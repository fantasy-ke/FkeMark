export const BLOCK_SELECTOR = '[data-node-type="blockContainer"][data-id]'
export const BLOCK_OUTER_SELECTOR = '[data-node-type="blockOuter"]'
export const RAIL_HEIGHT = 28
export const RAIL_GAP = 6
export const HEADING_COLLAPSED_ATTR = 'data-heading-collapsed'
export const HEADING_COLLAPSE_STYLE_ATTR = 'data-heading-collapse-style'
export const HEADING_SECTION_HIDDEN_ATTR = 'data-heading-section-hidden'

export type BlockPosition = {
  blockId: string
  top: number
  left: number
  isHeading: boolean
}

function escapeAttrValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function getBlockContentEl(block: HTMLElement): HTMLElement {
  return block.querySelector<HTMLElement>(':scope > .bn-block-content')
    ?? block.querySelector<HTMLElement>(':scope > .bn-block > .bn-block-content')
    ?? block
}

export function getBlockOuter(block: HTMLElement): HTMLElement {
  if (block.parentElement?.getAttribute('data-node-type') === 'blockOuter') return block.parentElement
  return block.closest<HTMLElement>(BLOCK_OUTER_SELECTOR) ?? block
}

export function findBlockById(root: HTMLElement, blockId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`${BLOCK_SELECTOR}[data-id="${escapeAttrValue(blockId)}"]`)
}

export function getHeadingLevel(block: HTMLElement): number | null {
  const content = getBlockContentEl(block)
  if (content.getAttribute('data-content-type') !== 'heading') return null
  const level = Number(content.getAttribute('data-level') || '1')
  return Number.isFinite(level) && level > 0 ? level : 1
}

export function getBlockPosition(block: HTMLElement, scroll: HTMLElement): BlockPosition | null {
  const blockId = block.dataset.id
  if (!blockId) return null
  const content = getBlockContentEl(block)
  const contentRect = content.getBoundingClientRect()
  const scrollRect = scroll.getBoundingClientRect()
  // 按首行高度对齐，避免长段落把按钮拉到块中间。
  const alignHeight = Math.min(contentRect.height, RAIL_HEIGHT + 6)
  return {
    blockId,
    isHeading: getHeadingLevel(block) !== null,
    top: contentRect.top - scrollRect.top + scroll.scrollTop + Math.max(0, (alignHeight - RAIL_HEIGHT) / 2),
    // 右边缘对齐内容左边缘，再靠 CSS padding-right 留出间隙，避免按钮叠到正文上。
    left: contentRect.left - scrollRect.left + scroll.scrollLeft,
  }
}

export function getHeadingSectionBlocks(heading: HTMLElement): HTMLElement[] {
  const level = getHeadingLevel(heading)
  if (level === null) return []
  const section: HTMLElement[] = []
  let sibling = getBlockOuter(heading).nextElementSibling
  while (sibling instanceof HTMLElement) {
    const siblingBlock = sibling.matches(BLOCK_SELECTOR)
      ? sibling
      : sibling.querySelector<HTMLElement>(`:scope > ${BLOCK_SELECTOR}`)
    if (siblingBlock) {
      const siblingLevel = getHeadingLevel(siblingBlock)
      if (siblingLevel !== null && siblingLevel <= level) break
      section.push(siblingBlock)
    }
    sibling = sibling.nextElementSibling
  }
  return section
}

function headingCollapseStyle(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(`style[${HEADING_COLLAPSE_STYLE_ATTR}]`)
  if (existing) return existing
  const style = document.createElement('style')
  style.setAttribute(HEADING_COLLAPSE_STYLE_ATTR, 'true')
  document.head.appendChild(style)
  return style
}

function collapseSelectorForBlock(block: HTMLElement): string | null {
  const blockId = block.dataset.id
  if (!blockId) return null
  const escaped = escapeAttrValue(blockId)
  const outer = getBlockOuter(block)
  if (outer !== block && outer.getAttribute('data-node-type') === 'blockOuter') {
    return `${BLOCK_OUTER_SELECTOR}:has(> ${BLOCK_SELECTOR}[data-id="${escaped}"])`
  }
  return `${BLOCK_SELECTOR}[data-id="${escaped}"]`
}

export function applyHeadingCollapsedState(root: HTMLElement | null, collapsedIds: ReadonlySet<string>) {
  if (!root) return
  const style = headingCollapseStyle()
  const scope = `[${HEADING_COLLAPSE_STYLE_ATTR}="true"]`
  const selectors: string[] = []
  for (const id of collapsedIds) {
    const heading = findBlockById(root, id)
    if (!heading || getHeadingLevel(heading) === null) continue
    selectors.push(`${scope} ${BLOCK_SELECTOR}[data-id="${escapeAttrValue(id)}"] > .bn-block-group`)
    for (const block of getHeadingSectionBlocks(heading)) {
      const selector = collapseSelectorForBlock(block)
      if (selector) selectors.push(`${scope} ${selector}`)
    }
  }
  // 样式挂在 document.head，避免改 ProseMirror/React 子树导致回环卡死。
  style.textContent = selectors.length > 0
    ? `${selectors.join(',\n')}{display:none !important;}`
    : ''
  if (selectors.length > 0) root.setAttribute(HEADING_COLLAPSE_STYLE_ATTR, 'true')
  else root.removeAttribute(HEADING_COLLAPSE_STYLE_ATTR)
}


function isBlockTreeNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false
  const type = node.getAttribute('data-node-type')
  return type === 'blockOuter' || type === 'blockContainer' || type === 'blockGroup'
}

export function headingCollapseNeedsRestamp(mutations: Array<{ type: string; addedNodes?: NodeList; removedNodes?: NodeList }>): boolean {
  return mutations.some((mutation) => {
    if (mutation.type !== 'childList') return false
    return Array.from(mutation.addedNodes ?? []).some(isBlockTreeNode)
      || Array.from(mutation.removedNodes ?? []).some(isBlockTreeNode)
  })
}
