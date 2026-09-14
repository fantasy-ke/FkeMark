export const AUTO_SAVE_INTERVAL_OPTIONS = [300, 1000, 5000] as const

export type AutoSaveInterval = typeof AUTO_SAVE_INTERVAL_OPTIONS[number]

export function normalizeAutoSaveInterval(value: number): AutoSaveInterval {
  return AUTO_SAVE_INTERVAL_OPTIONS.reduce((closest, option) => (
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest
  ))
}

export function formatAutoSaveInterval(value: number, language: 'zh-CN' | 'en') {
  if (value < 1000) return language === 'zh-CN' ? `${value} 毫秒` : `${value} ms`
  const seconds = value / 1000
  return language === 'zh-CN' ? `${seconds} 秒` : `${seconds} s`
}
