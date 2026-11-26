import { afterEach, expect, it, vi } from 'vitest'
import { safeTauriListener } from '../src/utils/tauri'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('Tauri 监听注册晚于清理时立即解绑，重复清理不再解绑', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  const dispose = vi.fn()
  let finish!: (unlisten: () => void) => void
  const registration = new Promise<() => void>(resolve => { finish = resolve })
  const cleanup = safeTauriListener(() => registration)!
  cleanup()
  expect(dispose).not.toHaveBeenCalled()

  finish(dispose)
  await registration
  expect(dispose).toHaveBeenCalledOnce()
  cleanup()
  expect(dispose).toHaveBeenCalledOnce()
})

it('普通浏览器不尝试注册 Tauri 监听', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const register = vi.fn()
  expect(safeTauriListener(register)).toBeUndefined()
  expect(register).not.toHaveBeenCalled()
})

it('Tauri 监听注册失败和异步解绑失败均记录警告', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const registerError = new Error('register failed')
  const disposeError = new Error('unlisten failed')
  safeTauriListener(() => { throw registerError })
  const cleanup = safeTauriListener(async () => async () => { throw disposeError })!
  await Promise.resolve()
  cleanup()
  await vi.waitFor(() => {
    expect(warn).toHaveBeenCalledWith(expect.any(String), registerError)
    expect(warn).toHaveBeenCalledWith(expect.any(String), disposeError)
  })
})
