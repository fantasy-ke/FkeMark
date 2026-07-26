import { act, useRef, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { useDocumentSave } from '../src/app/useDocumentSave'

const {
  invokeMock,
  notifyErrorMock,
  notifyWarningMock,
  recordOperationMock,
  recordStateMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifyWarningMock: vi.fn(),
  recordOperationMock: vi.fn(),
  recordStateMock: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: () => true }))
vi.mock('../src/utils/toast', () => ({
  notifyError: notifyErrorMock,
  notifyWarning: notifyWarningMock,
}))
vi.mock('../src/components/editor/useEditorPerformanceDiagnostics', () => ({
  recordEditorPerformanceOperation: recordOperationMock,
  recordEditorPerformanceState: recordStateMock,
}))

interface HarnessProps {
  getCurrentContentDeferred: () => Promise<string>
  markActiveDocumentSaved: (savedAt?: number, path?: string | null, content?: string) => void
  revisionRef?: MutableRefObject<number>
  onReady: (save: () => Promise<void>) => void
  setSaveStatus: (status: 'saving' | 'saved' | 'unsaved' | 'error') => void
}

function SaveHarness({
  getCurrentContentDeferred,
  markActiveDocumentSaved,
  revisionRef: providedRevisionRef,
  onReady,
  setSaveStatus,
}: HarnessProps) {
  const localRevisionRef = useRef(0)
  const save = useDocumentSave({
    activeTabId: 'tab-1',
    currentFile: 'D:/notes/large.md',
    currentFolderPath: null,
    settings: DEFAULT_SETTINGS,
    documentRevisionRef: providedRevisionRef ?? localRevisionRef,
    getCurrentContentDeferred,
    markActiveDocumentSaved,
    scanFolder: () => {},
    setCurrentFile: () => {},
    setSaveStatus,
    updateActiveTabPath: () => {},
  })
  onReady(save)
  return null
}

describe('文档保存管线', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    invokeMock.mockReset().mockResolvedValue({
      contentBytes: 10,
      existingFile: true,
      historyInitMs: 0,
      previousReadMs: 0,
      snapshotMs: 0,
      finalWriteMs: 0,
      totalMs: 0,
      snapshotAttempted: false,
      snapshotSaved: false,
      snapshotError: null,
    })
    notifyErrorMock.mockReset()
    notifyWarningMock.mockReset()
    recordOperationMock.mockReset()
    recordStateMock.mockReset()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root.unmount())
    container.remove()
  })

  it('先异步生成 Markdown 快照，再写入磁盘并缓存同一份内容', async () => {
    const getCurrentContentDeferred = vi.fn(async () => '# 已编辑\n')
    const markActiveDocumentSaved = vi.fn()
    const setSaveStatus = vi.fn()
    let save: (() => Promise<void>) | null = null

    await act(async () => {
      root.render(
        <SaveHarness
          getCurrentContentDeferred={getCurrentContentDeferred}
          markActiveDocumentSaved={markActiveDocumentSaved}
          onReady={(handler) => { save = handler }}
          setSaveStatus={setSaveStatus}
        />,
      )
    })
    await act(async () => { await save?.() })

    expect(setSaveStatus).toHaveBeenCalledWith('saving')
    expect(getCurrentContentDeferred).toHaveBeenCalledWith('save')
    expect(invokeMock).toHaveBeenCalledWith('write_file_command', expect.objectContaining({
      path: 'D:/notes/large.md',
      content: '# 已编辑\n',
    }))
    expect(getCurrentContentDeferred.mock.invocationCallOrder[0]).toBeLessThan(invokeMock.mock.invocationCallOrder[0])
    expect(markActiveDocumentSaved).toHaveBeenCalledWith(
      expect.any(Number),
      'D:/notes/large.md',
      '# 已编辑\n',
    )
  })

  it('写盘期间继续编辑时不把较旧快照标记为已保存', async () => {
    let finishWrite: (() => void) | null = null
    invokeMock.mockImplementation(() => new Promise<void>((resolve) => { finishWrite = resolve }))
    const revisionRef = { current: 0 }
    const markActiveDocumentSaved = vi.fn()
    let save: (() => Promise<void>) | null = null

    await act(async () => {
      root.render(
        <SaveHarness
          getCurrentContentDeferred={async () => '# 快照\n'}
          markActiveDocumentSaved={markActiveDocumentSaved}
          revisionRef={revisionRef}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
    })
    const savePromise = save?.()
    await act(async () => { await Promise.resolve() })
    revisionRef.current += 1
    await act(async () => {
      finishWrite?.()
      await savePromise
    })

    expect(markActiveDocumentSaved).not.toHaveBeenCalled()
  })

  it('keeps the UI watchdog active and records the stalled save stage', async () => {
    vi.useFakeTimers()
    let finishWrite: (() => void) | null = null
    invokeMock.mockImplementation(() => new Promise<void>((resolve) => { finishWrite = resolve }))
    let save: (() => Promise<void>) | null = null

    await act(async () => {
      root.render(
        <SaveHarness
          getCurrentContentDeferred={async () => '# large document\n'}
          markActiveDocumentSaved={() => {}}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
    })

    let savePromise: Promise<void> | undefined
    await act(async () => {
      savePromise = save?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(recordStateMock).toHaveBeenCalledWith(
      'save.disk-write.started',
      expect.objectContaining({ requestId: 1 }),
    )

    await act(async () => {
      vi.advanceTimersByTime(8_000)
      await Promise.resolve()
    })
    expect(recordStateMock).toHaveBeenCalledWith(
      'save.disk-write.stalled',
      expect.objectContaining({ requestId: 1 }),
    )
    expect(notifyWarningMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishWrite?.()
      await savePromise
    })
  })

})
