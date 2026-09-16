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
  activeTabId?: string | null
  currentFile?: string | null
  getCurrentContentDeferred: () => Promise<string>
  markActiveDocumentSaved: (savedAt?: number, path?: string | null, content?: string) => void
  revisionRef?: MutableRefObject<Map<string, number>>
  onReady: (save: () => Promise<void>) => void
  setSaveStatus: (status: 'saving' | 'saved' | 'unsaved' | 'error') => void
}

function SaveHarness({
  activeTabId = 'tab-1',
  currentFile = 'D:/notes/large.md',
  getCurrentContentDeferred,
  markActiveDocumentSaved,
  revisionRef: providedRevisionRef,
  onReady,
  setSaveStatus,
}: HarnessProps) {
  const localRevisionRef = useRef(new Map<string, number>())
  const save = useDocumentSave({
    activeTabId,
    currentFile,
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
    const revisionRef = { current: new Map([['tab-1', 0]]) }
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
    revisionRef.current.set('tab-1', 1)
    await act(async () => {
      finishWrite?.()
      await savePromise
    })

    expect(markActiveDocumentSaved).not.toHaveBeenCalled()
  })


  it('排队期间继续编辑时按顺序写盘并只确认最新内容', async () => {
    let releaseFirst: (() => void) | null = null
    const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve })
    const contents = ['# 第一次\n', '# 第二次\n']
    const getCurrentContentDeferred = vi.fn(async () => contents.shift() || '')
    const revisionRef = { current: new Map([['tab-1', 0]]) }
    const markActiveDocumentSaved = vi.fn()
    invokeMock
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValue(undefined)
    let save: (() => Promise<void>) | null = null

    await act(async () => {
      root.render(
        <SaveHarness
          getCurrentContentDeferred={getCurrentContentDeferred}
          markActiveDocumentSaved={markActiveDocumentSaved}
          onReady={(handler) => { save = handler }}
          revisionRef={revisionRef}
          setSaveStatus={() => {}}
        />,
      )
    })

    let firstSave: Promise<void> | undefined
    let secondSave: Promise<void> | undefined
    await act(async () => {
      firstSave = save?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      revisionRef.current.set('tab-1', 1)
      secondSave = save?.()
      await Promise.resolve()
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'write_file_command', expect.objectContaining({ content: '# 第一次\n' }))

    await act(async () => {
      releaseFirst?.()
      await Promise.all([firstSave, secondSave])
    })

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'write_file_command', expect.objectContaining({ content: '# 第二次\n' }))
    expect(markActiveDocumentSaved).toHaveBeenCalledTimes(1)
    expect(markActiveDocumentSaved).toHaveBeenCalledWith(
      expect.any(Number),
      'D:/notes/large.md',
      '# 第二次\n',
    )
  })
  it('切换标签后排队请求仍写入各自绑定的文件和内容', async () => {
    let resolveFirstContent: ((content: string) => void) | null = null
    const firstContent = new Promise<string>((resolve) => { resolveFirstContent = resolve })
    let save: (() => Promise<void>) | null = null

    await act(async () => {
      root.render(
        <SaveHarness
          activeTabId="tab-1"
          currentFile="D:/notes/one.md"
          getCurrentContentDeferred={() => firstContent}
          markActiveDocumentSaved={() => {}}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
    })
    const firstSave = save?.()

    await act(async () => {
      root.render(
        <SaveHarness
          activeTabId="tab-2"
          currentFile="D:/notes/two.md"
          getCurrentContentDeferred={async () => '# 标签二\n'}
          markActiveDocumentSaved={() => {}}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
    })
    const secondSave = save?.()
    await act(async () => {
      resolveFirstContent?.('# 标签一\n')
      await Promise.all([firstSave, secondSave])
    })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'write_file_command', expect.objectContaining({
      path: 'D:/notes/one.md',
      content: '# 标签一\n',
    }))
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'write_file_command', expect.objectContaining({
      path: 'D:/notes/two.md',
      content: '# 标签二\n',
    }))
  })

  it('保存开始后标签路径变化时不再写入旧路径', async () => {
    let resolveContent: ((content: string) => void) | null = null
    const pendingContent = new Promise<string>((resolve) => { resolveContent = resolve })
    const revisionRef = { current: new Map([['tab-1', 0]]) }
    let save: (() => Promise<void>) | null = null

    await act(async () => {
      root.render(
        <SaveHarness
          currentFile="D:/notes/old.md"
          getCurrentContentDeferred={() => pendingContent}
          markActiveDocumentSaved={() => {}}
          revisionRef={revisionRef}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
    })
    const savePromise = save?.()

    await act(async () => {
      root.render(
        <SaveHarness
          currentFile="D:/notes/new.md"
          getCurrentContentDeferred={async () => '# 新路径\n'}
          markActiveDocumentSaved={() => {}}
          revisionRef={revisionRef}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
      revisionRef.current.set('tab-1', 1)
      resolveContent?.('# 旧路径\n')
      await savePromise
    })

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('前一个保存失败后仍执行后续排队保存', async () => {
    let rejectFirst: ((error: Error) => void) | null = null
    invokeMock
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject }))
      .mockResolvedValue(undefined)
    const contents = ['# 第一次\n', '# 第二次\n']
    let save: (() => Promise<void>) | null = null
    await act(async () => {
      root.render(
        <SaveHarness
          getCurrentContentDeferred={async () => contents.shift() || ''}
          markActiveDocumentSaved={() => {}}
          onReady={(handler) => { save = handler }}
          setSaveStatus={() => {}}
        />,
      )
    })

    const firstSave = save?.()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const secondSave = save?.()
    await act(async () => {
      rejectFirst?.(new Error('写入失败'))
      await Promise.all([firstSave, secondSave])
    })

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'write_file_command', expect.objectContaining({
      content: '# 第二次\n',
    }))
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
