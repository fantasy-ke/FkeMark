// 多语言字典聚合入口
// 每种语言一个独立文件（见 zh-CN.ts / en.ts），在此统一导出。

import type { Dict, Lang } from './types'
import { zhCN } from './zh-CN'
import { enUS } from './en'

export type { Dict, Lang }

// 语言选择器中显示的语言名
export const LANG_LABELS: Record<Lang, string> = {
  'zh-CN': '简体中文',
  en: 'English',
}

// 所有语言字典
export const DICTS: Record<Lang, Dict> = {
  'zh-CN': zhCN,
  en: enUS,
}
