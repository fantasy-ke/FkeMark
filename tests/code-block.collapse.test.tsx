import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/app/appDefaults'
import { SettingsEditorSection } from '../src/components/settings/SettingsEditorSection'
import {
  CODE_BLOCK_COLLAPSED_HEIGHT_PX,
  bindCodeBlockCollapse,
  createCodeBlockCollapseToggle,
} from '../src/components/editor/useCodeBlockCollapse'
import { translate } from '../src/i18n'

const labels = {
  expand: 'Expand code block',
  collapse: 'Collapse code block',
  copy: 'Copy code',
  copied: 'Code copied',
}

function setScrollHeight(element: HTMLElement, value: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value })
}

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}

describe('code block collapse', () => {
  it('collapses only long BlockNote code blocks and toggles accessible labels', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="bn-block-content" data-content-type="codeBlock"><pre><code>long</code></pre></div>'
    const block = root.querySelector<HTMLElement>('[data-content-type="codeBlock"]')!
    const pre = block.querySelector<HTMLElement>('pre')!
    const button = createCodeBlockCollapseToggle()
    block.appendChild(button)
    setScrollHeight(pre, CODE_BLOCK_COLLAPSED_HEIGHT_PX + 1)

    const cleanup = bindCodeBlockCollapse(root, 'blocknote', labels)

    expect(block.getAttribute('data-code-block-collapsible')).toBe('true')
    expect(button.hidden).toBe(false)
    expect(button.getAttribute('aria-label')).toBe(labels.expand)
    button.click()
    expect(block.getAttribute('data-code-block-expanded')).toBe('true')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe(labels.collapse)
    button.click()
    expect(block.hasAttribute('data-code-block-expanded')).toBe(false)

    cleanup()
    expect(block.hasAttribute('data-code-block-collapsible')).toBe(false)
    expect(button.hidden).toBe(true)
  })

  it('copies BlockNote code text without interfering with syntax select', async () => {
    const writeText = mockClipboard()
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="bn-block-content" data-content-type="codeBlock">
        <div><select><option>typescript</option></select></div>
        <pre><code>const value = 1</code></pre>
      </div>
    `

    const cleanup = bindCodeBlockCollapse(root, 'blocknote', labels, false)
    const copyButton = root.querySelector<HTMLButtonElement>('[data-code-block-copy-button="true"]')!
    const select = root.querySelector<HTMLSelectElement>('select')!
    copyButton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(writeText).toHaveBeenCalledWith('const value = 1')
    expect(copyButton.getAttribute('aria-label')).toBe(labels.copied)
    expect(select.value).toBe('typescript')
    expect(root.contains(select)).toBe(true)

    cleanup()
  })

  it('wraps long preview code blocks without folding front matter', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="editor-preview-inner">
        <pre><code>long</code></pre>
        <pre data-frontmatter="true"><code>title: demo</code></pre>
      </div>
    `
    const blocks = root.querySelectorAll<HTMLElement>('pre')
    setScrollHeight(blocks[0], CODE_BLOCK_COLLAPSED_HEIGHT_PX + 80)
    setScrollHeight(blocks[1], CODE_BLOCK_COLLAPSED_HEIGHT_PX + 80)

    const cleanup = bindCodeBlockCollapse(root, 'preview', labels)
    const shell = root.querySelector<HTMLElement>('.code-block-collapse-shell')

    expect(shell).not.toBeNull()
    expect(shell?.querySelector('pre')).toBe(blocks[0])
    expect(blocks[1].parentElement?.classList.contains('code-block-collapse-shell')).toBe(false)
    shell?.querySelector<HTMLButtonElement>('[data-code-block-collapse-toggle="true"]')?.click()
    expect(shell?.getAttribute('data-code-block-expanded')).toBe('true')

    const writeText = mockClipboard()
    shell?.querySelector<HTMLButtonElement>('[data-code-block-copy-button="true"]')?.click()
    expect(writeText).toHaveBeenCalledWith('long')

    cleanup()
    expect(root.querySelector('.code-block-collapse-shell')).toBeNull()
    expect(blocks[0].parentElement?.classList.contains('editor-preview-inner')).toBe(true)
  })

  it('keeps preview copy available when collapse is disabled', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="editor-preview-inner"><pre><code>short</code></pre></div>'
    const writeText = mockClipboard()

    const cleanup = bindCodeBlockCollapse(root, 'preview', labels, false)
    const shell = root.querySelector<HTMLElement>('.code-block-collapse-shell')
    const copyButton = shell?.querySelector<HTMLButtonElement>('[data-code-block-copy-button="true"]')
    copyButton?.click()

    expect(shell).not.toBeNull()
    expect(shell?.hasAttribute('data-code-block-collapsible')).toBe(false)
    expect(writeText).toHaveBeenCalledWith('short')

    cleanup()
    expect(root.querySelector('.code-block-collapse-shell')).toBeNull()
  })

  it('provides a persisted default, translated labels, and collapse styling', () => {
    const editorCss = readFileSync(resolve(process.cwd(), 'src/styles/editor.css'), 'utf8')
    const markdownCss = readFileSync(resolve(process.cwd(), 'src/styles/markdown.css'), 'utf8')

    expect(DEFAULT_SETTINGS.codeBlockCollapseEnabled).toBe(true)
    expect(translate('zh-CN', 'editor.codeBlock.expand')).toBe('展开代码块')
    expect(translate('zh-CN', 'editor.codeBlock.copy')).toBe('复制代码')
    expect(translate('en', 'editor.codeBlock.collapse')).toBe('Collapse code block')
    expect(translate('en', 'editor.codeBlock.copied')).toBe('Code copied')
    expect(markdownCss).toContain('.code-block-copy-button')
    expect(markdownCss).toContain('.code-lang-picker')
    expect(editorCss).toContain('max-height: 320px;')
    expect(editorCss).toContain('linear-gradient(to bottom, transparent, var(--code-block-bg) 78%)')
    expect(editorCss).toContain('box-shadow: 0 6px 18px')
    expect(editorCss).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('SettingsEditorSection code block collapse toggle', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('updates the setting when the toggle is clicked', () => {
    const update = vi.fn()
    act(() => root.render(
      <SettingsEditorSection
        t={(key) => key}
        settings={DEFAULT_SETTINGS}
        update={update}
        currentFontKnown
        fontGroups={{ default: [], cjk: [], latin: [], mono: [] }}
        fonts={[]}
        groupLabels={{ default: 'Default', cjk: 'CJK', latin: 'Latin', mono: 'Mono' }}
        numInputStyle={{ width: 72 }}
      />,
    ))

    const toggle = container.querySelector<HTMLInputElement>('[data-setting="code-block-collapse"]')!
    expect(toggle.checked).toBe(true)
    act(() => toggle.click())
    expect(update).toHaveBeenCalledWith({ codeBlockCollapseEnabled: false })
  })
})
