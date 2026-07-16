// 轻量多语言 Provider / Hook
// 用法：
//   <I18nProvider language={settings.language} setLanguage={(l) => ...}>{children}</I18nProvider>
//   组件内：const { t, language } = useI18n()

import { createContext, useContext, type ReactNode } from 'react'
import { DICTS, type Dict, type Lang } from './locales'

export type { Lang }

interface I18nContextValue {
  language: Lang
  setLanguage: (lang: Lang) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

// 纯函数翻译（供无法使用 Hook 的场景，如 App 顶层状态栏）
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>
): string {
  const dict: Dict = DICTS[lang] ?? DICTS['zh-CN']
  let str = dict[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

interface I18nProviderProps {
  language: Lang
  setLanguage: (lang: Lang) => void
  children: ReactNode
}

export function I18nProvider({ language, setLanguage, children }: I18nProviderProps) {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(language, key, params)

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // 容错：未包裹时回退到中文
    return {
      language: 'zh-CN',
      setLanguage: () => {},
      t: (key, params) => translate('zh-CN', key, params),
    }
  }
  return ctx
}
