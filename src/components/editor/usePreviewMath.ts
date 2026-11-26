import { useLayoutEffect, type RefObject } from 'react'
import { observeNearViewport } from '../../utils/markdown/heavyRender'
import { hydrateMathElement, loadKatexRenderer } from '../../utils/markdown/katexRender'

export function usePreviewMath(enabled: boolean, root: RefObject<HTMLElement | null>, html: string, eager = false) {
  useLayoutEffect(() => {
    const container = root.current
    if (!enabled || !container || !html.includes('class="fk-math fk-math-')) return
    const stops: Array<() => void> = []
    let active = true
    for (const element of container.querySelectorAll<HTMLElement>('.fk-math[data-tex]:not(.fk-math-rendered)')) {
      const render = () => {
        void loadKatexRenderer().then((renderKatexHtml) => {
          if (active && container.contains(element)) hydrateMathElement(element, renderKatexHtml)
        }, () => { /* 加载失败时保留公式源码。 */ })
      }
      if (eager) render()
      else stops.push(observeNearViewport(element, render))
    }
    return () => {
      active = false
      stops.forEach((stop) => stop())
    }
  }, [eager, enabled, html, root])
}
