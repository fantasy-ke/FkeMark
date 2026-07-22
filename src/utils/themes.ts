import type { ThemeMode } from '../types'

export type ThemeTone = 'light' | 'dark'
export type ThemeGroup = 'basic' | 'palette'

export interface ThemeOption {
  id: ThemeMode
  labelKey: string
  tone: ThemeTone
  group: ThemeGroup
  accent: string
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: 'light', labelKey: 'settings.theme.light', tone: 'light', group: 'basic', accent: '#c96442' },
  { id: 'dark', labelKey: 'settings.theme.dark', tone: 'dark', group: 'basic', accent: '#c96442' },
  { id: 'system', labelKey: 'settings.theme.system', tone: 'light', group: 'basic', accent: '#8a8a8a' },
  { id: 'absolutely', labelKey: 'settings.theme.absolutely', tone: 'dark', group: 'palette', accent: '#ff6ac1' },
  { id: 'ayu', labelKey: 'settings.theme.ayu', tone: 'dark', group: 'palette', accent: '#ffcc66' },
  { id: 'catppuccin', labelKey: 'settings.theme.catppuccin', tone: 'dark', group: 'palette', accent: '#cba6f7' },
  { id: 'codex', labelKey: 'settings.theme.codex', tone: 'dark', group: 'palette', accent: '#10a37f' },
  { id: 'dracula', labelKey: 'settings.theme.dracula', tone: 'dark', group: 'palette', accent: '#bd93f9' },
  { id: 'everforest', labelKey: 'settings.theme.everforest', tone: 'dark', group: 'palette', accent: '#a7c080' },
  { id: 'github', labelKey: 'settings.theme.github', tone: 'light', group: 'palette', accent: '#0969da' },
  { id: 'gruvbox', labelKey: 'settings.theme.gruvbox', tone: 'dark', group: 'palette', accent: '#fabd2f' },
  { id: 'linear', labelKey: 'settings.theme.linear', tone: 'dark', group: 'palette', accent: '#5e6ad2' },
  { id: 'vercel', labelKey: 'settings.theme.vercel', tone: 'light', group: 'palette', accent: '#000000' },
  { id: 'vs-code-plus', labelKey: 'settings.theme.vsCodePlus', tone: 'dark', group: 'palette', accent: '#3794ff' },
  { id: 'xcode', labelKey: 'settings.theme.xcode', tone: 'light', group: 'palette', accent: '#007aff' },
] as const

export const QUICK_THEME_MODES = ['light', 'dark', 'system'] as const

export function isThemeMode(theme: unknown): theme is ThemeMode {
  return typeof theme === 'string' && THEME_OPTIONS.some((item) => item.id === theme)
}

export function normalizeTheme(theme: unknown): ThemeMode {
  return isThemeMode(theme) ? theme : 'system'
}

export function isDarkTheme(theme: ThemeMode, systemDark: boolean): boolean {
  if (theme === 'system') return systemDark
  return THEME_OPTIONS.find((item) => item.id === theme)?.tone === 'dark'
}

export function getAppliedTheme(theme: ThemeMode, systemDark: boolean): Exclude<ThemeMode, 'system'> {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}
