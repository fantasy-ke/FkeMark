import { translate, type Lang } from '../../i18n'
import { renderMermaidSvg } from '../../utils/markdown/mermaid'

const BLOCK_ATTR = 'data-mermaid-block'
const MIN_ZOOM = 0.25
export const MAX_ZOOM = 10
const ZOOM_STEP = 1.15


type MermaidBlock = {
  id: string
  props: { source: string }
}

type MermaidEditor = {
  isEditable: boolean
  updateBlock: (id: string, update: { props: { source: string } }) => void
}

function currentLang(): Lang {
  return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'zh-CN'
}

function t(key: string): string {
  return translate(currentLang(), key)
}

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme-mode') === 'dark'
}

function button(label: string, className = 'mermaid-block-button'): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  el.textContent = label
  return el
}

function openViewer(svg: string) {
  const overlay = document.createElement('div')
  overlay.className = 'mermaid-viewer-overlay'
  overlay.setAttribute(BLOCK_ATTR, 'true')

  const dialog = document.createElement('div')
  dialog.className = 'mermaid-viewer'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', t('editor.mermaid.view'))

  const bar = document.createElement('div')
  bar.className = 'mermaid-viewer-bar'
  const zoomOut = button('−', 'mermaid-viewer-button')
  const zoomLabel = document.createElement('span')
  zoomLabel.className = 'mermaid-viewer-zoom'
  const zoomIn = button('+', 'mermaid-viewer-button')
  const reset = button(t('editor.mermaid.zoomReset'), 'mermaid-viewer-button')
  const close = button(t('editor.mermaid.close'), 'mermaid-viewer-button')
  zoomOut.setAttribute('aria-label', t('editor.mermaid.zoomOut'))
  zoomIn.setAttribute('aria-label', t('editor.mermaid.zoomIn'))
  bar.append(zoomOut, zoomLabel, zoomIn, reset, close)

  const stage = document.createElement('div')
  stage.className = 'mermaid-viewer-stage'
  const canvas = document.createElement('div')
  canvas.className = 'mermaid-viewer-canvas'
  canvas.innerHTML = svg
  stage.appendChild(canvas)
  dialog.append(bar, stage)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  let zoom = 1
  let panX = 0
  let panY = 0
  let dragging = false
  let lastX = 0
  let lastY = 0

  const apply = () => {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`
  }

  const setZoom = (next: number) => {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    apply()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return
    panX += event.clientX - lastX
    panY += event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
    apply()
  }

  const onPointerUp = () => {
    dragging = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      destroy()
    }
  }

  const destroy = () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    overlay.remove()
  }

  zoomOut.addEventListener('click', () => setZoom(zoom / ZOOM_STEP))
  zoomIn.addEventListener('click', () => setZoom(zoom * ZOOM_STEP))
  reset.addEventListener('click', () => {
    zoom = 1
    panX = 0
    panY = 0
    apply()
  })
  close.addEventListener('click', destroy)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) destroy()
  })
  stage.addEventListener('wheel', (event) => {
    event.preventDefault()
    setZoom(event.deltaY > 0 ? zoom / ZOOM_STEP : zoom * ZOOM_STEP)
  }, { passive: false })
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  })
  window.addEventListener('keydown', onKeyDown)
  apply()
  close.focus()
}

export function createMermaidBlockView(block: MermaidBlock, editor: MermaidEditor) {
  const root = document.createElement('div')
  root.className = 'mermaid-block'
  root.setAttribute(BLOCK_ATTR, 'true')
  root.contentEditable = 'false'

  const toolbar = document.createElement('div')
  toolbar.className = 'mermaid-block-toolbar'
  const editButton = button(t('editor.mermaid.edit'))
  const viewButton = button(t('editor.mermaid.view'))
  toolbar.append(editButton, viewButton)

  const preview = document.createElement('div')
  preview.className = 'mermaid-block-preview'

  const source = document.createElement('textarea')
  source.className = 'mermaid-block-source'
  source.value = block.props.source
  source.hidden = true
  source.spellcheck = false
  source.setAttribute('aria-label', t('editor.mermaid.edit'))

  const doneButton = button(t('editor.mermaid.done'))
  doneButton.hidden = true

  root.append(toolbar, preview, source, doneButton)

  let renderToken = 0
  let lastSvg = ''
  let currentSource = block.props.source

  const setEditing = (editing: boolean) => {
    root.classList.toggle('is-editing', editing)
    source.hidden = !editing
    doneButton.hidden = !editing
    preview.hidden = editing
    editButton.hidden = editing
    if (editing) source.focus()
  }

  const paint = async () => {
    const token = ++renderToken
    const text = source.value.trim()
    if (!text) {
      preview.classList.add('is-empty')
      preview.textContent = t('editor.mermaid.empty')
      lastSvg = ''
      return
    }
    preview.classList.remove('is-empty')
    preview.textContent = ''
    try {
      const svg = await renderMermaidSvg(text, isDark())
      if (token !== renderToken) return
      lastSvg = svg
      preview.innerHTML = svg || t('editor.mermaid.empty')
    } catch {
      if (token !== renderToken) return
      lastSvg = ''
      preview.classList.add('is-empty')
      preview.textContent = t('editor.mermaid.error')
    }
  }

  const saveSource = () => {
    const next = source.value
    if (next !== currentSource && editor.isEditable) {
      currentSource = next
      editor.updateBlock(block.id, { props: { source: next } })
    }
    setEditing(false)
    void paint()
  }


  editButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!editor.isEditable) return
    setEditing(true)
  })
  doneButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    saveSource()
  })
  viewButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (lastSvg) openViewer(lastSvg)
  })
  preview.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (lastSvg) openViewer(lastSvg)
  })
  source.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      source.value = currentSource
      setEditing(false)
    }

  })

  void paint()

  return {
    dom: root,
    ignoreMutation(mutation: { target: Node }) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
      return Boolean(target?.closest(`[${BLOCK_ATTR}="true"]`))
    },
    stopEvent() {
      return true
    },
    destroy() {
      renderToken += 1
    },
  }
}
