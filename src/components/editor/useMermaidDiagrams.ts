import { useLayoutEffect, type RefObject } from 'react'
import { applyReservedHeight, observeNearViewport, rememberRenderHeight } from '../../utils/markdown/heavyRender'
import { shouldRenderMermaid, renderMermaidSvg } from '../../utils/markdown/mermaid'

const LIVE_BLOCK_SELECTOR = '.bn-block-content[data-content-type="codeBlock"]'
const PREVIEW_PRE_SELECTOR = '.editor-preview-inner pre:not([data-frontmatter="true"])'
const DIAGRAM_CLASS = 'mermaid-diagram'
const PREVIEW_SHELL_CLASS = 'mermaid-preview-shell'
const COLLAPSE_SHELL_CLASS = 'code-block-collapse-shell'
const CONTROL_ATTR = 'data-mermaid-control'
const RENDERED_ATTR = 'data-mermaid-rendered'
const EDITING_ATTR = 'data-mermaid-editing'
const SYNC_DELAY_MS = 180

type MermaidSurface = 'blocknote' | 'preview'
interface MermaidMutationRecord {
  type: string
  target: Node
  addedNodes?: NodeList
  removedNodes?: NodeList
  attributeName?: string | null
}

export interface UseMermaidDiagramsOptions {
  enabled: boolean
  dark: boolean
  liveActive: boolean
  previewActive: boolean
  liveRoot?: RefObject<HTMLElement | null>
  previewRoot?: RefObject<HTMLElement | null>
  errorLabel: string
}

function isControlNode(node: Node): boolean {
  if (!(node instanceof Element)) return false
  if (node.getAttribute(CONTROL_ATTR) === 'true') return true
  if (node.classList.contains(DIAGRAM_CLASS)) return true
  return node.closest(`[${CONTROL_ATTR}="true"], .${DIAGRAM_CLASS}`) !== null
}

export function isMermaidDiagramMutation(mutation: MermaidMutationRecord): boolean {
  if (mutation.type === 'attributes') {
    if (mutation.attributeName?.startsWith('data-mermaid')) return true
    return mutation.target instanceof Element && mutation.target.closest(`[${CONTROL_ATTR}="true"], .${DIAGRAM_CLASS}`) !== null
  }
  if (mutation.type === 'childList') {
    if (isControlNode(mutation.target)) return true
    return Array.from(mutation.addedNodes ?? []).some(isControlNode)
      || Array.from(mutation.removedNodes ?? []).some(isControlNode)
  }
  return false
}

export function createMermaidDiagramHost(): HTMLElement {
  const diagram = document.createElement('div')
  diagram.className = DIAGRAM_CLASS
  diagram.contentEditable = 'false'
  diagram.hidden = true
  diagram.setAttribute(CONTROL_ATTR, 'true')
  return diagram
}

function languageFromClassName(className: string): string {
  const token = className.split(/\s+/).find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

function getLiveLanguage(block: HTMLElement): string {
  const fromData = block.getAttribute('data-language')
  if (fromData) return fromData
  const select = block.querySelector('select')
  if (select instanceof HTMLSelectElement && select.value) return select.value
  const selected = select?.selectedOptions?.[0]
  if (selected?.value) return selected.value
  const code = block.querySelector('code')
  return languageFromClassName(code?.className ?? '')
}

function getPreviewLanguage(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  return languageFromClassName(code?.className ?? pre.className)
}

function getSource(container: HTMLElement): string {
  const code = container.querySelector('code')
  if (code?.textContent) return code.textContent
  return container.querySelector('pre')?.textContent ?? ''
}

function findDiagram(host: HTMLElement): HTMLElement | null {
  const existing = Array.from(host.children).find((child) => child.classList.contains(DIAGRAM_CLASS))
  return existing instanceof HTMLElement ? existing : null
}

function ensureDiagram(host: HTMLElement): HTMLElement {
  const existing = findDiagram(host)
  if (existing) return existing
  const diagram = createMermaidDiagramHost()
  host.appendChild(diagram)
  return diagram
}

function clearDiagram(host: HTMLElement) {
  const diagram = findDiagram(host)
  if (diagram) {
    diagram.hidden = true
    diagram.classList.remove('is-error')
    diagram.replaceChildren()
  }
  host.removeAttribute(RENDERED_ATTR)
  host.removeAttribute(EDITING_ATTR)
}

function unwrapPreviewShell(shell: HTMLElement) {
  if (!shell.classList.contains(PREVIEW_SHELL_CLASS)) return
  const pre = Array.from(shell.children).find((child) => child.tagName === 'PRE')
  if (pre) shell.before(pre)
  shell.remove()
}

function getPreviewHost(pre: HTMLElement): HTMLElement {
  const parent = pre.parentElement
  if (parent?.classList.contains(COLLAPSE_SHELL_CLASS) || parent?.classList.contains(PREVIEW_SHELL_CLASS)) {
    return parent
  }
  const shell = document.createElement('div')
  shell.className = PREVIEW_SHELL_CLASS
  pre.before(shell)
  shell.appendChild(pre)
  return shell
}

function setDiagramContent(diagram: HTMLElement, html: string, isError: boolean) {
  diagram.hidden = !html
  diagram.classList.toggle('is-error', isError)
  diagram.innerHTML = html
}

function focusCode(host: HTMLElement) {
  const code = host.querySelector<HTMLElement>('code, pre')
  code?.focus()
}

async function renderInto(host: HTMLElement, source: string, dark: boolean, errorLabel: string, token: number, current: () => number) {
  try {
    const svg = await renderMermaidSvg(source, dark)
    if (token !== current()) return
    if (!svg) {
      clearDiagram(host)
      return
    }
    const diagram = ensureDiagram(host)
    setDiagramContent(diagram, svg, false)
    host.setAttribute(RENDERED_ATTR, 'true')
    rememberRenderHeight(host, source.trim())
  } catch {
    if (token !== current()) return
    const diagram = ensureDiagram(host)
    setDiagramContent(diagram, errorLabel, true)
    host.setAttribute(RENDERED_ATTR, 'error')
  }
}

export function bindMermaidDiagrams(
  root: HTMLElement,
  surface: MermaidSurface,
  dark: boolean,
  errorLabel: string,
): () => void {
  const tokens = new WeakMap<HTMLElement, number>()
  const renderedKeys = new WeakMap<HTMLElement, string>()
  const pending = new WeakMap<HTMLElement, { language: string; source: string }>()
  const watched = new WeakSet<HTMLElement>()
  const near = new WeakSet<HTMLElement>()
  const stops: Array<() => void> = []
  let timer: number | null = null

  const bump = (host: HTMLElement) => {
    const next = (tokens.get(host) ?? 0) + 1
    tokens.set(host, next)
    return next
  }

  const current = (host: HTMLElement) => tokens.get(host) ?? 0

  const renderHost = (host: HTMLElement, language: string, source: string) => {
    if (!shouldRenderMermaid(language, source)) {
      bump(host)
      renderedKeys.delete(host)
      pending.delete(host)
      clearDiagram(host)
      return
    }
    const key = `${language}\0${source}`
    const existingDiagram = findDiagram(host)
    if (renderedKeys.get(host) === key && existingDiagram && !existingDiagram.hidden) return
    renderedKeys.set(host, key)
    const token = bump(host)
    void renderInto(host, source, dark, errorLabel, token, () => current(host))
  }

  const requestRender = (host: HTMLElement, language: string, source: string) => {
    if (!shouldRenderMermaid(language, source)) {
      renderHost(host, language, source)
      return
    }
    pending.set(host, { language, source })
    applyReservedHeight(host, source.trim())
    if (surface === 'preview') host.classList.add('is-pending')
    if (near.has(host)) {
      renderHost(host, language, source)
      return
    }
    if (watched.has(host)) return
    watched.add(host)
    stops.push(observeNearViewport(host, () => {
      near.add(host)
      const next = pending.get(host)
      if (next) renderHost(host, next.language, next.source)
    }))
  }

  const syncLive = () => {
    root.querySelectorAll<HTMLElement>(LIVE_BLOCK_SELECTOR).forEach((block) => {
      requestRender(block, getLiveLanguage(block), getSource(block))
    })
  }

  const syncPreview = () => {
    root.querySelectorAll<HTMLElement>(PREVIEW_PRE_SELECTOR).forEach((pre) => {
      const language = getPreviewLanguage(pre)
      const source = pre.textContent ?? ''
      if (!shouldRenderMermaid(language, source)) {
        const parent = pre.parentElement
        if (parent?.querySelector(`:scope > .${DIAGRAM_CLASS}`)) {
          bump(parent)
          renderedKeys.delete(parent)
          clearDiagram(parent)
          unwrapPreviewShell(parent)
        }
        return
      }
      requestRender(getPreviewHost(pre), language, source)
    })
  }

  const sync = () => {
    if (surface === 'blocknote') syncLive()
    else syncPreview()
  }

  const scheduleSync = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      sync()
    }, SYNC_DELAY_MS)
  }

  const handleDiagramClick = (event: Event) => {
    if (surface !== 'blocknote') return
    const diagram = event.target instanceof Element ? event.target.closest(`.${DIAGRAM_CLASS}`) : null
    if (!diagram || !root.contains(diagram)) return
    const block = diagram.closest<HTMLElement>(LIVE_BLOCK_SELECTOR)
    if (!block) return
    block.setAttribute(EDITING_ATTR, 'true')
    focusCode(block)
  }

  const handleFocusIn = (event: Event) => {
    if (surface !== 'blocknote') return
    const block = event.target instanceof Element ? event.target.closest<HTMLElement>(LIVE_BLOCK_SELECTOR) : null
    if (block?.getAttribute(RENDERED_ATTR) === 'true') {
      block.setAttribute(EDITING_ATTR, 'true')
    }
  }

  const handleFocusOut = (event: FocusEvent) => {
    if (surface !== 'blocknote') return
    const block = event.target instanceof Element ? event.target.closest<HTMLElement>(LIVE_BLOCK_SELECTOR) : null
    if (!block) return
    const next = event.relatedTarget
    if (next instanceof Node && block.contains(next)) return
    block.removeAttribute(EDITING_ATTR)
  }

  root.classList.add('mermaid-diagrams-enabled')
  root.addEventListener('click', handleDiagramClick)
  root.addEventListener('focusin', handleFocusIn)
  root.addEventListener('focusout', handleFocusOut)
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => isMermaidDiagramMutation(mutation))) return
    scheduleSync()
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-language', 'class'],
  })
  sync()

  return () => {
    if (timer !== null) window.clearTimeout(timer)
    stops.forEach((stop) => stop())
    observer.disconnect()
    root.removeEventListener('click', handleDiagramClick)
    root.removeEventListener('focusin', handleFocusIn)
    root.removeEventListener('focusout', handleFocusOut)
    root.classList.remove('mermaid-diagrams-enabled')
    if (surface === 'blocknote') {
      root.querySelectorAll<HTMLElement>(LIVE_BLOCK_SELECTOR).forEach(clearDiagram)
    } else {
      root.querySelectorAll<HTMLElement>(`.${DIAGRAM_CLASS}`).forEach((diagram) => {
        const host = diagram.parentElement
        diagram.remove()
        host?.removeAttribute(RENDERED_ATTR)
        host?.removeAttribute(EDITING_ATTR)
        if (host) unwrapPreviewShell(host)
      })
    }
  }
}

export function useMermaidDiagrams({
  enabled,
  dark,
  liveActive,
  previewActive,
  liveRoot,
  previewRoot,
  errorLabel,
}: UseMermaidDiagramsOptions) {
  useLayoutEffect(() => {
    if (!enabled) return
    const cleanups: Array<() => void> = []
    if (liveActive && liveRoot?.current) {
      cleanups.push(bindMermaidDiagrams(liveRoot.current, 'blocknote', dark, errorLabel))
    }
    if (previewActive && previewRoot?.current) {
      cleanups.push(bindMermaidDiagrams(previewRoot.current, 'preview', dark, errorLabel))
    }
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [dark, enabled, errorLabel, liveActive, liveRoot, previewActive, previewRoot])
}
