import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '../src/components/Editor'
import type { AppSettings } from '../src/types'

const settings: AppSettings = {
  theme: 'system',
  fontSize: 16,
  fontFamily: 'system-ui',
  markdownFontFamily: 'inherit',
  markdownFontSize: 0,
  autoSave: false,
  autoSaveInterval: 300,
  lineHeight: 'normal',
  editorWidth: 'medium',
  showMarkers: true,
  autoBracket: true,
  showLineNumbers: false,
  showMinimap: false,
  minimapSide: 'right',
  editorMode: 'live',
  cornerRadius: 6,
  buttonRadius: 4,
  toolbarFloating: true,
  toolbarPosition: 'top',
  language: 'zh-CN',
  focusMode: false,
  updateChannel: 'dev',
  autoCheckUpdate: false,
  closeAction: 'ask',
  skipClosePrompt: false,
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

  async function renderEditor(content: string, settingsOverrides: Partial<AppSettings> = {}) {
    await act(async () => {
      root.render(
        <Editor
          content={content}
          onChange={() => {}}
          settings={{ ...settings, ...settingsOverrides }}
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
  }

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

  it('一键打开演示模式并按分隔线分页', async () => {
    await renderEditor('# 第一页\n\n---\n\n# 第二页')
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
