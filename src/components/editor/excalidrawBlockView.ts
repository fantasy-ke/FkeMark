import { createElement } from 'react'
import { translate } from '../../i18n'
import { isTauri } from '../../utils/tauri'
import { parseExcalidrawScene, renderExcalidrawPreview } from '../../utils/markdown/excalidraw'

interface ExcalidrawBlock {
  id: string
  props: { source: string }
}

interface ExcalidrawEditor {
  isEditable: boolean
  updateBlock: (id: string, update: { props: { source: string } }) => void
}

type ExcalidrawChange = (
  elements: readonly unknown[],
  appState: { viewBackgroundColor?: string },
  files: Record<string, unknown>,
) => void
type ExcalidrawComponent = (props: Record<string, unknown>) => unknown

const BLOCK_ATTR = 'data-excalidraw-block'
let excalidrawModule: Promise<{ Excalidraw: ExcalidrawComponent }> | null = null

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

function loadExcalidraw(): Promise<{ Excalidraw: ExcalidrawComponent }> {
  excalidrawModule ??= import('@excalidraw/excalidraw').then((mod) => ({
    Excalidraw: mod.Excalidraw as unknown as ExcalidrawComponent,
  }))
  return excalidrawModule
}

async function readTextFile(path: string): Promise<string> {
  const plugin = '@tauri-apps/plugin-fs'
  const { readTextFile: read } = await import(/* @vite-ignore */ plugin)
  return read(path)
}

async function writeTextFile(path: string, content: string): Promise<void> {
  const plugin = '@tauri-apps/plugin-fs'
  const { writeTextFile: write } = await import(/* @vite-ignore */ plugin)
  await write(path, content)
}

async function pickFile(mode: 'open' | 'save'): Promise<string | null> {
  if (!isTauri()) return null
  const dialog = await import('@tauri-apps/plugin-dialog')
  const selected = mode === 'open'
    ? await dialog.open({
      multiple: false,
      title: t('editor.excalidraw.openFile'),
      filters: [{ name: 'Excalidraw', extensions: ['excalidraw', 'json'] }],
    })
    : await dialog.save({
      title: t('editor.excalidraw.saveFile'),
      defaultPath: 'sketch.excalidraw',
      filters: [{ name: 'Excalidraw', extensions: ['excalidraw'] }],
    })
  return typeof selected === 'string' ? selected : null
}

export function createExcalidrawBlockView(block: ExcalidrawBlock, editor: ExcalidrawEditor) {
  const root = document.createElement('div')
  root.className = 'excalidraw-block'
  root.setAttribute(BLOCK_ATTR, 'true')
  root.contentEditable = 'false'

  const toolbar = document.createElement('div')
  toolbar.className = 'excalidraw-block-toolbar'
  const editButton = button(t('editor.excalidraw.edit'))
  const openButton = button(t('editor.excalidraw.open'))
  const saveButton = button(t('editor.excalidraw.save'))
  const doneButton = button(t('editor.excalidraw.done'))
  doneButton.hidden = true
  toolbar.append(editButton, openButton, saveButton, doneButton)

  const preview = document.createElement('div')
  preview.className = 'excalidraw-block-preview'
  const canvas = document.createElement('div')
  canvas.className = 'excalidraw-block-canvas'
  canvas.hidden = true
  const status = document.createElement('p')
  status.className = 'excalidraw-block-status'
  status.hidden = true
  root.append(toolbar, preview, canvas, status)

  let currentSource = block.props.source
  let editing = false
  let unmount: (() => void) | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const paintPreview = () => {
    const svg = renderExcalidrawPreview(currentSource)
    preview.classList.toggle('is-empty', !svg)
    preview.classList.toggle('is-invalid', svg === null)
    if (!svg) {
      preview.textContent = svg === null ? t('editor.excalidraw.invalid') : t('editor.excalidraw.empty')
      return
    }
    preview.innerHTML = svg
  }

  const persist = (source: string) => {
    if (source === currentSource || !editor.isEditable) return
    currentSource = source
    editor.updateBlock(block.id, { props: { source } })
  }

  const stopEditing = () => {
    editing = false
    canvas.hidden = true
    preview.hidden = false
    editButton.hidden = false
    doneButton.hidden = true
    unmount?.()
    unmount = null
    paintPreview()
  }

  const startEditing = async () => {
    if (!editor.isEditable || editing) return
    editing = true
    status.hidden = true
    preview.hidden = true
    canvas.hidden = false
    editButton.hidden = true
    doneButton.hidden = false
    if (unmount) return
    try {
      const [{ Excalidraw }, { createRoot }] = await Promise.all([
        loadExcalidraw(),
        import('react-dom/client'),
      ])
      const scene = parseExcalidrawScene(currentSource) ?? parseExcalidrawScene('{"elements":[]}')
      const reactRoot = createRoot(canvas)
      unmount = () => reactRoot.unmount()
      reactRoot.render(createElement(Excalidraw as never, {
        initialData: scene ?? { elements: [] },
        langCode: document.documentElement.lang === 'en' ? 'en' : 'zh-CN',
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        UIOptions: { canvasActions: { export: false, loadScene: false, saveToActiveFile: false } },
        onChange: ((elements, appState, files) => {
          const next = JSON.stringify({
            type: 'excalidraw',
            version: 2,
            source: 'https://excalidraw.com',
            elements,
            appState: { viewBackgroundColor: appState.viewBackgroundColor },
            files,
          })
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => persist(next), 240)
        }) as ExcalidrawChange,
      }))
    } catch {
      status.hidden = false
      status.textContent = t('editor.excalidraw.loadFailed')
      stopEditing()
    }
  }

  editButton.addEventListener('click', () => { void startEditing() })
  doneButton.addEventListener('click', stopEditing)
  openButton.addEventListener('click', () => {
    void (async () => {
      const path = await pickFile('open')
      if (!path) return
      try {
        const source = await readTextFile(path)
        if (!parseExcalidrawScene(source)) throw new Error('invalid')
        persist(source.trim())
        if (editing) {
          stopEditing()
          await startEditing()
        } else {
          paintPreview()
        }
      } catch {
        status.hidden = false
        status.textContent = t('editor.excalidraw.openFailed')
      }
    })()
  })
  saveButton.addEventListener('click', () => {
    void (async () => {
      const path = await pickFile('save')
      if (!path) return
      try {
        await writeTextFile(path, `${currentSource}\n`)
        status.hidden = false
        status.textContent = t('editor.excalidraw.saved')
      } catch {
        status.hidden = false
        status.textContent = t('editor.excalidraw.saveFailed')
      }
    })()
  })

  paintPreview()
  return {
    dom: root,
    destroy() {
      if (saveTimer) clearTimeout(saveTimer)
      unmount?.()
    },
  }
}
