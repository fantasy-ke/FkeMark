import type { BlockNoteEditor } from '@blocknote/core'

// BlockNote 内部基于 TipTap 创建 ProseMirror 编辑器实例，实时编辑器的控制器、
// 快捷键与 AI 相关逻辑需要直接访问该底层实例。这里从 BlockNote 自身的类型反推，
// 而不是直接 import '@tiptap/core'，避免项目声明的 TipTap 版本与 BlockNote
// 实际依赖的版本错配（两者当前分属不同的主版本）。
export type TiptapEditor = BlockNoteEditor['_tiptapEditor']
