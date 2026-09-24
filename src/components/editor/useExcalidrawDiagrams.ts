import { useLayoutEffect, type RefObject } from 'react'
import { observeNearViewport } from '../../utils/markdown/heavyRender'
import { isExcalidrawFileRef, isExcalidrawLanguage, renderExcalidrawPreview, resolveExcalidrawPath } from '../../utils/markdown/excalidraw'

const PREVIEW_SELECTOR = '.editor-preview-inner pre:not([data-frontmatter="true"]), .presentation-slide-content pre:not([data-frontmatter="true"])'

function languageOf(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  const token = (code?.className ?? pre.className).split(/\s+/).find((name) => name.startsWith('language-'))
  return token ? token.slice('language-'.length) : ''
}

function sourceOf(pre: HTMLElement): string {
  return pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
}

async function sceneFromSource(source: string, docDir?: string | null): Promise<string> {
  if (!isExcalidrawFileRef(source)) return source
  const path = resolveExcalidrawPath(source, docDir ?? null)
  if (!path) return ''
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('read_file_command', { path })
}

export function bindExcalidrawDiagrams(root: HTMLElement, docDir?: string | null): () => void {
  const hosts: HTMLElement[] = []
  const stops: Array<() => void> = []
  let cancelled = false
  root.querySelectorAll<HTMLElement>(PREVIEW_SELECTOR).forEach((pre) => {
    if (!isExcalidrawLanguage(languageOf(pre))) return
    const host = document.createElement('div')
    host.className = 'excalidraw-preview-shell'
    host.contentEditable = 'false'
    const source = sourceOf(pre)
    const paint = (scene: string) => {
      const svg = renderExcalidrawPreview(scene)
      if (!svg) {
        host.classList.add('is-invalid')
        host.textContent = source.trim() ? 'Excalidraw' : ''
        return
      }
      host.classList.remove('is-invalid')
      host.innerHTML = svg
    }
    host.classList.add('is-pending')
    pre.before(host)
    pre.hidden = true
    hosts.push(host)
    stops.push(observeNearViewport(host, () => {
      if (cancelled) return
      host.classList.remove('is-pending')
      paint(isExcalidrawFileRef(source) ? '' : source)
      if (!isExcalidrawFileRef(source)) return
      void sceneFromSource(source, docDir).then((scene) => {
        if (!cancelled) paint(scene)
      }).catch(() => {
        if (!cancelled) host.classList.add('is-invalid')
      })
    }))
  })
  return () => {
    cancelled = true
    stops.forEach((stop) => stop())
    hosts.forEach((host) => host.remove())
    root.querySelectorAll<HTMLElement>(PREVIEW_SELECTOR).forEach((pre) => { pre.hidden = false })
  }
}

export function useExcalidrawDiagrams(options: {
  enabled: boolean
  docDir?: string | null
  previewRoot?: RefObject<HTMLElement | null>
  readRoot?: RefObject<HTMLElement | null>
}): void {
  const { enabled, docDir, previewRoot, readRoot } = options
  useLayoutEffect(() => {
    if (!enabled) return
    const cleanups = [previewRoot?.current, readRoot?.current]
      .filter((root): root is HTMLElement => Boolean(root))
      .map((root) => bindExcalidrawDiagrams(root, docDir))
    return () => cleanups.forEach((cleanup) => cleanup())
  })
}
