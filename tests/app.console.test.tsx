import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppConsole } from '../src/components/AppConsole'
import { clearConsoleEntries, recordConsole } from '../src/utils/appConsole'

describe('应用控制台', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    clearConsoleEntries()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    clearConsoleEntries()
  })

  it('展开后显示已记录的输出，并可以关闭', () => {
    const onClose = vi.fn()
    recordConsole('error', ['保存失败'])

    act(() => root.render(<AppConsole onClose={onClose} />))

    expect(container.querySelector('.app-console-line.is-error')?.textContent).toContain('保存失败')
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="控制台"]')
      const close = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '关闭控制台')
      close?.click()
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})