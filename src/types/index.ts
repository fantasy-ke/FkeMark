// 文件条目类型
export interface FileEntry {
  name: string
  path: string
  isFile: boolean
  isDir: boolean
  size: number
  modified: number
}

// 应用程序设置
export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  autoSave: boolean
  autoSaveInterval: number
  lineHeight: 'compact' | 'normal' | 'relaxed'
  editorWidth: 'narrow' | 'medium' | 'wide'
  showMarkers: boolean
  autoBracket: boolean
  showLineNumbers: boolean
  showMinimap: boolean
  minimapSide: 'left' | 'right'
  editorMode: 'source' | 'live' | 'read'
  cornerRadius: number       // 整体布局圆角 (0-16px)
  buttonRadius: number       // 按钮圆角 (0-12px)
  toolbarFloating: boolean   // 工具栏悬浮显示（不占文档流）
  fontFamily: string         // 编辑器正文字体（系统字体名）
  language: 'zh-CN' | 'en'   // 界面语言
}

// 文件夹历史记录条目
export interface FolderHistoryEntry {
  path: string
  name: string
  openedAt: number   // 时间戳
}

// 编辑器视图模式
export type EditorMode = 'source' | 'live' | 'read'

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