import type { AppSettings } from '../types'
import type { Lang } from '../i18n'
import { DEFAULT_KEYMAP } from '../utils/keymap'
import { getBuildChannel } from '../utils/updater'
import { DEFAULT_LOCAL_AI_ENDPOINT, DEFAULT_MARKDOWN_AI_PROMPT } from '../utils/aiAssistant'
import { SMMS_UPLOAD_ENDPOINT } from '../utils/imageUpload'
import { DEFAULT_TOOLBAR_ITEMS } from '../utils/toolbar'
import { DEFAULT_VERSION_SNAPSHOT_LIMIT } from '../utils/versionHistory'

const BUILD_CHANNEL = getBuildChannel()

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 16,
  fontFamily: 'system-ui',
  markdownFontFamily: 'inherit',
  markdownFontSize: 0,
  autoSave: true,
  autoSaveInterval: 300,
  versionSnapshotLimit: DEFAULT_VERSION_SNAPSHOT_LIMIT,
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
  updateChannel: BUILD_CHANNEL,
  autoCheckUpdate: true,
  closeAction: 'ask' as const,
  skipClosePrompt: false,
  aiEnabled: false,
  aiProvider: 'local',
  aiEndpoint: DEFAULT_LOCAL_AI_ENDPOINT,
  aiApiKey: '',
  aiModel: 'llama3.1',
  aiTargetLanguage: 'English',
  aiTemperature: 0.3,
  aiMarkdownPrompt: DEFAULT_MARKDOWN_AI_PROMPT,
  imageUploadMode: 'local',
  smmsToken: '',
  smmsUploadUrl: SMMS_UPLOAD_ENDPOINT,
  customImageUploadUrl: '',
  customImageUploadToken: '',
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavPublicUrl: '',
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
