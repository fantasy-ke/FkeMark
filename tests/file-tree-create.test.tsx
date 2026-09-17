import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileTreeActions } from '../src/app/useFileTreeActions'

const {
  invokeMock,
  isTauriMock,
  notifyErrorMock,
  notifySuccessMock,
  showPromptMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  showPromptMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }))
vi.mock('../src/utils/tauri', () => ({ isTauri: isTauriMock }))
vi.mock('../src/utils/toast', () => ({
  notifyError: notifyErrorMock,
  notifySuccess: notifySuccessMock,
}))
vi.mock('../src/components/ConfirmDialog', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: showPromptMock,
}))

function CreateHarness({
  onReady,
  scanFolder,
}: {
  onReady: (create: (path: string, type?: 'file' | 'folder') => Promise<void>) => void
  scanFolder: (dirPath: string) => Promise<void>
}) {
  const { handleCreateMarkdownInFolder } = useFileTreeActions({
    language: 'zh-CN',
    currentFolderPath: 'D:/notes',
    scanFolder,
    setRecentFiles: () => {},
    replaceTabPathPrefix: () => {},
    removeTabsByPathPrefix: () => {},
  })
  onReady(handleCreateMarkdownInFolder)
  return null
}

describe('file tree create markdown in folder', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    isTauriMock.mockReturnValue(true)
    invokeMock.mockReset()
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
    showPromptMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function mountCreate(scanFolder = vi.fn(async () => {})) {
    let create: ((path: string, type?: 'file' | 'folder') => Promise<void>) | null = null
    await act(async () => {
      root.render(
        <CreateHarness
          onReady={(handler) => { create = handler }}
          scanFolder={scanFolder}
        />,
      )
    })
    return { create: create!, scanFolder }
  }

  it('writes an empty markdown file under the right-clicked folder', async () => {
    showPromptMock.mockResolvedValue('note')
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_file_info') throw new Error('missing')
      return undefined
    })
    const { create, scanFolder } = await mountCreate()

    await act(async () => { await create('D:/notes/docs', 'folder') })

    expect(invokeMock).toHaveBeenCalledWith('write_file_command', {
      path: 'D:/notes/docs/note.md',
      content: '',
    })
    expect(scanFolder).toHaveBeenCalledWith('D:/notes')
    expect(notifySuccessMock).toHaveBeenCalled()
  })

  it('ignores file targets and unsafe names', async () => {
    showPromptMock.mockResolvedValue('../secret')
    const { create } = await mountCreate()

    await act(async () => { await create('D:/notes/docs/intro.md', 'file') })
    expect(showPromptMock).not.toHaveBeenCalled()

    await act(async () => { await create('D:/notes/docs', 'folder') })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalled()
  })

  it('does not overwrite an existing file', async () => {
    showPromptMock.mockResolvedValue('note.md')
    invokeMock.mockResolvedValue({ path: 'D:/notes/docs/note.md' })
    const { create } = await mountCreate()

    await act(async () => { await create('D:/notes/docs', 'folder') })

    expect(invokeMock).toHaveBeenCalledWith('get_file_info', { path: 'D:/notes/docs/note.md' })
    expect(invokeMock).not.toHaveBeenCalledWith('write_file_command', expect.anything())
    expect(notifyErrorMock).toHaveBeenCalled()
  })
})
