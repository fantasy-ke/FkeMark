import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { FindReplaceBar } from '../src/components/FindReplaceBar'

describe('FindReplaceBar 图标', () => {
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
    vi.restoreAllMocks()
  })

  function renderBar(mode: 'find' | 'replace') {
    act(() => root.render(
      <I18nProvider language="en" setLanguage={() => {}}>
        <FindReplaceBar
          editor={null}
          visible
          mode={mode}
          onClose={() => {}}
          onModeChange={() => {}}
          forceTextMode
          content=""
          onContentChange={() => {}}
        />
      </I18nProvider>,
    ))
  }

  it('展开替换栏按钮不再使用下一个匹配的箭头图标', () => {
    renderBar('find')

    const nextButton = container.querySelector<HTMLButtonElement>('button[title="Next match (Enter)"]')!
    const expandButton = container.querySelector<HTMLButtonElement>('button[title="Expand replace bar"]')!

    expect(nextButton.querySelector('polyline')?.getAttribute('points')).toBe('6 9 12 15 18 9')
    expect(expandButton.querySelector('polyline')).toBeNull()
    expect(expandButton.querySelectorAll('rect')).toHaveLength(2)
    expect(Array.from(expandButton.querySelectorAll('path')).map((path) => path.getAttribute('d')))
      .toEqual(['M18 14v6', 'M15 17h6'])
  })

  it('收起替换栏按钮使用移除替换行图标', () => {
    renderBar('replace')

    const collapseButton = container.querySelector<HTMLButtonElement>('button[title="Collapse replace bar"]')!

    expect(collapseButton.querySelector('polyline')).toBeNull()
    expect(collapseButton.querySelectorAll('rect')).toHaveLength(2)
    expect(Array.from(collapseButton.querySelectorAll('path')).map((path) => path.getAttribute('d')))
      .toEqual(['M15 17h6'])
  })
})
