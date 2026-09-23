import { useLayoutEffect, type RefObject } from 'react'
import { isExcalidrawLanguage, renderExcalidrawPreview } from '../../utils/markdown/excalidraw'

const PREVIEW_SELECTOR = '.editor-preview-inner pre:not([data-frontmatter="true"]), .presentation-slide-content pre:not([data-frontmatter="true"])'

function languageOf(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  const token = (code?.className ?? pre.className).split(/\s+/).find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

function sourceOf(pre: HTMLElement): string {
  return pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
}

export function bindExcalidrawDiagrams(root: HTMLElement): () => void {
  const hosts: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>(PREVIEW_SELECTOR).forEach((pre) => {
    if (!isExcalidrawLanguage(languageOf(pre))) return
    const host = document.createElement('div')
    host.className = 'excalidraw-preview-shell'
    host.contentEditable = 'false'
    const svg = renderExcalidrawPreview(sourceOf(pre))
    if (!svg) {
      host.classList.add('is-invalid')
      host.textContent = sourceOf(pre).trim() ? 'Excalidraw' : ''
    } else {
      host.innerHTML = svg
    }
    pre.before(host)
    pre.hidden = true
    hosts.push(host)
  })
  return () => {
    hosts.forEach((host) => host.remove())
    root.querySelectorAll<HTMLElement>(PREVIEW_SELECTOR).forEach((pre) => { pre.hidden = false })
  }
}

export function useExcalidrawDiagrams(options: {
  enabled: boolean
  previewRoot?: RefObject<HTMLElement | null>
  readRoot?: RefObject<HTMLElement | null>
}): void {
  const { enabled, previewRoot, readRoot } = options
  useLayoutEffect(() => {
    if (!enabled) return
    const cleanups = [previewRoot?.current, readRoot?.current]
      .filter((root): root is HTMLElement => Boolean(root))
      .map(bindExcalidrawDiagrams)
    return () => cleanups.forEach((cleanup) => cleanup())
  })
}
