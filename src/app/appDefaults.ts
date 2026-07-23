import type { AppSettings } from '../types'
import type { Lang } from '../i18n'
import { DEFAULT_KEYMAP } from '../utils/keymap'
import { getBuildChannel } from '../utils/updater'

const BUILD_CHANNEL = getBuildChannel()

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 16,
  fontFamily: 'system-ui',
  markdownFontFamily: 'inherit',
  markdownFontSize: 0,
  autoSave: true,
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
  updateChannel: BUILD_CHANNEL,
  autoCheckUpdate: true,
  closeAction: 'ask' as const,
  skipClosePrompt: false,
  mermaid: false,
  vim: false,
  keymap: DEFAULT_KEYMAP,
}

export const DEFAULT_CONTENT_LANGS: Lang[] = ['zh-CN', 'en']

export function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

export function savePersisted(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}
