import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { enqueueDocumentSave } from '../src/app/documentSaveQueue'
import { useAppUpdates } from '../src/app/useAppUpdates'
import type { TabContentCacheEntry } from '../src/app/useAppTabs'
import type { EditorMode } from '../src/types'

const {
  invokeMock,
  isTauriMock,
  notifyErrorMock,
  useUpdaterMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  useUpdaterMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../src/utils/tauri', () => ({ isTauri: isTauriMock }))
vi.mock('../src/utils/toast', () => ({ notifyError: notifyErrorMock }))
vi.mock('../src/hooks/useUpdater', () => ({
  useUpdater: useUpdaterMock,
}))
vi.mock('../src/utils/updater', () => ({
  checkForUpdate: vi.fn(async () => null),
  finalizeUpdate: vi.fn(async () => null),
  getBuildChannel: vi.fn(() => 'stable'),
  getLocalVersion: vi.fn(async () => '0.2.6'),
}))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(async () => false),
  requestPermission: vi.fn(async () => 'denied'),
  sendNotification: vi.fn(),
}))

describe('更新前保存管线', () => {
  let container: HTMLDivElement
  let root: Root
  let beforeInstall: (() => Promise<boolean | void>) | undefined

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    invokeMock.mockReset().mockResolvedValue(undefined)
    isTauriMock.mockReset().mockReturnValue(true)
    notifyErrorMock.mockReset()
    beforeInstall = undefined
    useUpdaterMock.mockReset().mockImplementation((options: { onBeforeInstall?: () => Promise<boolean | void> }) => {
      beforeInstall = options.onBeforeInstall
      return {}
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHarness(
    tabContentCache: { current: Map<string, TabContentCacheEntry> },
    documentRevisionRef: { current: Map<string, number> },
    activeTabIdRef: { current: string | null },
    content = '旧内容',
    currentFile: string | null = 'D:/notes/old.md',
  ) {
    function Harness() {
      const [isModified, setIsModified] = useState(true)
      const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
      const [, setSaveStatus] = useState<'saving' | 'saved' | 'unsaved' | 'error'>('unsaved')
      useAppUpdates({
        activeTabId: 'tab-1',
        activeTabIdRef,
        documentRevisionRef,
        tabContentCache,
        getCurrentContent: () => content,
        isModified,
        editorMode: 'live' as EditorMode,
        currentFile,
        lastSavedAt,
        settings: { ...DEFAULT_SETTINGS, autoCheckUpdate: false },
        isSecondaryWindow: true,
        setIsModified,
        setSaveStatus,
        setLastSavedAt,
      })
      return null
    }

    act(() => root.render(<Harness />))
  }

  function makeCache(content = '旧内容', path = 'D:/notes/old.md') {
    return {
      current: new Map<string, TabContentCacheEntry>([
        ['tab-1', {
          content,
          isModified: true,
          editorMode: 'live' as EditorMode,
          path,
          lastSavedAt: null,
        }],
      ]),
    }
  }

  it('队列等待期间路径或内容变化时跳过陈旧保存请求', async () => {
    const cache = makeCache()
    const revisionRef = { current: new Map([['tab-1', 0]]) }
    const activeTabIdRef = { current: 'tab-1' }
    let releaseQueue: (() => void) | null = null
    const queuedSave = enqueueDocumentSave(() => new Promise<void>((resolve) => {
      releaseQueue = resolve
    }))
    renderHarness(cache, revisionRef, activeTabIdRef)

    const savePromise = beforeInstall!()
    let saveResult: boolean | void | undefined
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    cache.current.set('tab-1', {
      ...cache.current.get('tab-1')!,
      content: '新内容',
      path: 'D:/notes/new.md',
      isModified: true,
    })
    revisionRef.current.set('tab-1', 1)

    await act(async () => {
      releaseQueue?.()
      await queuedSave
      saveResult = await savePromise
    })

    expect(saveResult).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(cache.current.get('tab-1')).toEqual(expect.objectContaining({
      content: '新内容',
      path: 'D:/notes/new.md',
      isModified: true,
    }))
  })

  it('存在未命名的未保存标签时阻止更新安装', async () => {
    const cache = makeCache('未命名内容')
    cache.current.set('tab-1', { ...cache.current.get('tab-1')!, path: undefined })
    const revisionRef = { current: new Map([['tab-1', 0]]) }
    const activeTabIdRef = { current: 'tab-1' }
    renderHarness(cache, revisionRef, activeTabIdRef, '未命名内容', null)

    const result = await act(async () => beforeInstall!())

    expect(result).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(cache.current.get('tab-1')).toEqual(expect.objectContaining({ isModified: true, path: undefined }))
  })
  it('前序更新保存失败后仍能释放队列执行下一次保存', async () => {
    const cache = makeCache()
    const revisionRef = { current: new Map([['tab-1', 0]]) }
    const activeTabIdRef = { current: 'tab-1' }
    invokeMock
      .mockRejectedValueOnce(new Error('首次写入失败'))
      .mockResolvedValueOnce(undefined)
    renderHarness(cache, revisionRef, activeTabIdRef)

    const firstSave = beforeInstall?.()
    const secondSave = beforeInstall?.()
    const results = await act(async () => Promise.all([firstSave, secondSave]))

    expect(results).toEqual([false, true])
    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(cache.current.get('tab-1')?.isModified).toBe(false)
    expect(notifyErrorMock).toHaveBeenCalledTimes(1)
  })
})
