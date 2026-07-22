import React, { createContext, useContext, useEffect } from 'react'
import type { AppSettings } from '../types'
import { getAppliedTheme, isDarkTheme } from '../utils/themes'

interface ThemeContextValue {
  theme: AppSettings['theme']
  setTheme: (theme: AppSettings['theme']) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
}

export function ThemeProvider({ children, settings, onSettingsChange }: ThemeProviderProps) {
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = isDarkTheme(settings.theme, systemDark)

  useEffect(() => {
    const root = window.document.documentElement
    
    root.setAttribute('data-theme', getAppliedTheme(settings.theme, systemDark))
    root.setAttribute('data-theme-mode', isDark ? 'dark' : 'light')
    
    // 保存主题到本地存储
    localStorage.setItem('theme', settings.theme)
  }, [isDark, settings.theme, systemDark])

  const setTheme = (theme: AppSettings['theme']) => {
    onSettingsChange({ ...settings, theme })
  }

  const value: ThemeContextValue = {
    theme: settings.theme,
    setTheme,
    isDark,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}