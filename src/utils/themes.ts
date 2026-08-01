import type { ThemeMode } from '../types'

export type ThemeTone = 'light' | 'dark'
export type ThemeGroup = 'basic' | 'palette'

export interface ThemePreview {
  sidebar: string
  panel: string
  surface: string
  line: string
  swatches: readonly [string, string, string]
}

export interface ThemeOption {
  id: ThemeMode
  labelKey: string
  descriptionKey: string
  tone: ThemeTone
  group: ThemeGroup
  accent: string
  preview: ThemePreview
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'light',
    labelKey: 'settings.theme.light',
    descriptionKey: 'settings.theme.light.desc',
    tone: 'light',
    group: 'basic',
    accent: '#c96442',
    preview: { sidebar: '#f7f7f8', panel: '#ffffff', surface: '#f3f4f6', line: '#c96442', swatches: ['#c96442', '#8a8a8a', '#f7f7f8'] },
  },
  {
    id: 'dark',
    labelKey: 'settings.theme.dark',
    descriptionKey: 'settings.theme.dark.desc',
    tone: 'dark',
    group: 'basic',
    accent: '#c96442',
    preview: { sidebar: '#0f0f0f', panel: '#1a1a1a', surface: '#252525', line: '#e07a54', swatches: ['#c96442', '#8a8a8a', '#1a1a1a'] },
  },
  {
    id: 'system',
    labelKey: 'settings.theme.system',
    descriptionKey: 'settings.theme.system.desc',
    tone: 'light',
    group: 'basic',
    accent: '#8a8a8a',
    preview: { sidebar: '#e5e7eb', panel: '#ffffff', surface: '#f3f4f6', line: '#8a8a8a', swatches: ['#1f2937', '#8a8a8a', '#f7f7f8'] },
  },
  {
    id: 'ayu',
    labelKey: 'settings.theme.ayu',
    descriptionKey: 'settings.theme.ayu.desc',
    tone: 'dark',
    group: 'palette',
    accent: '#ffcc66',
    preview: { sidebar: '#0f1419', panel: '#171f27', surface: '#1f2a35', line: '#ffcc66', swatches: ['#ffcc66', '#7fd962', '#f29e74'] },
  },
  {
    id: 'catppuccin',
    labelKey: 'settings.theme.catppuccin',
    descriptionKey: 'settings.theme.catppuccin.desc',
    tone: 'light',
    group: 'palette',
    accent: '#8839ef',
    preview: { sidebar: '#e6e9ef', panel: '#eff1f5', surface: '#dce0e8', line: '#8839ef', swatches: ['#8839ef', '#1e66f5', '#d20f39'] },
  },
  {
    id: 'codex',
    labelKey: 'settings.theme.codex',
    descriptionKey: 'settings.theme.codex.desc',
    tone: 'dark',
    group: 'palette',
    accent: '#10a37f',
    preview: { sidebar: '#0d1117', panel: '#161b22', surface: '#21262d', line: '#10a37f', swatches: ['#10a37f', '#7dd3c7', '#8b949e'] },
  },
  {
    id: 'dracula',
    labelKey: 'settings.theme.dracula',
    descriptionKey: 'settings.theme.dracula.desc',
    tone: 'dark',
    group: 'palette',
    accent: '#bd93f9',
    preview: { sidebar: '#282a36', panel: '#343746', surface: '#3b3e50', line: '#bd93f9', swatches: ['#bd93f9', '#50fa7b', '#ff79c6'] },
  },
  {
    id: 'everforest',
    labelKey: 'settings.theme.everforest',
    descriptionKey: 'settings.theme.everforest.desc',
    tone: 'light',
    group: 'palette',
    accent: '#8da101',
    preview: { sidebar: '#f4f0d9', panel: '#fdf6e3', surface: '#efebd4', line: '#8da101', swatches: ['#8da101', '#35a77c', '#dfa000'] },
  },
  {
    id: 'github',
    labelKey: 'settings.theme.github',
    descriptionKey: 'settings.theme.github.desc',
    tone: 'light',
    group: 'palette',
    accent: '#0969da',
    preview: { sidebar: '#f6f8fa', panel: '#ffffff', surface: '#eff2f5', line: '#0969da', swatches: ['#0969da', '#57606a', '#ffffff'] },
  },
  {
    id: 'linear',
    labelKey: 'settings.theme.linear',
    descriptionKey: 'settings.theme.linear.desc',
    tone: 'dark',
    group: 'palette',
    accent: '#5e6ad2',
    preview: { sidebar: '#08090f', panel: '#11121a', surface: '#191b25', line: '#5e6ad2', swatches: ['#5e6ad2', '#9ca3af', '#f7f8f8'] },
  },
  {
    id: 'vercel',
    labelKey: 'settings.theme.vercel',
    descriptionKey: 'settings.theme.vercel.desc',
    tone: 'light',
    group: 'palette',
    accent: '#000000',
    preview: { sidebar: '#fafafa', panel: '#ffffff', surface: '#f5f5f5', line: '#000000', swatches: ['#000000', '#666666', '#ffffff'] },
  },
  {
    id: 'vs-code-plus',
    labelKey: 'settings.theme.vsCodePlus',
    descriptionKey: 'settings.theme.vsCodePlus.desc',
    tone: 'dark',
    group: 'palette',
    accent: '#3794ff',
    preview: { sidebar: '#1e1e1e', panel: '#252526', surface: '#2d2d30', line: '#3794ff', swatches: ['#3794ff', '#9cdcfe', '#6a9955'] },
  },
  {
    id: 'xcode',
    labelKey: 'settings.theme.xcode',
    descriptionKey: 'settings.theme.xcode.desc',
    tone: 'light',
    group: 'palette',
    accent: '#007aff',
    preview: { sidebar: '#f5f7fb', panel: '#ffffff', surface: '#eef2f8', line: '#007aff', swatches: ['#007aff', '#6c707a', '#ffffff'] },
  },
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
