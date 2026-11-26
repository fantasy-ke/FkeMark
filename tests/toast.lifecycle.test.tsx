import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ToastCenter } from '../src/components/ToastCenter'
import { I18nProvider } from '../src/i18n'
import { notify } from '../src/utils/toast'

it('同一条通知变为常驻时不被旧计时器关闭', () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  try {
    act(() => root.render(<I18nProvider language="en" setLanguage={() => {}}><ToastCenter /></I18nProvider>))
    act(() => notify('正在下载', 'info', { id: 'download', duration: 100 }))
    act(() => notify('等待安装', 'info', { id: 'download', duration: 0 }))
    act(() => { vi.advanceTimersByTime(100) })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('等待安装')
  } finally {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})
