// 文件条目类型
export interface FileEntry {
  name: string
  path: string
  isFile: boolean
  isDir: boolean
  size: number
  modified: number
}

// 更新通道
export type UpdateChannel = 'latest' | 'dev'

// 应用程序设置
export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  fontFamily: string         // 编辑器正文字体（系统字体名）
  markdownFontFamily: string // Markdown 视图（阅读模式）字体；'inherit' 表示跟随编辑器字体
  markdownFontSize: number   // Markdown 视图字号；0 表示跟随编辑器字号
  autoSave: boolean
  autoSaveInterval: number
  lineHeight: 'compact' | 'normal' | 'relaxed'
  editorWidth: 'narrow' | 'medium' | 'wide'
  showMarkers: boolean
  autoBracket: boolean
  showLineNumbers: boolean
  showMinimap: boolean
  minimapSide: 'left' | 'right'
  editorMode: 'source' | 'live' | 'read' | 'split'
  cornerRadius: number       // 整体布局圆角 (0-16px)
  buttonRadius: number       // 按钮圆角 (0-12px)
  toolbarFloating: boolean   // 工具栏悬浮显示（不占文档流）
  language: 'zh-CN' | 'en'   // 界面语言
  focusMode: boolean           // 专注模式：隐藏无关UI元素
  updateChannel: UpdateChannel // 更新通道：latest（正式版）/ dev（开发版）
  autoCheckUpdate: boolean     // 启动时自动检查更新
  // ── 窗口关闭行为 ──
  closeAction: 'ask' | 'minimize' | 'close'  // 点击关闭按钮时的行为
  skipClosePrompt: boolean   // 是否跳过关闭提示（用户勾选了"以后不再提示"）
  // ── 实验性功能 ──
  mermaid: boolean            // Mermaid 图表渲染
  vim: boolean                // Vim 编辑模式
  // ── 快捷键自定义：命令 id → 组合键字符串 ──
  keymap: Record<string, string>
}

// 文件夹历史记录条目
export interface FolderHistoryEntry {
  path: string
  name: string
  openedAt: number   // 时间戳
}

// 编辑器视图模式
export type EditorMode = 'source' | 'live' | 'read' | 'split'

// 编辑器状态
export interface EditorState {
  isFocused: boolean
  currentSelection: {
    from: number
    to: number
  } | null
  showMarkdown: boolean
}

// 光标位置信息
export interface CursorPosition {
  line: number
  ch: number
  nodeType?: string
}

// 斜杠命令项
export interface SlashCommand {
  id: string
  title: string
  description?: string
  icon?: string
  shortcut?: string
  action: () => void
}

// 主题配置
export interface ThemeConfig {
  name: string
  colors: {
    background: string
    foreground: string
    sidebar: string
    border: string
    accent: string
    delimiter: string
  }
}

// 文件树节点
export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  expanded?: boolean
}

// TOC目录项
export interface TocItem {
  level: number
  text: string
  id: string
  element: HTMLElement
}