import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { TiptapEditor } from '../src/types/editor'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChatSidebar } from '../src/components/ai/AiChatSidebar'
import { AiSelectionButton } from '../src/components/editor/AiSelectionButton'
import { I18nProvider } from '../src/i18n'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { fetchAiModels, runAiChat } from '../src/utils/aiAssistant'

vi.mock('../src/utils/aiAssistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/aiAssistant')>()
  return { ...actual, runAiChat: vi.fn(), fetchAiModels: vi.fn() }
})

const { runAgentHarnessMock } = vi.hoisted(() => ({ runAgentHarnessMock: vi.fn() }))
vi.mock('../src/utils/agent/harness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/agent/harness')>()
  return { ...actual, runAgentHarness: runAgentHarnessMock }
})

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('AI chat integration', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.removeItem('fkemark:ai-chat-history:v1')
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    document.querySelectorAll('.ai-selection-button').forEach((node) => node.remove())
    document.querySelector('.version-diff-overlay')?.remove()
    localStorage.removeItem('fkemark:ai-chat-history:v1')
    vi.clearAllMocks()
  })

  it('does not reclaim focus when the open sidebar rerenders', async () => {
    const sidebar = (content: string) => (
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          activeDocument={{ name: 'notes.md', content }}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>
    )

    await act(async () => root.render(sidebar('Initial document')))
    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    expect(document.activeElement).toBe(textarea)

    const editorInput = document.createElement('input')
    document.body.appendChild(editorInput)
    editorInput.focus()
    await act(async () => root.render(sidebar('Updated document')))

    expect(document.activeElement).toBe(editorInput)
    editorInput.remove()
  })

  it('attaches selected Markdown to a multi-turn chat request', async () => {
    vi.mocked(runAiChat).mockResolvedValue('Improved answer')
    await act(async () => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          pendingContext={{ id: 1, text: '# Selected Markdown' }}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>,
    ))

    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('Selected Markdown attached')
    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, 'Improve this section'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    const requestMessages = vi.mocked(runAiChat).mock.calls[0][1]
    expect(requestMessages[0].content).toContain('# Selected Markdown')
    expect(requestMessages[0].content).toContain('Improve this section')
    expect(vi.mocked(runAiChat).mock.calls[0][3]).toEqual(expect.any(Function))
    expect(container.querySelector('.ai-chat-message.assistant')?.textContent).toContain('Improved answer')
  })

  it('references the active file by identifier and lets a manual selection replace it', async () => {
    runAgentHarnessMock.mockResolvedValue({ answer: 'Document answer', events: [], changes: [], truncated: false })
    vi.mocked(runAiChat).mockResolvedValue('Selection answer')
    const sidebar = (pendingContext: { id: number; text: string } | null = null) => (
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          activeDocument={{ name: 'notes.md', content: '# Entire document\n\nBody text', path: 'D:/notes/notes.md' }}
          pendingContext={pendingContext}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>
    )

    await act(async () => root.render(sidebar()))
    const documentButton = container.querySelector('.ai-chat-document-button') as HTMLButtonElement
    expect(documentButton.textContent).toContain('notes.md')
    await act(async () => documentButton.click())
    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('D:/notes/notes.md')
    expect(container.querySelector('.ai-chat-agent-toggle')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.ai-chat-reference-hint')?.textContent).toContain('Agent mode')

    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, 'Summarize the document'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })
    // 文件引用只发送标识，并默认走 Agent，不把文件内容塞进用户消息。
    expect(vi.mocked(runAiChat)).not.toHaveBeenCalled()
    const documentRequest = runAgentHarnessMock.mock.calls[0][0].messages.at(-1)?.content ?? ''
    expect(documentRequest).toContain('D:/notes/notes.md')
    expect(documentRequest).toContain('Summarize the document')
    expect(documentRequest).not.toContain('Entire document')
    expect(runAgentHarnessMock.mock.calls[0][0].messages.at(-1)?.references).toEqual([
      { path: 'D:/notes/notes.md', name: 'notes.md' },
    ])

    await act(async () => root.render(sidebar({ id: 2, text: 'Only this selection' })))
    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('Selected Markdown attached')
    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('Only this selection')

    await act(async () => setTextareaValue(textarea, 'Explain the context'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    // 引用会保持 Agent 模式，选区内容仍随消息发出，不夹带整篇文档。
    const selectionRequest = runAgentHarnessMock.mock.calls[1][0].messages.at(-1)?.content ?? ''
    expect(selectionRequest).toContain('Only this selection')
    expect(selectionRequest).not.toContain('Entire document')
    expect(vi.mocked(runAiChat)).not.toHaveBeenCalled()
  })

  it('shows the file reference as a clickable chip that switches to that file', async () => {
    runAgentHarnessMock.mockResolvedValue({ answer: 'Document answer', events: [], changes: [], truncated: false })
    const onOpenFile = vi.fn()
    await act(async () => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          activeDocument={{ name: '首页.md', content: '不应发送的正文', path: 'D:\\notes\\首页.md' }}
          pendingContext={null}
          onOpenFile={onOpenFile}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>,
    ))

    await act(async () => (container.querySelector('.ai-chat-document-button') as HTMLButtonElement).click())
    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, '帮我看看'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    const chip = container.querySelector('.ai-chat-file-ref') as HTMLButtonElement
    expect(chip).not.toBeNull()
    expect(chip.textContent).toContain('首页.md')
    // 当前活动文件正是被引用的文件，胶囊处于高亮态。
    expect(chip.classList.contains('is-active')).toBe(true)

    await act(async () => chip.click())
    expect(onOpenFile).toHaveBeenCalledWith('D:\\notes\\首页.md')
  })

  it('stops generation and keeps the partial answer', async () => {
    let control: { signal?: AbortSignal } | undefined
    vi.mocked(runAiChat).mockImplementation(async (_settings, _messages, _language, onChunk, streamControl) => {
      control = streamControl
      onChunk?.('已经生成的部分')
      await new Promise<void>((resolve) => streamControl?.signal?.addEventListener('abort', () => resolve()))
      return '已经生成的部分'
    })

    await act(async () => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>,
    ))

    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, '写一段话'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    // 生成中发送按钮换成停止按钮。
    expect(container.querySelector('.ai-chat-send')).toBeNull()
    const stopButton = container.querySelector('.ai-chat-stop') as HTMLButtonElement
    expect(stopButton).not.toBeNull()

    await act(async () => {
      stopButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(control?.signal?.aborted).toBe(true)
    expect(container.querySelector('.ai-chat-message.assistant')?.textContent).toContain('已经生成的部分')
    expect(container.querySelector('.ai-chat-stop')).toBeNull()
  })

  it('pauses and resumes generation from the composer', async () => {
    let control: { waitWhilePaused?: () => Promise<void> } | undefined
    let releaseStart: (() => void) | null = null
    vi.mocked(runAiChat).mockImplementation(async (_settings, _messages, _language, onChunk, streamControl) => {
      control = streamControl
      onChunk?.('第一段')
      await new Promise<void>((resolve) => { releaseStart = resolve })
      // 暂停时这里会一直挂起，直到恢复生成。
      await streamControl?.waitWhilePaused?.()
      onChunk?.('第二段')
      return '第一段第二段'
    })

    await act(async () => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>,
    ))

    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, '继续写'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(typeof control?.waitWhilePaused).toBe('function')
    const pauseButton = container.querySelector('.ai-chat-pause') as HTMLButtonElement
    expect(pauseButton.getAttribute('aria-pressed')).toBe('false')

    await act(async () => pauseButton.click())
    expect(pauseButton.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.ai-chat-thinking.is-paused')?.textContent).toContain('已暂停')

    // 暂停期间即使请求继续推进，也不会再追加内容。
    await act(async () => {
      releaseStart?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    const pausedContent = container.querySelector('.ai-chat-message.assistant')?.textContent ?? ''
    expect(pausedContent).toContain('第一段')
    expect(pausedContent).not.toContain('第二段')

    await act(async () => {
      pauseButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pauseButton.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.ai-chat-message.assistant')?.textContent).toContain('第一段第二段')
  })

  it('switches the AI model from the sidebar and writes it back to settings', async () => {
    vi.mocked(fetchAiModels).mockResolvedValue(['llama3.1', 'qwen2.5:7b'])
    const onModelChange = vi.fn()
    await act(async () => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true, aiModel: 'llama3.1' }}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
          onModelChange={onModelChange}
        />
      </I18nProvider>,
    ))

    const select = container.querySelector('.ai-chat-model-row select') as HTMLSelectElement
    expect(select.value).toBe('llama3.1')
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['llama3.1'])

    await act(async () => {
      (container.querySelector('.ai-chat-model-fetch') as HTMLButtonElement).click()
      await Promise.resolve()
    })
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['llama3.1', 'qwen2.5:7b'])

    await act(async () => setSelectValue(select, 'qwen2.5:7b'))
    expect(onModelChange).toHaveBeenCalledWith('qwen2.5:7b')
  })

  it('keeps a manually entered model as an option when the endpoint list omits it', async () => {
    vi.mocked(fetchAiModels).mockResolvedValue(['llama3.1'])
    await act(async () => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true, aiModel: 'private-model' }}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
          onModelChange={() => {}}
        />
      </I18nProvider>,
    ))

    await act(async () => {
      (container.querySelector('.ai-chat-model-fetch') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    const select = container.querySelector('.ai-chat-model-row select') as HTMLSelectElement
    expect(select.value).toBe('private-model')
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['private-model', 'llama3.1'])
  })

  it('streams an AI answer into the current conversation', async () => {
    vi.mocked(runAiChat).mockImplementation(async (_settings, _messages, _language, onChunk) => {
      onChunk?.('Streamed ')
      onChunk?.('answer')
      return 'Streamed answer'
    })
    await act(async () => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>,
    ))

    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, 'Write a summary'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(container.querySelector('.ai-chat-message.assistant')?.textContent).toContain('Streamed answer')
    expect(container.querySelector('.ai-chat-history-row')?.textContent).toContain('History')
  })

  it('runs the agent harness with tool events and reviews file changes', async () => {
    runAgentHarnessMock.mockImplementation(async (options: {
      onEvent?: (event: unknown) => void
      onFileWritten?: (path: string, content: string) => void
    }) => {
      options.onEvent?.({ step: 1, tool: 'read_markdown', arguments: { path: 'D:/notes/首页.md' }, ok: true, summary: '读取 D:/notes/首页.md' })
      options.onFileWritten?.('D:/notes/首页.md', '新内容')
      return {
        answer: '已经补全首页笔记。',
        events: [],
        changes: [{ path: 'D:/notes/首页.md', before: '旧内容', after: '新内容', createdAt: 1 }],
        truncated: false,
      }
    })
    const onAgentFileWritten = vi.fn()

    await act(async () => root.render(
      <I18nProvider language="zh-CN" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          currentFolder={'D:/notes'}
          onAgentFileWritten={onAgentFileWritten}
          pendingContext={null}
          onClose={() => {}}
          onOpenSettings={() => {}}
        />
      </I18nProvider>,
    ))

    const agentToggle = container.querySelector('.ai-chat-agent-toggle') as HTMLButtonElement
    await act(async () => agentToggle.click())
    expect(agentToggle.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.ai-chat-agent-hint')).not.toBeNull()

    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, '帮我补全首页笔记'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(runAgentHarnessMock).toHaveBeenCalledWith(expect.objectContaining({
      currentFolder: 'D:/notes',
      onFileWritten: onAgentFileWritten,
    }))
    expect(container.querySelector('.ai-chat-tool-event')?.textContent).toContain('读取 D:/notes/首页.md')
    expect(container.querySelector('.ai-chat-message.assistant')?.textContent).toContain('已经补全首页笔记。')

    const changesButton = container.querySelector('.ai-chat-changes-button') as HTMLButtonElement
    expect(changesButton.textContent).toContain('1')
    await act(async () => changesButton.click())

    const dialog = document.querySelector('.version-diff-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Agent 文件变更')
    expect(dialog?.textContent).toContain('首页.md')
    expect(document.querySelector('.version-diff-content')?.textContent).toContain('旧内容')
    expect(document.querySelector('.version-diff-content')?.textContent).toContain('新内容')

    await act(async () => {
      (document.querySelector('.version-diff-actions .btn-secondary') as HTMLButtonElement).click()
    })
    expect(document.querySelector('.version-diff-dialog')).toBeNull()
  })

  it('hides the AI action when the editor asks it to stay hidden', async () => {
    const editor = {
      state: { selection: { from: 1, to: 8, empty: false }, doc: { textBetween: vi.fn(() => 'Selected') } },
      view: { coordsAtPos: vi.fn(() => ({ left: 120, top: 160 })) },
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as TiptapEditor

    await act(async () => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiSelectionButton editor={editor} visible={false} onAdd={() => {}} />
      </I18nProvider>,
    ))

    expect(document.querySelector('.ai-selection-button')).toBeNull()
  })

  it('shows an AI action beside a live editor selection', async () => {
    const handlers = new Map<string, () => void>()
    const onAdd = vi.fn()
    const editor = {
      state: {
        selection: { from: 1, to: 8, empty: false },
        doc: { textBetween: vi.fn(() => 'Selected') },
      },
      view: { coordsAtPos: vi.fn(() => ({ left: 120, top: 160 })) },
      on: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)),
      off: vi.fn((event: string) => handlers.delete(event)),
    } as unknown as TiptapEditor

    await act(async () => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiSelectionButton editor={editor} visible onAdd={onAdd} />
      </I18nProvider>,
    ))

    const button = document.querySelector('.ai-selection-button') as HTMLButtonElement
    expect(button).not.toBeNull()
    await act(async () => button.click())
    expect(onAdd).toHaveBeenCalledWith('Selected')
  })
})
