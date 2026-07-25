import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  showMarkers: true,
  autoBracket: true,
  spellCheckEnabled: true,
  showLineNumbers: false,
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
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  async function renderEditor(
    content: string,
    settingsOverrides: Partial<AppSettings> = {},
    onOpenWikiLink?: (target: string) => void,
    editorMode: EditorMode = 'live',
  ) {
    await act(async () => {
      root.render(
        <Editor
          content={content}
          onChange={() => {}}
          settings={{ ...settings, ...settingsOverrides }}
          editorMode={editorMode}
          onEditorModeChange={() => {}}
          onSlashCommand={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
          onOpenWikiLink={onOpenWikiLink}
        />,
      )
    })
  }

  it('shows complete source and measured rendered line numbers beyond 800 lines', async () => {
    const content = Array.from({ length: 805 }, (_, index) => `line ${index + 1}`).join('\n')

    for (const mode of ['live', 'read'] as EditorMode[]) {
      await renderEditor(content, { showLineNumbers: true }, undefined, mode)
      const gutter = container.querySelector('.editor-rendered-line-numbers')

      expect(gutter?.getAttribute('data-line-count')).toBe('805')
      expect(gutter?.querySelectorAll('.editor-rendered-line-number').length).toBeLessThanOrEqual(200)
    }

    await renderEditor(content, { showLineNumbers: true }, undefined, 'source')
    const sourceGutter = container.querySelector('.editor-line-numbers--source')
    expect(sourceGutter?.textContent?.split('\n')).toContain('805')
    expect(sourceGutter?.childElementCount).toBe(0)

    await renderEditor(content, { showLineNumbers: true }, undefined, 'split')
    const splitSourceGutter = container.querySelector('.editor-line-numbers--source')
    const splitPreviewGutter = container.querySelector('.editor-rendered-line-numbers--preview')
    expect(splitSourceGutter?.textContent?.split('\n')).toContain('805')
    expect(splitPreviewGutter?.getAttribute('data-line-count')).toBe('805')
  })

  it('keeps blank source lines in rendered gutters', async () => {
    const content = '# Heading\n\nParagraph\n'

    for (const mode of ['live', 'read', 'split'] as EditorMode[]) {
      await renderEditor(content, { showLineNumbers: true }, undefined, mode)
      const gutter = container.querySelector('.editor-rendered-line-numbers')

      expect(gutter?.getAttribute('data-line-count')).toBe('4')
      expect(gutter?.querySelector('[data-line-number="2"]')).not.toBeNull()
      expect(gutter?.querySelector('[data-line-number="4"]')).not.toBeNull()
    }
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

  it('updates live line numbers and status count after deferred large document edits', async () => {
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
          settings={{ ...settings, showLineNumbers: false }}
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

    const editor = editorRef.current?.getEditor()
    expect(editor).not.toBeNull()

    await act(async () => {
      editor!.chain().setTextSelection(editor!.state.doc.content.size).insertContent('<p>line 801</p>').run()
      await Promise.resolve()
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(onLineCountChange).toHaveBeenCalledWith(801)

    await act(async () => {
      root.render(
        <Editor
          ref={editorRef}
          content={content}
          onChange={onChange}
          onLineCountChange={onLineCountChange}
          settings={{ ...settings, showLineNumbers: true }}
          editorMode="live"
          onEditorModeChange={() => {}}
          onSlashCommand={() => {}}
          findReplaceVisible={false}
          findReplaceMode="find"
          onFindReplaceClose={() => {}}
          onFindReplaceModeChange={() => {}}
        />,
      )
      await Promise.resolve()
    })

    expect(container.querySelector('.editor-rendered-line-numbers')?.getAttribute('data-line-count')).toBe('801')
  })
  it('点击图片编辑时关闭已打开的图片右键菜单', async () => {
    await renderEditor('![示例图片](https://example.com/image.png)')
    const image = container.querySelector('.editor-inner img') as HTMLImageElement

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
      image.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: 130,
        clientY: 90,
      }))
    })

    expect(container.querySelector('.image-ctx-menu')).toBeNull()
    expect(container.querySelector('.image-edit-popup')).not.toBeNull()
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
    const link = container.querySelector('.editor-inner a.md-link') as HTMLAnchorElement

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
