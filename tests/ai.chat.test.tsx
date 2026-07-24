import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChatSidebar } from '../src/components/ai/AiChatSidebar'
import { AiSelectionButton } from '../src/components/editor/AiSelectionButton'
import { I18nProvider } from '../src/i18n'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { runAiChat } from '../src/utils/aiAssistant'

vi.mock('../src/utils/aiAssistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/aiAssistant')>()
  return { ...actual, runAiChat: vi.fn() }
})

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
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

  it('attaches the active tab document and lets a manual selection replace it', async () => {
    vi.mocked(runAiChat).mockResolvedValue('Document answer')
    const sidebar = (pendingContext: { id: number; text: string } | null = null) => (
      <I18nProvider language="en" setLanguage={() => {}}>
        <AiChatSidebar
          open
          settings={{ ...DEFAULT_SETTINGS, aiEnabled: true }}
          activeDocument={{ name: 'notes.md', content: '# Entire document\n\nBody text' }}
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
    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('notes.md')

    const textarea = container.querySelector('.ai-chat-input-row textarea') as HTMLTextAreaElement
    await act(async () => setTextareaValue(textarea, 'Summarize the document'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })
    const documentRequest = vi.mocked(runAiChat).mock.calls[0][1].at(-1)?.content ?? ''
    expect(documentRequest).toContain('# Entire document')
    expect(documentRequest).toContain('Summarize the document')

    await act(async () => root.render(sidebar({ id: 2, text: 'Only this selection' })))
    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('Selected Markdown attached')
    expect(container.querySelector('.ai-chat-context')?.textContent).toContain('Only this selection')

    await act(async () => setTextareaValue(textarea, 'Explain the context'))
    await act(async () => {
      (container.querySelector('.ai-chat-send') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    const selectionRequest = vi.mocked(runAiChat).mock.calls[1][1].at(-1)?.content ?? ''
    expect(selectionRequest).toContain('Only this selection')
    expect(selectionRequest).not.toContain('Entire document')
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
