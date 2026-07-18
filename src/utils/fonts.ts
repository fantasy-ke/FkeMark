// 字体枚举工具
// 通过 Tauri Rust 命令 get_system_fonts 动态读取「本机已安装」的字体家族，
// 而非写死候选列表。非 Tauri 环境 / 调用失败时回退到内置兜底列表。

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri'

// 字体分组键（UI 展示时再映射为翻译文本）
export type FontGroupKey = 'default' | 'cjk' | 'latin' | 'mono'

// 单个字体选项（value 即 CSS font-family）
export interface FontOption {
  value: string
  group: FontGroupKey
}

// 默认编辑器字体
export const DEFAULT_FONT_FAMILY = 'system-ui'

// 兜底字体（非 Tauri 环境或枚举失败时）
const FALLBACK_FONTS = [
  'system-ui',
  'Microsoft YaHei',
  'SimSun',
  'SimHei',
  'KaiTi',
  'Segoe UI',
  'Arial',
  'Georgia',
  'Consolas',
  'Courier New',
]

// 等宽字体关键字
const MONO_HINTS = ['mono', 'code', 'consolas', 'courier', 'menlo', 'terminal', '等宽']
// 中文/CJK 字体关键字
const CJK_HINTS = [
  '雅黑', 'yahei', 'pingfang', 'hei', 'song', 'kai', 'fang',
  'gothic', 'mincho', 'cjk', 'han', 'ming', 'sans sc', 'sans tc', 'sans jp',
  '微软', '苹方', '黑体', '宋体', '楷体', '仿宋',
]

// 启发式分组：按字体名粗略判断 中 / 西 / 等宽
function classify(name: string): FontGroupKey {
  const lower = name.toLowerCase()
  if (MONO_HINTS.some((h) => lower.includes(h))) return 'mono'
  // 含中文字符 → 中文
  if (/[一-鿿]/.test(name)) return 'cjk'
  if (CJK_HINTS.some((h) => lower.includes(h))) return 'cjk'
  return 'latin'
}

// 动态读取本机已安装字体家族（去重、排序）
export async function fetchSystemFontFamilies(): Promise<string[]> {
  if (isTauri()) {
    try {
      const res = await invoke<string[]>('get_system_fonts')
      if (Array.isArray(res) && res.length > 0) {
        return [...new Set(res.map((f) => f.trim()).filter(Boolean))]
      }
    } catch (e) {
      console.warn('[fonts] 获取系统字体失败，使用兜底列表:', e)
    }
  }
  return FALLBACK_FONTS
}

// 返回带分组的字体选项（system-ui 始终作为「默认」项排在首位）
export async function getAvailableFonts(): Promise<FontOption[]> {
  const families = await fetchSystemFontFamilies()
  const seen = new Set<string>()
  const opts: FontOption[] = [{ value: DEFAULT_FONT_FAMILY, group: 'default' }]
  seen.add(DEFAULT_FONT_FAMILY.toLowerCase())

  const sorted = [...families].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  )
  for (const f of sorted) {
    const key = f.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    opts.push({ value: f, group: classify(f) })
  }
  return opts
}
