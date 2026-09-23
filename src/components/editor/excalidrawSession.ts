import { createElement } from 'react'
import { translate } from '../../i18n'
import { isTauri } from '../../utils/tauri'
import { parseExcalidrawScene } from '../../utils/markdown/excalidraw'

type ExcalidrawChange = (
  elements: readonly unknown[],
  appState: { viewBackgroundColor?: string },
  files: Record<string, unknown>,
) => void
type ExcalidrawComponent = (props: Record<string, unknown>) => unknown

let docDir: string | null = null
let opening = false

export function setExcalidrawDocDir(next: string | null): void {
  docDir = next
}

export function getExcalidrawDocDir(): string | null {
  return docDir
}

export const INSERT_EXCALIDRAW_EVENT = 'fkemark:insert-excalidraw'

export function requestInsertExcalidraw(path: string): void {
  window.dispatchEvent(new CustomEvent(INSERT_EXCALIDRAW_EVENT, { detail: path }))
}

function t(key: string): string {
  const language = document.documentElement.lang === 'en' ? 'en' : 'zh-CN'
  return translate(language, key)
}

function sceneJson(elements: readonly unknown[], appState: { viewBackgroundColor?: string }, files: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements,
    appState: { viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff' },
    files,
  })
}

async function readFile(path: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('read_file_command', { path })
}

export async function writeExcalidrawFile(path: string, source: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_file_command', { path, content: source.endsWith('\n') ? source : `${source}\n` })
}

async function maximizeWindow(): Promise<() => Promise<void>> {
  if (!isTauri()) return async () => undefined
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const win = getCurrentWebviewWindow()
  const wasMaximized = await win.isMaximized().catch(() => true)
  if (!wasMaximized) await win.maximize().catch(() => undefined)
  return async () => {
    if (!wasMaximized) await win.unmaximize().catch(() => undefined)
  }
}

export async function openExcalidrawEditor(options: {
  source: string
  editable?: boolean
  onSave: (source: string) => void
}): Promise<void> {
  if (opening || document.querySelector('.excalidraw-editor-overlay')) return
  opening = true
  const restore = await maximizeWindow()
  const overlay = document.createElement('div')
  overlay.className = 'excalidraw-editor-overlay'
  overlay.contentEditable = 'false'
  const bar = document.createElement('div')
  bar.className = 'excalidraw-editor-bar'
  const title = document.createElement('strong')
  title.textContent = t('editor.excalidraw.edit')
  const done = document.createElement('button')
  done.type = 'button'
  done.className = 'excalidraw-block-button'
  done.textContent = t('editor.excalidraw.done')
  bar.append(title, done)
  const canvas = document.createElement('div')
  canvas.className = 'excalidraw-editor-canvas'
  overlay.append(bar, canvas)
  overlay.addEventListener('pointerdown', (event) => event.stopPropagation())
  document.body.append(overlay)

  let latest = options.source
  let closed = false
  let reactRoot: { unmount: () => void } | null = null
  const close = () => {
    if (closed) return
    closed = true
    document.removeEventListener('keydown', onKeyDown, true)
    reactRoot?.unmount()
    overlay.remove()
    opening = false
    if (options.editable !== false) options.onSave(latest)
    void restore()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  document.addEventListener('keydown', onKeyDown, true)
  done.addEventListener('click', close)

  try {
    const [{ Excalidraw }, { createRoot }] = await Promise.all([
      import('@excalidraw/excalidraw').then(async (mod) => {
        await import('@excalidraw/excalidraw/index.css')
        return { Excalidraw: mod.Excalidraw as unknown as ExcalidrawComponent }
      }),
      import('react-dom/client'),
    ])
    const scene = parseExcalidrawScene(options.source) ?? { elements: [] }
    const root = createRoot(canvas)
    reactRoot = root
    root.render(createElement(Excalidraw as never, {
      initialData: scene,
      viewModeEnabled: options.editable === false,
      langCode: document.documentElement.lang === 'en' ? 'en' : 'zh-CN',
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      onChange: ((elements, appState, files) => {
        latest = sceneJson(elements, appState, files)
      }) as ExcalidrawChange,
    }))
  } catch {
    closed = true
    overlay.remove()
    opening = false
    document.removeEventListener('keydown', onKeyDown, true)
    await restore()
    throw new Error('load-failed')
  }
}

export async function openExcalidrawFile(path: string): Promise<void> {
  const source = await readFile(path)
  await openExcalidrawEditor({
    source,
    onSave: (next) => { void writeExcalidrawFile(path, next) },
  })
}
