import { act, createElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openExcalidrawEditor } from '../src/components/editor/excalidrawSession'

const nativeWindow = vi.hoisted(() => ({
  isMaximized: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({ getCurrentWebviewWindow: () => nativeWindow }))
vi.mock('@excalidraw/excalidraw/index.css', () => ({}))

const source = '{"elements":[]}'
const elements = [{ id: 'shape', type: 'rectangle' }]
const overlay = () => document.querySelector('.excalidraw-editor-overlay')
const escape = () => act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}

function Board({ onChange }: { onChange: (elements: unknown[], state: object, files: object) => void }) {
  return createElement('button', {
    onClick: () => onChange(elements, { viewBackgroundColor: '#010203' }, {}),
  }, '更新场景')
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  nativeWindow.isMaximized.mockReset().mockResolvedValue(true)
  nativeWindow.maximize.mockReset().mockResolvedValue(undefined)
  nativeWindow.unmaximize.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  escape()
  vi.unstubAllGlobals()
})

it('在画板加载期间按 Escape 时保存原场景，不挂载已移除的画板', async () => {
  const load = deferred<void>()
  vi.doMock('@excalidraw/excalidraw', async () => {
    await load.promise
    return { Excalidraw: Board }
  })
  const onSave = vi.fn()
  const opening = openExcalidrawEditor({ source, onSave })
  const canvas = await vi.waitFor(() => {
    const canvas = overlay()?.querySelector('.excalidraw-editor-canvas')
    expect(canvas).toBeTruthy()
    return canvas!
  })

  escape()
  load.resolve()
  await act(async () => { await opening })
  expect(overlay()).toBeNull()
  expect(canvas.isConnected).toBe(false)
  expect(canvas.childElementCount).toBe(0)
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave).toHaveBeenCalledWith(source)
})

it('已关闭画板的加载失败不能解锁正在启动的下一会话，也不会再次还原窗口', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  const nextWindow = deferred<boolean>()
  nativeWindow.isMaximized.mockResolvedValueOnce(false).mockReturnValueOnce(nextWindow.promise)
  const load = deferred<void>()
  vi.doMock('@excalidraw/excalidraw', async () => {
    await load.promise
    throw new Error('import failed')
  })
  const first = openExcalidrawEditor({ source, onSave: vi.fn() }).catch((error: unknown) => error)
  await vi.waitFor(() => expect(overlay()).not.toBeNull())
  escape()
  const next = openExcalidrawEditor({ source, onSave: vi.fn() })

  try {
    await vi.waitFor(() => expect(nativeWindow.isMaximized).toHaveBeenCalledTimes(2))
    load.resolve()
    expect(await first).toBeUndefined()
    expect(nativeWindow.unmaximize).toHaveBeenCalledOnce()
    expect(overlay()).toBeNull()
    await expect(openExcalidrawEditor({ source, onSave: vi.fn() })).resolves.toBeUndefined()
    expect(nativeWindow.isMaximized).toHaveBeenCalledTimes(2)
  } finally {
    load.resolve()
    await first
    vi.doMock('@excalidraw/excalidraw', () => ({ Excalidraw: Board }))
    nextWindow.resolve(true)
    await act(async () => { await next })
  }
  expect(overlay()?.querySelector('.excalidraw-editor-canvas button')?.textContent).toBe('更新场景')
})

it('正常打开画板，完成时保存最新场景并卸载画板', async () => {
  vi.doMock('@excalidraw/excalidraw', () => ({ Excalidraw: Board }))
  const onSave = vi.fn()
  await act(async () => openExcalidrawEditor({ source, onSave }))
  const canvas = overlay()!.querySelector('.excalidraw-editor-canvas')!
  act(() => canvas.querySelector<HTMLButtonElement>('button')!.click())
  act(() => overlay()!.querySelector<HTMLButtonElement>('.excalidraw-editor-bar button')!.click())

  expect(onSave).toHaveBeenCalledOnce()
  expect(JSON.parse(onSave.mock.calls[0][0])).toEqual({
    type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
    elements, appState: { viewBackgroundColor: '#010203' }, files: {},
  })
  expect(overlay()).toBeNull()
  expect(canvas.childElementCount).toBe(0)
})
