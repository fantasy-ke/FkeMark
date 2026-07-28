import { useLayoutEffect, type RefObject } from 'react'

export const CODE_BLOCK_COLLAPSED_HEIGHT_PX = 320

const LIVE_CODE_BLOCK_SELECTOR = '.bn-block-content[data-content-type="codeBlock"]'
const PREVIEW_CODE_BLOCK_SELECTOR = '.editor-preview-inner pre:not([data-frontmatter="true"])'
const PREVIEW_SHELL_CLASS = 'code-block-collapse-shell'
const TOGGLE_CLASS = 'code-block-collapse-toggle'
const INITIAL_LAYOUT_SYNC_DELAY_MS = 120

interface CodeBlockCollapseLabels {
  expand: string
  collapse: string
}

type CodeBlockSurface = 'blocknote' | 'preview'

interface UseCodeBlockCollapseOptions {
  enabled: boolean
  liveActive: boolean
  previewActive: boolean
  liveRoot?: RefObject<HTMLElement>
  previewRoot?: RefObject<HTMLElement>
  labels: CodeBlockCollapseLabels
}

export function createCodeBlockCollapseToggle(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = TOGGLE_CLASS
  button.contentEditable = 'false'
  button.hidden = true
  button.setAttribute('data-code-block-collapse-toggle', 'true')
  button.setAttribute('aria-expanded', 'false')
  return button
}

function directToggle(block: HTMLElement): HTMLButtonElement | null {
  const child = Array.from(block.children).find((element) => element.classList.contains(TOGGLE_CLASS))
  return child?.tagName === 'BUTTON' ? child as HTMLButtonElement : null
}

function updateToggle(button: HTMLButtonElement, expanded: boolean, labels: CodeBlockCollapseLabels) {
  const label = expanded ? labels.collapse : labels.expand
  button.hidden = false
  button.setAttribute('aria-expanded', String(expanded))
  button.setAttribute('aria-label', label)
  button.title = label
}

function resetBlock(block: HTMLElement, button: HTMLButtonElement | null) {
  block.removeAttribute('data-code-block-collapsible')
  block.removeAttribute('data-code-block-expanded')
  if (button) {
    button.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }
}

function wrapPreviewCodeBlock(pre: HTMLElement): HTMLElement {
  const shell = document.createElement('div')
  shell.className = PREVIEW_SHELL_CLASS
  pre.before(shell)
  shell.append(pre, createCodeBlockCollapseToggle())
  return shell
}

function unwrapPreviewCodeBlock(shell: HTMLElement) {
  const pre = Array.from(shell.children).find((child) => child.tagName === 'PRE')
  if (pre) shell.before(pre)
  shell.remove()
}

function syncBlockNoteRoot(root: HTMLElement, labels: CodeBlockCollapseLabels): HTMLElement[] {
  const measured: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>(LIVE_CODE_BLOCK_SELECTOR).forEach((block) => {
    const pre = Array.from(block.children).find((child) => child.tagName === 'PRE') as HTMLElement | undefined
    const button = directToggle(block)
    if (!pre || !button) return

    measured.push(pre)
    if (pre.scrollHeight <= CODE_BLOCK_COLLAPSED_HEIGHT_PX) {
      resetBlock(block, button)
      return
    }

    block.setAttribute('data-code-block-collapsible', 'true')
    updateToggle(button, block.getAttribute('data-code-block-expanded') === 'true', labels)
  })
  return measured
}

function syncPreviewRoot(root: HTMLElement, labels: CodeBlockCollapseLabels): HTMLElement[] {
  const measured: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>(PREVIEW_CODE_BLOCK_SELECTOR).forEach((pre) => {
    measured.push(pre)
    const currentShell = pre.parentElement?.classList.contains(PREVIEW_SHELL_CLASS)
      ? pre.parentElement
      : null

    if (pre.scrollHeight <= CODE_BLOCK_COLLAPSED_HEIGHT_PX) {
      if (currentShell) unwrapPreviewCodeBlock(currentShell)
      return
    }

    const shell = currentShell ?? wrapPreviewCodeBlock(pre)
    const button = directToggle(shell)
    shell.setAttribute('data-code-block-collapsible', 'true')
    if (button) updateToggle(button, shell.getAttribute('data-code-block-expanded') === 'true', labels)
  })
  return measured
}

export function bindCodeBlockCollapse(
  root: HTMLElement,
  surface: CodeBlockSurface,
  labels: CodeBlockCollapseLabels,
): () => void {
  let timer: number | null = null
  const resizeObserver = new ResizeObserver(() => scheduleSync())
  const observed = new Set<HTMLElement>()

  const sync = () => {
    timer = null
    const measured = surface === 'blocknote'
      ? syncBlockNoteRoot(root, labels)
      : syncPreviewRoot(root, labels)
    const nextObserved = new Set(measured)

    observed.forEach((element) => {
      if (!nextObserved.has(element)) {
        resizeObserver.unobserve(element)
        observed.delete(element)
      }
    })
    measured.forEach((element) => {
      if (observed.has(element)) return
      observed.add(element)
      resizeObserver.observe(element)
    })
  }

  function scheduleSync(delay = 0) {
    if (timer !== null) return
    timer = window.setTimeout(sync, delay)
  }

  const handleClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>(`.${TOGGLE_CLASS}`)
    if (!button || !root.contains(button)) return
    const block = button.closest<HTMLElement>('[data-code-block-collapsible="true"]')
    if (!block) return

    event.preventDefault()
    event.stopPropagation()
    const expanded = block.getAttribute('data-code-block-expanded') !== 'true'
    if (expanded) block.setAttribute('data-code-block-expanded', 'true')
    else block.removeAttribute('data-code-block-expanded')
    updateToggle(button, expanded, labels)
  }

  root.classList.add('code-block-collapse-enabled')
  root.addEventListener('click', handleClick, true)
  const mutationObserver = new MutationObserver(() => scheduleSync())
  mutationObserver.observe(root, { childList: true, subtree: true, characterData: true })
  sync()
  scheduleSync(INITIAL_LAYOUT_SYNC_DELAY_MS)

  return () => {
    if (timer !== null) window.clearTimeout(timer)
    mutationObserver.disconnect()
    resizeObserver.disconnect()
    root.removeEventListener('click', handleClick, true)
    root.classList.remove('code-block-collapse-enabled')

    if (surface === 'blocknote') {
      root.querySelectorAll<HTMLElement>(LIVE_CODE_BLOCK_SELECTOR).forEach((block) => resetBlock(block, directToggle(block)))
    } else {
      root.querySelectorAll<HTMLElement>(`.${PREVIEW_SHELL_CLASS}`).forEach(unwrapPreviewCodeBlock)
    }
  }
}

export function useCodeBlockCollapse({
  enabled,
  liveActive,
  previewActive,
  liveRoot,
  previewRoot,
  labels,
}: UseCodeBlockCollapseOptions) {
  useLayoutEffect(() => {
    if (!enabled) return

    const cleanups: Array<() => void> = []
    if (liveActive && liveRoot?.current) {
      cleanups.push(bindCodeBlockCollapse(liveRoot.current, 'blocknote', labels))
    }
    if (previewActive && previewRoot?.current) {
      cleanups.push(bindCodeBlockCollapse(previewRoot.current, 'preview', labels))
    }

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [enabled, labels.collapse, labels.expand, liveActive, liveRoot, previewActive, previewRoot])
}
