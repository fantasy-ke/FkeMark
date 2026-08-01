import { useLayoutEffect, type RefObject } from 'react'

import { isTauri } from '../../utils/tauri'
import { notifyError } from '../../utils/toast'

export const CODE_BLOCK_COLLAPSED_HEIGHT_PX = 320

const LIVE_CODE_BLOCK_SELECTOR = '.bn-block-content[data-content-type="codeBlock"]'
const PREVIEW_CODE_BLOCK_SELECTOR = '.editor-preview-inner pre:not([data-frontmatter="true"])'
const PREVIEW_SHELL_CLASS = 'code-block-collapse-shell'
const TOGGLE_CLASS = 'code-block-collapse-toggle'
const COPY_BUTTON_CLASS = 'code-block-copy-button'
const CODE_BLOCK_CONTROL_ATTR = 'data-code-block-control'
const COPY_SUCCESS_RESET_DELAY_MS = 1200
const INITIAL_LAYOUT_SYNC_DELAY_MS = 120
const COPY_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <rect x="9" y="7" width="10" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
  <path d="M6 15V5a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
</svg>`
const copyResetTimers = new WeakMap<HTMLButtonElement, number>()

interface CodeBlockControlLabels {
  expand: string
  collapse: string
  copy: string
  copied: string
  copyFailed: string
}

type CodeBlockSurface = 'blocknote' | 'preview'
interface CodeBlockMutationRecord {
  type: string
  target: Node
  addedNodes?: NodeList
  removedNodes?: NodeList
}

interface UseCodeBlockCollapseOptions {
  enabled: boolean
  liveActive: boolean
  previewActive: boolean
  liveRoot?: RefObject<HTMLElement>
  previewRoot?: RefObject<HTMLElement>
  labels: CodeBlockControlLabels
}

function markCodeBlockControl(button: HTMLButtonElement) {
  button.contentEditable = 'false'
  button.setAttribute(CODE_BLOCK_CONTROL_ATTR, 'true')
}

export function createCodeBlockCollapseToggle(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = TOGGLE_CLASS
  button.hidden = true
  button.setAttribute('data-code-block-collapse-toggle', 'true')
  button.setAttribute('aria-expanded', 'false')
  markCodeBlockControl(button)
  return button
}

export function createCodeBlockCopyButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = COPY_BUTTON_CLASS
  button.insertAdjacentHTML('beforeend', COPY_ICON)
  button.setAttribute('data-code-block-copy-button', 'true')
  markCodeBlockControl(button)
  return button
}

function isCodeBlockControlNode(node: Node): boolean {
  if (!(node instanceof Element)) return false
  if (node.getAttribute(CODE_BLOCK_CONTROL_ATTR) === 'true') return true
  return node.querySelector(`[${CODE_BLOCK_CONTROL_ATTR}="true"]`) !== null
}

export function isCodeBlockControlMutation(mutation: CodeBlockMutationRecord): boolean {
  if (mutation.type === 'attributes') {
    return mutation.target instanceof Element
      && mutation.target.closest(`[${CODE_BLOCK_CONTROL_ATTR}="true"]`) !== null
  }

  if (mutation.type === 'childList') {
    return Array.from(mutation.addedNodes ?? []).some(isCodeBlockControlNode)
      || Array.from(mutation.removedNodes ?? []).some(isCodeBlockControlNode)
  }

  return false
}

function directButton(block: HTMLElement, className: string): HTMLButtonElement | null {
  const child = Array.from(block.children).find((element) => element.classList.contains(className))
  return child?.tagName === 'BUTTON' ? child as HTMLButtonElement : null
}

function directToggle(block: HTMLElement): HTMLButtonElement | null {
  return directButton(block, TOGGLE_CLASS)
}

function directCopyButton(block: HTMLElement): HTMLButtonElement | null {
  return directButton(block, COPY_BUTTON_CLASS)
}

function findCopyButton(block: HTMLElement): HTMLButtonElement | null {
  return directCopyButton(block) ?? block.querySelector<HTMLButtonElement>(`.${COPY_BUTTON_CLASS}`)
}

function placeCopyButton(block: HTMLElement, button: HTMLButtonElement) {
  if (button.parentElement !== block) block.appendChild(button)
}

function ensureToggle(block: HTMLElement): HTMLButtonElement {
  const button = directToggle(block) ?? createCodeBlockCollapseToggle()
  if (!button.parentElement) block.appendChild(button)
  return button
}

function ensureCopyButton(block: HTMLElement, labels: CodeBlockControlLabels): HTMLButtonElement {
  const button = findCopyButton(block) ?? createCodeBlockCopyButton()
  placeCopyButton(block, button)
  if (button.getAttribute('data-code-block-copy-state') !== 'copied') {
    button.setAttribute('aria-label', labels.copy)
    button.title = labels.copy
  }
  return button
}

function updateToggle(button: HTMLButtonElement, expanded: boolean, labels: CodeBlockControlLabels) {
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

function ensurePreviewCodeBlockShell(pre: HTMLElement): HTMLElement {
  const currentShell = pre.parentElement?.classList.contains(PREVIEW_SHELL_CLASS)
    ? pre.parentElement
    : null
  if (currentShell) return currentShell

  const shell = document.createElement('div')
  shell.className = PREVIEW_SHELL_CLASS
  pre.before(shell)
  shell.append(pre, createCodeBlockCollapseToggle(), createCodeBlockCopyButton())
  return shell
}

function unwrapPreviewCodeBlock(shell: HTMLElement) {
  const pre = Array.from(shell.children).find((child) => child.tagName === 'PRE')
  if (pre) shell.before(pre)
  shell.remove()
}

function directPre(block: HTMLElement): HTMLElement | null {
  const pre = Array.from(block.children).find((child) => child.tagName === 'PRE')
  return pre instanceof HTMLElement ? pre : null
}

function syncBlockNoteRoot(
  root: HTMLElement,
  labels: CodeBlockControlLabels,
  collapseEnabled: boolean,
): HTMLElement[] {
  const measured: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>(LIVE_CODE_BLOCK_SELECTOR).forEach((block) => {
    const pre = directPre(block)
    if (!pre) return

    ensureCopyButton(block, labels)
    const button = ensureToggle(block)
    if (!collapseEnabled) {
      resetBlock(block, button)
      return
    }

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

function syncPreviewRoot(
  root: HTMLElement,
  labels: CodeBlockControlLabels,
  collapseEnabled: boolean,
): HTMLElement[] {
  const measured: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>(PREVIEW_CODE_BLOCK_SELECTOR).forEach((pre) => {
    const shell = ensurePreviewCodeBlockShell(pre)
    ensureCopyButton(shell, labels)
    const button = ensureToggle(shell)
    if (!collapseEnabled) {
      resetBlock(shell, button)
      return
    }

    measured.push(pre)
    if (pre.scrollHeight <= CODE_BLOCK_COLLAPSED_HEIGHT_PX) {
      resetBlock(shell, button)
      return
    }

    shell.setAttribute('data-code-block-collapsible', 'true')
    updateToggle(button, shell.getAttribute('data-code-block-expanded') === 'true', labels)
  })
  return measured
}

async function writeClipboardText(text: string) {
  try {
    if (isTauri()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeText(text)
      return
    }
  } catch {
    // Tauri 剪贴板 API 失败，继续尝试其他方案。
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // 忽略 Clipboard API 失败，继续使用回退命令。
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand?.('copy') ?? false
  textarea.remove()
  if (!copied) throw new Error('copy failed')
}

function getCodeTextFromButton(button: HTMLButtonElement): string {
  const host = button.closest<HTMLElement>(`${LIVE_CODE_BLOCK_SELECTOR}, .${PREVIEW_SHELL_CLASS}`)
  const pre = host?.querySelector<HTMLElement>('pre')
  const code = pre?.querySelector<HTMLElement>('code')
  return code?.textContent ?? pre?.textContent ?? ''
}

function resetCopyButton(button: HTMLButtonElement, labels: CodeBlockControlLabels) {
  copyResetTimers.delete(button)
  if (!button.isConnected) return
  button.removeAttribute('data-code-block-copy-state')
  button.setAttribute('aria-label', labels.copy)
  button.title = labels.copy
}

async function copyCodeFromButton(button: HTMLButtonElement, labels: CodeBlockControlLabels) {
  const prevTimer = copyResetTimers.get(button)
  if (prevTimer !== undefined) {
    window.clearTimeout(prevTimer)
    copyResetTimers.delete(button)
  }

  try {
    await writeClipboardText(getCodeTextFromButton(button))
  } catch (error) {
    resetCopyButton(button, labels)
    throw error
  }

  button.setAttribute('data-code-block-copy-state', 'copied')
  button.setAttribute('aria-label', labels.copied)
  button.title = labels.copied
  const timer = window.setTimeout(() => {
    resetCopyButton(button, labels)
  }, COPY_SUCCESS_RESET_DELAY_MS)
  copyResetTimers.set(button, timer)
}

export function bindCodeBlockCollapse(
  root: HTMLElement,
  surface: CodeBlockSurface,
  labels: CodeBlockControlLabels,
  collapseEnabled = true,
): () => void {
  let timer: number | null = null
  const resizeObserver = new ResizeObserver(() => scheduleSync())
  const observed = new Set<HTMLElement>()

  const sync = () => {
    timer = null
    const measured = surface === 'blocknote'
      ? syncBlockNoteRoot(root, labels, collapseEnabled)
      : syncPreviewRoot(root, labels, collapseEnabled)
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

  const handleControlPointerDown = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>(`.${TOGGLE_CLASS}, .${COPY_BUTTON_CLASS}`)
    if (!button || !root.contains(button)) return
    event.preventDefault()
    event.stopPropagation()
  }

  const handleClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const copyButton = target.closest<HTMLButtonElement>(`.${COPY_BUTTON_CLASS}`)
    if (copyButton && root.contains(copyButton)) {
      event.preventDefault()
      event.stopPropagation()
      void copyCodeFromButton(copyButton, labels).catch(() => {
        notifyError(labels.copyFailed)
      })
      return
    }

    const button = target.closest<HTMLButtonElement>(`.${TOGGLE_CLASS}`)
    if (!collapseEnabled || !button || !root.contains(button)) return
    const block = button.closest<HTMLElement>('[data-code-block-collapsible="true"]')
    if (!block) return

    event.preventDefault()
    event.stopPropagation()
    const expanded = block.getAttribute('data-code-block-expanded') !== 'true'
    if (expanded) block.setAttribute('data-code-block-expanded', 'true')
    else block.removeAttribute('data-code-block-expanded')
    updateToggle(button, expanded, labels)
  }

  root.classList.add('code-block-copy-enabled')
  if (collapseEnabled) root.classList.add('code-block-collapse-enabled')
  root.addEventListener('mousedown', handleControlPointerDown, true)
  root.addEventListener('click', handleClick, true)
  const mutationObserver = new MutationObserver(() => scheduleSync())
  mutationObserver.observe(root, { childList: true, subtree: true, characterData: true })
  sync()
  scheduleSync(INITIAL_LAYOUT_SYNC_DELAY_MS)

  return () => {
    if (timer !== null) window.clearTimeout(timer)
    mutationObserver.disconnect()
    resizeObserver.disconnect()
    root.removeEventListener('mousedown', handleControlPointerDown, true)
    root.removeEventListener('click', handleClick, true)
    root.classList.remove('code-block-copy-enabled', 'code-block-collapse-enabled')

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
    const cleanups: Array<() => void> = []
    if (liveActive && liveRoot?.current) {
      cleanups.push(bindCodeBlockCollapse(liveRoot.current, 'blocknote', labels, enabled))
    }
    if (previewActive && previewRoot?.current) {
      cleanups.push(bindCodeBlockCollapse(previewRoot.current, 'preview', labels, enabled))
    }

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [enabled, labels.collapse, labels.copied, labels.copy, labels.copyFailed, labels.expand, liveActive, liveRoot, previewActive, previewRoot])
}
