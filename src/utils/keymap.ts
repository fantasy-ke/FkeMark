/**
 * 快捷键自定义基础设施
 *
 * - DEFAULT_KEYMAP：命令 → 默认组合键
 * - COMMANDS：可自定义命令的元数据（用于设置 UI 渲染）
 * - comboFromEvent：把 KeyboardEvent 规范化为组合键字符串
 * - matchKeymap：根据当前按键 + keymap 反查命中的命令 id
 *
 * 组合键格式（统一小写字母、显式 Shift）：
 *   "Ctrl+b" / "Ctrl+Shift+s" / "Alt+s" / "Ctrl+1" / "F11" / "Ctrl+Shift+f"
 * 注：Ctrl 同时匹配 Ctrl 与 Meta(Cmd)，跨平台一致。
 */

export type CommandScope = 'editor' | 'app'

export interface CommandMeta {
  id: string
  /** i18n key（在 shortcuts 命名空间下） */
  labelKey: string
  defaultKey: string
  scope: CommandScope
}

export const COMMANDS: CommandMeta[] = [
  // ── 编辑器内命令 ──
  { id: 'heading1', labelKey: 'shortcuts.heading1', defaultKey: 'Ctrl+1', scope: 'editor' },
  { id: 'heading2', labelKey: 'shortcuts.heading2', defaultKey: 'Ctrl+2', scope: 'editor' },
  { id: 'heading3', labelKey: 'shortcuts.heading3', defaultKey: 'Ctrl+3', scope: 'editor' },
  { id: 'heading4', labelKey: 'shortcuts.heading4', defaultKey: 'Ctrl+4', scope: 'editor' },
  { id: 'heading5', labelKey: 'shortcuts.heading5', defaultKey: 'Ctrl+5', scope: 'editor' },
  { id: 'heading6', labelKey: 'shortcuts.heading6', defaultKey: 'Ctrl+6', scope: 'editor' },
  { id: 'paragraph', labelKey: 'shortcuts.paragraph', defaultKey: 'Ctrl+0', scope: 'editor' },
  { id: 'bold', labelKey: 'shortcuts.bold', defaultKey: 'Ctrl+b', scope: 'editor' },
  { id: 'italic', labelKey: 'shortcuts.italic', defaultKey: 'Ctrl+i', scope: 'editor' },
  { id: 'strike', labelKey: 'shortcuts.strike', defaultKey: 'Ctrl+Shift+s', scope: 'editor' },
  { id: 'blockquote', labelKey: 'shortcuts.blockquote', defaultKey: 'Ctrl+Shift+q', scope: 'editor' },
  { id: 'link', labelKey: 'shortcuts.link', defaultKey: 'Ctrl+k', scope: 'editor' },
  // ── 全局应用命令 ──
  { id: 'save', labelKey: 'shortcuts.save', defaultKey: 'Ctrl+s', scope: 'app' },
  { id: 'cycleMode', labelKey: 'shortcuts.cycleMode', defaultKey: 'Ctrl+Shift+f', scope: 'app' },
  { id: 'focusMode', labelKey: 'shortcuts.focusMode', defaultKey: 'F11', scope: 'app' },
  { id: 'newFile', labelKey: 'shortcuts.newFile', defaultKey: 'Ctrl+n', scope: 'app' },
  { id: 'openFile', labelKey: 'shortcuts.openFile', defaultKey: 'Ctrl+o', scope: 'app' },
  { id: 'openFolder', labelKey: 'shortcuts.openFolder', defaultKey: 'Ctrl+Shift+o', scope: 'app' },
  { id: 'find', labelKey: 'shortcuts.find', defaultKey: 'Ctrl+f', scope: 'app' },
  { id: 'replace', labelKey: 'shortcuts.replace', defaultKey: 'Ctrl+h', scope: 'app' },
  { id: 'palette', labelKey: 'shortcuts.palette', defaultKey: 'Ctrl+p', scope: 'app' },
  { id: 'closeTab', labelKey: 'shortcuts.closeTab', defaultKey: 'Ctrl+w', scope: 'app' },
  { id: 'recycleBin', labelKey: 'shortcuts.recycleBin', defaultKey: 'Ctrl+Shift+b', scope: 'app' },
]

export const DEFAULT_KEYMAP: Record<string, string> = COMMANDS.reduce(
  (acc, c) => {
    acc[c.id] = c.defaultKey
    return acc
  },
  {} as Record<string, string>
)

const COMMAND_MAP = new Map(COMMANDS.map((c) => [c.id, c]))
export function getCommandMeta(id: string): CommandMeta | undefined {
  return COMMAND_MAP.get(id)
}

/** 合并用户 keymap 与默认值（用户缺失/无效时用默认） */
export function resolveKeymap(keymap?: Record<string, string> | null): Record<string, string> {
  return { ...DEFAULT_KEYMAP, ...(keymap || {}) }
}

/** 把 KeyboardEvent 规范化为组合键字符串 */
export function comboFromEvent(e: KeyboardEvent): string {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  const isSingle = e.key.length === 1
  let k = isSingle ? e.key.toLowerCase() : e.key
  if (e.shiftKey) mods.push('Shift')
  return [...mods, k].join('+')
}

/** 反查：当前按键命中 keymap 中的哪个命令，返回命令 id 或 null */
export function matchKeymap(e: KeyboardEvent, keymap: Record<string, string>): string | null {
  const combo = comboFromEvent(e)
  for (const [id, key] of Object.entries(keymap)) {
    if (key && key.toLowerCase() === combo.toLowerCase()) return id
  }
  return null
}

/** 组合键展示文本（把 Ctrl 等保持原样，便于阅读） */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => (p === 'Ctrl' ? 'Ctrl' : p === 'Shift' ? 'Shift' : p === 'Alt' ? 'Alt' : p === 'Space' ? 'Space' : p))
    .join('+')
}
