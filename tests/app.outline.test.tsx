import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'

vi.mock('../src/app/AppLayout', () => ({
  AppLayout: (props: any) => (
    <div>
      <button data-open onClick={() => void props.handleOpenFile('/note.md')}>open</button>
      <button
        data-report-outline
        onClick={() => props.handleEditorOutlineChange(props.fileContent, [
          { level: 1, text: 'Parsed heading', index: 0 },
        ])}
      >
        report outline
      </button>
      <div data-content>{props.fileContent}</div>
      <div data-toc>{props.tocItems.map((item: any) => item.text).join('|')}</div>
    </div>
  ),
}))
vi.mock('../src/utils/tauri', () => ({ isTauri: () => false }))
vi.mock('../src/hooks/useTauriWindow', () => ({
  useTauriWindow: () => ({ isMaximized: false, close: vi.fn(), hideToTray: vi.fn() }),
}))
vi.mock('../src/app/useAppUpdates', () => ({
  useAppUpdates: () => ({
    appVersion: 'test', updateInfo: null, checkingUpdate: false, showUpdateToast: false,
    setShowUpdateToast: vi.fn(), updateNotification: null, setUpdateNotification: vi.fn(),
    rollbackAvailable: false, finalizeNotice: null, setFinalizeNotice: vi.fn(), updater: null, doCheckUpdate: vi.fn(),
  }),
}))

class MatchMediaMock {
  matches = false
  addEventListener() {}
  removeEventListener() {}
}

describe('app outline initialization', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => new MatchMediaMock() })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('---\n# Parsed heading', { status: 200 })))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses the editor outline immediately after the first file load', async () => {
    await act(async () => { root.render(<App />) })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-open]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-content]')?.textContent).toContain('# Parsed heading')
    expect(container.querySelector('[data-toc]')?.textContent).toBe('')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-report-outline]')!.click()
    })

    expect(container.querySelector('[data-toc]')?.textContent).toBe('Parsed heading')
  })
})
