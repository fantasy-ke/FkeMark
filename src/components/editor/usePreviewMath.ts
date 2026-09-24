import { useLayoutEffect, type RefObject } from 'react'
import { observeNearViewport } from '../../utils/markdown/heavyRender'
import { hydrateMathElement } from '../../utils/markdown/katexRender'

export function bindPreviewMath(root: HTMLElement): () => void {
  const stops: Array<() => void> = []
  const watched = new WeakSet<HTMLElement>()

  const watch = (element: HTMLElement) => {
    if (watched.has(element) || element.classList.contains('fk-math-rendered')) return
    watched.add(element)
    stops.push(observeNearViewport(element, () => hydrateMathElement(element)))
  }

  root.querySelectorAll<HTMLElement>('.fk-math[data-tex]').forEach(watch)
  const observer = new MutationObserver(() => {
    root.querySelectorAll<HTMLElement>('.fk-math[data-tex]').forEach(watch)
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    stops.forEach((stop) => stop())
  }
}

export function usePreviewMath(enabled: boolean, root: RefObject<HTMLElement | null> | undefined, html: string) {
  useLayoutEffect(() => {
    if (!enabled || !root?.current || !html.includes('fk-math')) return
    return bindPreviewMath(root.current)
  }, [enabled, html, root])
}
