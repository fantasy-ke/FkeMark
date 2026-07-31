import { describe, expect, it } from 'vitest'
import {
  canConfigureDevtoolsAccess,
  isDevtoolsShortcut,
  shouldAllowDevtoolsAccess,
  shouldBlockBrowserContextMenu,
} from '../src/utils/updater'

function keyboardEvent(key: string, patch: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...patch,
  } as KeyboardEvent
}

describe('DevTools access policy', () => {
  it('only exposes configuration in dev builds', () => {
    expect(canConfigureDevtoolsAccess('dev')).toBe(true)
    expect(canConfigureDevtoolsAccess('latest')).toBe(false)
  })

  it('requires both dev build and explicit user opt-in', () => {
    expect(shouldAllowDevtoolsAccess('dev', { devtoolsAccessEnabled: true })).toBe(true)
    expect(shouldAllowDevtoolsAccess('dev', { devtoolsAccessEnabled: false })).toBe(false)
    expect(shouldAllowDevtoolsAccess('latest', { devtoolsAccessEnabled: true })).toBe(false)
  })

  it('detects common DevTools shortcuts', () => {
    expect(isDevtoolsShortcut(keyboardEvent('F12'))).toBe(true)
    expect(isDevtoolsShortcut(keyboardEvent('i', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isDevtoolsShortcut(keyboardEvent('J', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isDevtoolsShortcut(keyboardEvent('c', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isDevtoolsShortcut(keyboardEvent('I', { metaKey: true, altKey: true }))).toBe(true)
    expect(isDevtoolsShortcut(keyboardEvent('s', { ctrlKey: true }))).toBe(false)
  })

  it('keeps custom context menus that already prevented the native menu', () => {
    expect(shouldBlockBrowserContextMenu({ defaultPrevented: false })).toBe(true)
    expect(shouldBlockBrowserContextMenu({ defaultPrevented: true })).toBe(false)
  })
})
