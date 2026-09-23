import { translate } from '../../i18n'
import { isTauri } from '../../utils/tauri'
import {
  isExcalidrawFileRef,
  parseExcalidrawScene,
  renderExcalidrawPreview,
  resolveExcalidrawPath,
  toExcalidrawRelativePath,
} from '../../utils/markdown/excalidraw'
import {
  getExcalidrawDocDir,
  openExcalidrawEditor,
  writeExcalidrawFile,
} from './excalidrawSession'

interface ExcalidrawBlock {
  id: string
  props: { source: string }
}

interface ExcalidrawEditor {
  isEditable: boolean
  updateBlock: (id: string, update: { props: { source: string } }) => void
}

function t(key: string): string {
  const language = document.documentElement.lang === 'en' ? 'en' : 'zh-CN'
  return translate(language, key)
}

function button(label: string): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'excalidraw-block-button'
  element.textContent = label
  return element
}

async function readFile(path: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('read_file_command', { path })
}

async function pickExcalidrawFile(): Promise<string | null> {
  if (!isTauri()) return null
  const dialog = await import('@tauri-apps/plugin-dialog')
  const selected = await dialog.open({
    multiple: false,
    title: t('editor.excalidraw.openFile'),
    filters: [{ name: 'Excalidraw', extensions: ['excalidraw'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export function createExcalidrawBlockView(block: ExcalidrawBlock, editor: ExcalidrawEditor) {
  const root = document.createElement('div')
  root.className = 'excalidraw-block'
  root.setAttribute('data-excalidraw-block', 'true')
  root.contentEditable = 'false'

  const toolbar = document.createElement('div')
  toolbar.className = 'excalidraw-block-toolbar'
  const editButton = button(t('editor.excalidraw.edit'))
  const citeButton = button(t('editor.excalidraw.cite'))
  toolbar.append(editButton, citeButton)
  const preview = document.createElement('div')
  preview.className = 'excalidraw-block-preview'
  const caption = document.createElement('p')
  caption.className = 'excalidraw-block-status'
  caption.hidden = true
  const status = document.createElement('p')
  status.className = 'excalidraw-block-status'
  status.hidden = true
  root.append(toolbar, preview, caption, status)

  let currentSource = block.props.source
  let renderToken = 0

  const persist = (source: string) => {
    if (source === currentSource || !editor.isEditable) return
    currentSource = source
    editor.updateBlock(block.id, { props: { source } })
  }

  const paint = (scene: string | null, label = '') => {
    caption.hidden = !label
    caption.textContent = label
    const svg = scene ? renderExcalidrawPreview(scene) : null
    preview.classList.toggle('is-empty', !svg)
    preview.classList.toggle('is-invalid', svg === null && Boolean(scene))
    if (!svg) {
      preview.textContent = scene ? t('editor.excalidraw.invalid') : t('editor.excalidraw.empty')
      return
    }
    preview.innerHTML = svg
  }

  const loadScene = async (): Promise<string> => {
    if (!isExcalidrawFileRef(currentSource)) return currentSource
    const path = resolveExcalidrawPath(currentSource, getExcalidrawDocDir())
    if (!path) return ''
    return readFile(path)
  }

  const paintPreview = async () => {
    const token = ++renderToken
    try {
      const scene = await loadScene()
      if (token !== renderToken) return
      paint(scene, isExcalidrawFileRef(currentSource) ? currentSource.trim() : '')
    } catch {
      if (token !== renderToken) return
      paint(null)
      preview.textContent = t('editor.excalidraw.missing')
    }
  }

  editButton.addEventListener('click', () => {
    void (async () => {
      status.hidden = true
      try {
        const scene = await loadScene()
        if (!parseExcalidrawScene(scene) && scene.trim()) throw new Error('invalid')
        await openExcalidrawEditor({
          source: scene,
          editable: editor.isEditable,
          onSave: (next) => {
            const filePath = isExcalidrawFileRef(currentSource)
              ? resolveExcalidrawPath(currentSource, getExcalidrawDocDir())
              : null
            if (filePath) {
              void writeExcalidrawFile(filePath, next).then(paintPreview).catch(() => {
                status.hidden = false
                status.textContent = t('editor.excalidraw.saveFailed')
              })
              return
            }
            persist(next)
            void paintPreview()
          },
        })
      } catch {
        status.hidden = false
        status.textContent = t('editor.excalidraw.loadFailed')
      }
    })()
  })

  citeButton.addEventListener('click', () => {
    void (async () => {
      const path = await pickExcalidrawFile()
      if (!path) return
      persist(toExcalidrawRelativePath(getExcalidrawDocDir(), path))
      void paintPreview()
    })()
  })

  void paintPreview()
  return { dom: root, destroy() { renderToken += 1 } }
}
