import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCurrentEditorContent } from '../src/app/useCurrentEditorContent'
import type { EditorHandle } from '../src/components/Editor'
import type { EditorMode } from '../src/types'

function CurrentEditorContentHarness({
  getContent,
  getContentDeferred,
}: {
  getContent: () => string
  getContentDeferred: (signal?: AbortSignal) => Promise<string>
}) {
  const [editorMode, setEditorMode] = useState<EditorMode>('live')
  const [fileContent, setFileContent] = useState('before')
  const { editorHandleRef, handleEditorModeChange } = useCurrentEditorContent({
    editorMode,
    fileContent,
    setFileContent,
    setEditorMode,
  })

  editorHandleRef.current = {
    insertImageMarkdown: () => {},
    insertImageUploadFromPath: () => {},
    insertImageUploadFromBlob: () => {},
    focusEditor: () => {},
    getEditor: () => null,
    getContent,
    getContentDeferred,
    runAiAction: () => {},
  } satisfies EditorHandle

  return (
    <>
      <button data-testid="split" type="button" onClick={() => handleEditorModeChange('split')}>split</button>
      <button data-testid="live" type="button" onClick={() => handleEditorModeChange('live')}>live</button>
      <output data-testid="mode">{editorMode}</output>
      <output data-testid="content">{fileContent}</output>
    </>
  )
}

describe('当前编辑器内容同步', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('切换分栏时先提交视图更新，再同步实时编辑内容', async () => {
    const getContent = vi.fn(() => 'after')
    const getContentDeferred = vi.fn(async () => 'after')

    await act(async () => {
      root.render(
        <CurrentEditorContentHarness
          getContent={getContent}
          getContentDeferred={getContentDeferred}
        />,
      )
    })

    await act(async () => {
      container.querySelector('[data-testid="split"]')?.click()
    })

    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('split')
    expect(container.querySelector('[data-testid="content"]')?.textContent).toBe('before')
    expect(getContent).not.toHaveBeenCalled()
    expect(getContentDeferred).not.toHaveBeenCalled()

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(getContent).not.toHaveBeenCalled()
    expect(getContentDeferred).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="content"]')?.textContent).toBe('after')
  })

  it('cancels an unfinished mode sync when returning to live mode', async () => {
    let finishDeferred: ((content: string) => void) | undefined
    let deferredSignal: AbortSignal | undefined
    const getContent = vi.fn(() => 'after')
    const getContentDeferred = vi.fn((signal?: AbortSignal) => {
      deferredSignal = signal
      return new Promise<string>((resolve) => { finishDeferred = resolve })
    })

    await act(async () => {
      root.render(
        <CurrentEditorContentHarness
          getContent={getContent}
          getContentDeferred={getContentDeferred}
        />,
      )
    })
    await act(async () => {
      container.querySelector('[data-testid="split"]')?.click()
    })
    act(() => { vi.runAllTimers() })

    expect(getContentDeferred).toHaveBeenCalledTimes(1)
    await act(async () => {
      container.querySelector('[data-testid="live"]')?.click()
    })
    expect(deferredSignal?.aborted).toBe(true)
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('live')

    await act(async () => {
      finishDeferred?.('after')
      await Promise.resolve()
    })

    expect(getContent).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="content"]')?.textContent).toBe('before')
  })
})
