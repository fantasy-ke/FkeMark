import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionHistoryMenu } from '../src/components/editor/VersionHistoryMenu'
import { createVersionDiff } from '../src/utils/versionHistory'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

describe('本地版本历史', () => {
  it('按行标记新增、删除与未变化内容', () => {
    const diff = createVersionDiff('第一行\r\n旧内容\r\n末行', '第一行\n新内容\n末行')

    expect(diff).toEqual([
      { kind: 'same', text: '第一行', oldLine: 1, newLine: 1 },
      { kind: 'remove', text: '旧内容', oldLine: 2, newLine: null },
      { kind: 'add', text: '新内容', oldLine: null, newLine: 2 },
      { kind: 'same', text: '末行', oldLine: 3, newLine: 3 },
    ])
  })

  it('超大文档使用前后缀降级并保留变化', () => {
    const common = Array.from({ length: 1300 }, (_, index) => `行 ${index}`)
    const diff = createVersionDiff(common.join('\n'), [...common.slice(0, 650), '新增', ...common.slice(650)].join('\n'))

    expect(diff.filter((line) => line.kind === 'add')).toEqual([
      { kind: 'add', text: '新增', oldLine: null, newLine: 651 },
    ])
    expect(diff.filter((line) => line.kind === 'remove')).toHaveLength(0)
  })

  describe('工具栏入口', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
      invokeMock.mockReset()
    })

    afterEach(async () => {
      await act(async () => root.unmount())
      container.remove()
      document.querySelector('.version-diff-overlay')?.remove()
      vi.restoreAllMocks()
    })

    it('未保存文档禁用版本历史', async () => {
      await act(async () => root.render(
        <VersionHistoryMenu getCurrentContent={() => '当前内容'} onRestore={() => {}} />,
      ))

      expect((container.querySelector('.version-history-trigger') as HTMLButtonElement).disabled).toBe(true)
      expect(invokeMock).not.toHaveBeenCalled()
    })

    it('读取快照并与当前内容对比', async () => {
      invokeMock.mockImplementation((command: string) => {
        if (command === 'list_version_snapshots') {
          return Promise.resolve([{ id: '1-hash', createdAt: 1_753_324_800_000, size: 12 }])
        }
        if (command === 'read_version_snapshot') return Promise.resolve('旧内容')
        return Promise.resolve()
      })

      await act(async () => root.render(
        <VersionHistoryMenu
          filePath={'C:\\notes\\demo.md'}
          getCurrentContent={() => '新内容'}
          onRestore={() => {}}
        />,
      ))
      await act(async () => (container.querySelector('.version-history-trigger') as HTMLButtonElement).click())

      expect(invokeMock).toHaveBeenCalledWith('list_version_snapshots', { path: 'C:\\notes\\demo.md' })
      const item = document.querySelector('.version-history-item') as HTMLButtonElement
      expect(item).not.toBeNull()

      await act(async () => item.click())
      expect(invokeMock).toHaveBeenCalledWith('read_version_snapshot', {
        path: 'C:\\notes\\demo.md',
        snapshotId: '1-hash',
      })
      expect(document.querySelector('.version-diff-dialog')).not.toBeNull()
      expect(document.querySelector('.version-diff-content')?.textContent).toContain('旧内容')
      expect(document.querySelector('.version-diff-content')?.textContent).toContain('新内容')
    })
  })
})