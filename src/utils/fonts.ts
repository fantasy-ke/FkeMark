// 字体检测与枚举工具
// 通过 canvas measureText 检测系统可用字体

const CANDIDATE_FONTS = [
  // 中文系统默认
  { label: '系统默认', value: 'system-ui', group: '默认' },
  { label: '微软雅黑', value: 'Microsoft YaHei', group: '中文' },
  { label: '微软雅黑 UI', value: 'Microsoft YaHei UI', group: '中文' },
  { label: '苹方', value: 'PingFang SC', group: '中文' },
  { label: 'Hiragino Sans GB', value: 'Hiragino Sans GB', group: '中文' },
  { label: 'Heiti SC', value: 'Heiti SC', group: '中文' },
  { label: 'Source Han Sans SC', value: 'Source Han Sans SC', group: '中文' },
  { label: 'Noto Sans CJK SC', value: 'Noto Sans CJK SC', group: '中文' },
  { label: '方正书宋', value: 'FZShuSong', group: '中文' },
  { label: '宋体', value: 'SimSun', group: '中文' },
  { label: '黑体', value: 'SimHei', group: '中文' },
  { label: '楷体', value: 'KaiTi', group: '中文' },
  { label: '仿宋', value: 'FangSong', group: '中文' },
  // 英文/西文
  { label: 'Inter', value: 'Inter', group: '英文' },
  { label: 'Segoe UI', value: 'Segoe UI', group: '英文' },
  { label: 'SF Pro Display', value: 'SF Pro Display', group: '英文' },
  { label: 'Helvetica Neue', value: 'Helvetica Neue', group: '英文' },
  { label: 'Arial', value: 'Arial', group: '英文' },
  { label: 'Georgia', value: 'Georgia', group: '英文' },
  { label: 'Times New Roman', value: 'Times New Roman', group: '英文' },
  { label: 'Courier New', value: 'Courier New', group: '英文' },
  { label: 'Consolas', value: 'Consolas', group: '英文' },
  { label: 'Menlo', value: 'Menlo', group: '英文' },
  { label: 'Fira Code', value: 'Fira Code', group: '英文' },
  // 等宽/代码
  { label: 'JetBrains Mono', value: 'JetBrains Mono', group: '代码' },
  { label: 'Source Code Pro', value: 'Source Code Pro', group: '代码' },
  { label: 'Cascadia Code', value: 'Cascadia Code', group: '代码' },
  { label: 'Monaco', value: 'Monaco', group: '代码' },
  { label: 'Ubuntu Mono', value: 'Ubuntu Mono', group: '代码' },
]

// 使用 canvas 检测字体是否可用
function isFontAvailable(fontName: string): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const testStr = 'mmmmmmmmmmlli'
  const baseFont = 'monospace'
  ctx.font = `72px ${baseFont}`
  const baseWidth = ctx.measureText(testStr).width
  ctx.font = `72px "${fontName}", ${baseFont}`
  const testWidth = ctx.measureText(testStr).width
  return baseWidth !== testWidth
}

// 获取可用字体列表（带分组）
export function getAvailableFonts(): Array<{ label: string; value: string; group: string; available: boolean }> {
  return CANDIDATE_FONTS.map((f) => ({
    ...f,
    available: isFontAvailable(f.value),
  }))
}

// 默认编辑器字体
export const DEFAULT_FONT_FAMILY = 'system-ui'

// 字体列表（仅可用项）
export function getUsableFonts() {
  return getAvailableFonts().filter((f) => f.available)
}
