import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, translate } from '../src/i18n'
import { Editor, type EditorHandle } from '../src/components/Editor'
import { DEFAULT_TOOLBAR_ITEMS } from '../src/utils/toolbar'
import type { AppSettings, EditorMode } from '../src/types'

const settings: AppSettings = {
  theme: 'system',
  fontSize: 16,
  fontFamily: 'system-ui',
  markdownFontFamily: 'inherit',
  markdownFontSize: 0,
  autoSave: false,
  autoSaveInterval: 300,
  versionSnapshotLimit: 50,
  lineHeight: 'normal',
  editorWidth: 'medium',
  tabOverflowMode: 'scroll',
  showMarkers: true,
  autoBracket: true,
  spellCheckEnabled: true,
  showMinimap: false,
  minimapSide: 'right',
  editorMode: 'live',
  cornerRadius: 6,
  buttonRadius: 4,
  toolbarFloating: true,
  toolbarPosition: 'top',
  toolbarButtons: DEFAULT_TOOLBAR_ITEMS,
  language: 'zh-CN',
  focusMode: false,
  updateChannel: 'dev',
  autoCheckUpdate: false,
  closeAction: 'ask',
  skipClosePrompt: false,
  aiEnabled: false,
  aiProvider: 'local',
  aiEndpoint: '',
  aiApiKey: '',
  aiModel: '',
  aiTargetLanguage: 'English',
  aiTemperature: 0.3,
  aiMarkdownPrompt: '',
  imageUploadMode: 'local',
  smmsToken: '',
  smmsUploadUrl: '',
  customImageUploadUrl: '',
  customImageUploadToken: '',
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavPublicUrl: '',
  mermaid: false,
  vim: false,
  keymap: {},
}

describe('编辑器交互层', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  async function clickMenuItem(element: HTMLElement) {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      await Promise.resolve()
    })
  }

  async function renderEditor(
    content: string,
    settingsOverrides: Partial<AppSettings> = {},
    onOpenWikiLink?: (target: string) => void,
    editorMode: EditorMode = 'live',
    editorRef?: ReturnType<typeof createRef<EditorHandle>>,
  ) {
    const editorSettings = { ...settings, ...settingsOverrides }
    await act(async () => {
      root.render(
        <I18nProvider language={editorSettings.language} setLanguage={() => {}}>
          <Editor
            ref={editorRef}
            content={content}
            onChange={() => {}}
            settings={editorSettings}
            editorMode={editorMode}
            onEditorModeChange={() => {}}
            onSlashCommand={() => {}}
            findReplaceVisible={false}
            findReplaceMode="find"
            onFindReplaceClose={() => {}}
            onFindReplaceModeChange={() => {}}
            onOpenWikiLink={onOpenWikiLink}
          />
        </I18nProvider>,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
  }

  it('applies the configured editor width mapping', async () => {
    await renderEditor('', { editorWidth: 'narrow' })
    expect(document.documentElement.style.getPropertyValue('--editor-max-w')).toBe('800px')

    await renderEditor('', { editorWidth: 'medium' })
    expect(document.documentElement.style.getPropertyValue('--editor-max-w')).toBe('960px')

    await renderEditor('', { editorWidth: 'wide' })
    expect(document.documentElement.style.getPropertyValue('--editor-max-w')).toBe('90%')
  })

  it('uses the selected language for the live editor placeholder', async () => {
    await renderEditor('', { language: 'zh-CN' })
    let liveEditor = container.querySelector('.blocknote-live-editor') as HTMLElement
    expect(liveEditor.getAttribute('lang')).toBe('zh-CN')
    expect(liveEditor.style.getPropertyValue('--fkemark-live-placeholder'))
      .toBe(JSON.stringify(translate('zh-CN', 'editor.livePlaceholder')))

    await renderEditor('', { language: 'en' })
    liveEditor = container.querySelector('.blocknote-live-editor') as HTMLElement
    expect(liveEditor.getAttribute('lang')).toBe('en-US')
    expect(liveEditor.style.getPropertyValue('--fkemark-live-placeholder'))
      .toBe(JSON.stringify(translate('en', 'editor.livePlaceholder')))
  })

  it('renders minimap according to source or rendered view', async () => {
    const content = '# Minimap Title\n\n- item'

    await renderEditor(content, { showMinimap: true, minimapSide: 'right' }, undefined, 'source')
    let panel = container.querySelector('.minimap-panel')
    expect(panel?.classList.contains('minimap-panel--source')).toBe(true)
    expect(panel?.textContent).toContain('# Minimap Title')

    await renderEditor(content, { showMinimap: true, minimapSide: 'right' }, undefined, 'read')
    panel = container.querySelector('.minimap-panel')
    expect(panel?.classList.contains('minimap-panel--rendered')).toBe(true)
    expect(panel?.querySelector('h1')?.textContent).toBe('Minimap Title')
    expect(panel?.textContent).not.toContain('# Minimap Title')

    await renderEditor(content, { showMinimap: true, minimapSide: 'right' }, undefined, 'split')
    panel = container.querySelector('.minimap-panel')
    expect(panel?.classList.contains('minimap-panel--rendered')).toBe(true)
    expect(panel?.querySelector('h1')?.textContent).toBe('Minimap Title')
    expect(panel?.textContent).not.toContain('# Minimap Title')
  })

  it('updates the status line count after deferred large document edits', async () => {
    const editorRef = createRef<EditorHandle>()
    const onChange = vi.fn()
    const onLineCountChange = vi.fn()
    const content = Array.from({ length: 800 }, (_, index) => `line ${index + 1} ${'x'.repeat(150)}`).join('\n')

    await act(async () => {
      root.render(
        <Editor
          ref={editorRef}
          content={content}
          onChange={onChange}
          onLineCountChange={onLineCountChange}
          settings={settings}
          editorMode="live"
          onEditorModeChange={() => {}}
          onSlashCommand={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    const editor = editorRef.current?.getEditor()
    expect(editor).not.toBeNull()
    vi.useFakeTimers()

    await act(async () => {
      editor!.insertInlineContent('\nline 801')
      await Promise.resolve()
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(onLineCountChange).not.toHaveBeenCalledWith(801)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(onLineCountChange.mock.calls.at(-1)?.[0]).toBeGreaterThanOrEqual(801)
  })
  it('opens the BlockNote image menu and deletes the selected image', async () => {
    await renderEditor('![Example image](https://example.com/image.png)')
    const image = container.querySelector('.editor-inner img') as HTMLImageElement
    expect(image).not.toBeNull()

    await act(async () => {
      image.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }))
    })

    const menu = container.querySelector('.image-ctx-menu')
    expect(menu).not.toBeNull()
    const deleteButton = menu?.querySelector('[data-image-action="delete"]') as HTMLButtonElement
    expect(deleteButton).not.toBeNull()
    await clickMenuItem(deleteButton)
    expect(container.querySelector('.editor-inner img')).toBeNull()
  })

  it('updates a BlockNote table from the right-clicked cell', async () => {
    const editorRef = createRef<EditorHandle>()
    await renderEditor('| A | B |\n| --- | --- |\n| 1 | 2 |', {}, undefined, 'live', editorRef)
    const editor = editorRef.current?.getEditor()
    const cell = container.querySelector('.editor-inner td, .editor-inner th') as HTMLTableCellElement
    expect(editor).not.toBeNull()
    expect(cell).not.toBeNull()

    const rowsBefore = (editor!.document.find((block) => block.type === 'table')?.content as any).rows.length
    const domRowsBefore = container.querySelectorAll('.editor-inner tr').length
    await act(async () => {
      cell.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 90,
      }))
    })

    const insertMenu = container.querySelector('.table-ctx-menu')
    expect(insertMenu).not.toBeNull()
    const insertBelow = insertMenu?.querySelector('[data-table-action="insert-row-below"]') as HTMLButtonElement
    expect(insertBelow).not.toBeNull()
    await clickMenuItem(insertBelow)

    let tableBlock = editor!.document.find((block) => block.type === 'table') as any
    expect(tableBlock.content.rows.length).toBe(rowsBefore + 1)
    expect(container.querySelectorAll('.editor-inner tr').length).toBe(domRowsBefore + 1)

    const rowToDelete = container.querySelectorAll('.editor-inner tr')[1]
    const deleteCell = rowToDelete?.querySelector('td, th') as HTMLTableCellElement
    expect(deleteCell).not.toBeNull()
    await act(async () => {
      deleteCell.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 120,
      }))
    })

    const deleteMenu = container.querySelector('.table-ctx-menu')
    expect(deleteMenu).not.toBeNull()
    const deleteRow = deleteMenu?.querySelector('[data-table-action="delete-row"]') as HTMLButtonElement
    expect(deleteRow).not.toBeNull()
    await clickMenuItem(deleteRow)

    tableBlock = editor!.document.find((block) => block.type === 'table') as any
    expect(tableBlock.content.rows.length).toBe(rowsBefore)
    expect(container.querySelectorAll('.editor-inner tr').length).toBe(domRowsBefore)
  })

  it('updates the active BlockNote code block language', async () => {
    const editorRef = createRef<EditorHandle>()
    await renderEditor('```javascript\nconst value = 1\n```', {}, undefined, 'live', editorRef)
    const editor = editorRef.current?.getEditor()
    const codeBlock = editor?.document.find((block) => block.type === 'codeBlock')
    expect(codeBlock).toBeDefined()

    await act(async () => {
      editor!.setTextCursorPosition(codeBlock!, 'start')
      await Promise.resolve()
    })

    const input = container.querySelector('.code-lang-input') as HTMLInputElement
    expect(input).not.toBeNull()
    await act(async () => input.focus())
    const typescript = Array.from(container.querySelectorAll<HTMLButtonElement>('.code-lang-option'))
      .find((button) => button.textContent === 'typescript')
    expect(typescript).toBeDefined()
    await act(async () => {
      typescript!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })

    expect((editor!.getBlock(codeBlock!.id) as any).props.language).toBe('typescript')
  })

  it('keeps the cursor inside the code block after typing a fenced code shortcut and Space', async () => {
    const editorRef = createRef<EditorHandle>()
    await renderEditor('', {}, undefined, 'live', editorRef)
    const editor = editorRef.current?.getEditor()
    const tiptap = editor?._tiptapEditor as any
    expect(editor).not.toBeNull()

    await act(async () => {
      tiptap.commands.focus()
      tiptap.commands.insertContent('```')
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      expect((tiptap.view.dom as HTMLElement).dispatchEvent(event)).toBe(false)
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const block = editor!.getTextCursorPosition().block
    expect(block.type).toBe('codeBlock')
    expect((block as any).props.language).toBe('text')
    expect(tiptap.state.selection.$from.parent.type.spec.code).toBe(true)
  })

  it('点击双向链接时打开对应笔记而不是外部链接弹窗', async () => {
    const onOpenWikiLink = vi.fn()
    await renderEditor('前往 [[首页]]', {}, onOpenWikiLink)
    const link = container.querySelector('a[href^="#fkemark-wiki:"]') as HTMLAnchorElement

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      }))
    })

    expect(onOpenWikiLink).toHaveBeenCalledWith('首页')
    expect(container.querySelector('.link-dialog')).toBeNull()
  })
  it('点击超链接时关闭已有菜单并立即打开编辑弹窗', async () => {
    await renderEditor('![示例图片](https://example.com/image.png)\n\n[示例链接](https://example.com)')
    const image = container.querySelector('.editor-inner img') as HTMLImageElement
    const link = container.querySelector('.editor-inner a[href]') as HTMLAnchorElement

    await act(async () => {
      image.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }))
    })
    expect(container.querySelector('.image-ctx-menu')).not.toBeNull()

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      }))
    })

    expect(container.querySelector('.image-ctx-menu')).toBeNull()
    expect(container.querySelector('.link-dialog')).not.toBeNull()
  })

  it.each(['top', 'left', 'bottom', 'right'] as const)('非悬浮工具栏支持停靠在 %s', async (position) => {
    await renderEditor('工具栏布局', { toolbarFloating: false, toolbarPosition: position })

    expect(container.querySelector('.editor-pane')?.classList.contains('toolbar-docked')).toBe(true)
    expect(container.querySelector('.editor-pane')?.classList.contains(`toolbar-${position}`)).toBe(true)
    expect(container.querySelector('.editor-toolbar')?.classList.contains(`position-${position}`)).toBe(true)
  })

  it('悬浮工具栏支持切换到右侧', async () => {
    await renderEditor('悬浮工具栏', { toolbarFloating: true, toolbarPosition: 'right' })

    expect(container.querySelector('.editor-pane')?.classList.contains('toolbar-floating')).toBe(true)
    expect(container.querySelector('.editor-pane')?.classList.contains('toolbar-right')).toBe(true)
    expect(container.querySelector('.editor-toolbar')?.classList.contains('floating')).toBe(true)
    expect(container.querySelector('.editor-toolbar')?.classList.contains('position-right')).toBe(true)
  })

  it('applies toolbar visibility groups and explicit separators', async () => {
    const toolbarButtons = DEFAULT_TOOLBAR_ITEMS
      .filter((item) => item.id !== 'separator-1')
      .map((item) => {
        if (item.id === 'bold') return { ...item, placement: 'hidden' as const }
        if (item.id === 'italic' || item.id === 'strike') return { ...item, placement: 'format' as const }
        return { ...item }
      })
    const codeIndex = toolbarButtons.findIndex((item) => item.id === 'code')
    toolbarButtons.splice(codeIndex, 0, { id: 'separator-1', placement: 'toolbar', separatorBefore: false })
    await renderEditor('custom toolbar', { language: 'en', toolbarButtons })

    expect(container.querySelector('[data-toolbar-button="bold"]')).toBeNull()
    expect(container.querySelector('[data-toolbar-button="code"]')?.previousElementSibling?.classList.contains('tb-sep')).toBe(true)

    const groupButton = container.querySelector('[data-toolbar-group="format"] .tb-group-trigger') as HTMLButtonElement
    expect(groupButton).not.toBeNull()
    await act(async () => groupButton.click())

    expect(container.querySelector('.tb-group-menu')?.textContent).toContain('Ctrl+I')
    expect(container.querySelector('.tb-group-menu')?.textContent).toContain('Alt+S')
  })

  it('keeps additional toolbar actions hidden by default', async () => {
    await renderEditor('default toolbar')

    expect(container.querySelector('.snippets-trigger')).toBeNull()
    expect(container.querySelector('.spell-check-trigger')).toBeNull()
    expect(container.querySelector('.presentation-trigger')).toBeNull()
  })

  it('一键打开演示模式并按分隔线分页', async () => {
    const toolbarButtons = DEFAULT_TOOLBAR_ITEMS.map((item) =>
      item.id === 'presentation' ? { ...item, placement: 'toolbar' as const } : { ...item },
    )
    await renderEditor('# 第一页\n\n---\n\n# 第二页', { toolbarButtons })
    const trigger = container.querySelector('.presentation-trigger') as HTMLButtonElement

    expect(trigger).not.toBeNull()
    await act(async () => trigger.click())

    expect(container.querySelector('.presentation-overlay')).not.toBeNull()
    expect(container.querySelector('.presentation-page')?.textContent).toContain('1 / 2')
    expect(container.querySelector('.presentation-slide-content')?.textContent).toContain('第一页')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(container.querySelector('.presentation-page')?.textContent).toContain('2 / 2')
    expect(container.querySelector('.presentation-slide-content')?.textContent).toContain('第二页')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(container.querySelector('.presentation-overlay')).toBeNull()
  })
})
