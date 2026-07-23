import type { Editor as TiptapEditor } from '@tiptap/react'
import { getCommandMeta, matchKeymap } from '../../utils/keymap'

// ── 编辑器快捷键处理 ──
export function handleEditorShortcut(
  ed: TiptapEditor,
  event: KeyboardEvent,
  view: { state: { selection: { $from: { start: () => number; parent: { textContent: string }; parentOffset: number; depth: number; node: (d: number) => { type: { name: string }; childCount: number } } } } },
  keymap: Record<string, string>,
  openLinkDialog: () => void
): boolean {
  const key = event.key

  // ── 可自定义命令（查 keymap 反查，仅处理 editor 作用域）──
  const cmd = matchKeymap(event, keymap)
  if (cmd && getCommandMeta(cmd)?.scope === 'editor') {
    event.preventDefault()
    switch (cmd) {
      case 'heading1': ed.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'heading2': ed.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'heading3': ed.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'heading4': ed.chain().focus().toggleHeading({ level: 4 }).run(); break
      case 'heading5': ed.chain().focus().toggleHeading({ level: 5 }).run(); break
      case 'heading6': ed.chain().focus().toggleHeading({ level: 6 }).run(); break
      case 'paragraph': ed.chain().focus().setParagraph().run(); break
      case 'bold': ed.chain().focus().toggleBold().run(); break
      case 'italic': ed.chain().focus().toggleItalic().run(); break
      case 'strike': ed.chain().focus().toggleStrike().run(); break
      case 'blockquote': ed.chain().focus().toggleBlockquote().run(); break
      case 'link': openLinkDialog(); break
    }
    return true
  }
  // ── Tab 在表格单元格内导航 + 最后一格新建行 ──
  if (key === 'Tab' && !event.shiftKey) {
    const { $from } = view.state.selection
    let inCell = false
    let cellDepth = -1
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        inCell = true
        cellDepth = d
        break
      }
    }
    if (inCell && cellDepth > 0) {
      event.preventDefault()
      const beforePos = ed.state.selection.from
      ed.commands.goToNextCell?.() || false
      if (ed.state.selection.from === beforePos) {
        ed.chain().focus().addRowAfter().run()
        setTimeout(() => {
          ed.commands.goToNextCell?.()
        }, 0)
      }
      return true
    }
  }
  // Enter 处理：--- → 分割线，``` → 代码块
  if (key === 'Enter' && !event.shiftKey) {
    const { $from } = view.state.selection
    const parent = $from.parent
    const textBefore = parent.textContent.slice(0, $from.parentOffset)
    const textAfter = parent.textContent.slice($from.parentOffset)
    const atEnd = $from.parentOffset === parent.textContent.length

    // --- → 分割线（仅行尾触发）
    if (atEnd && /^---\s*$/.test(textBefore)) {
      event.preventDefault()
      const from = $from.start()
      const to = from + parent.textContent.length
      ed.chain().focus().deleteRange({ from, to }).setHorizontalRule().run()
      return true
    }

    // ``` → 代码块
    // 场景1：行尾输入 ```lang + Enter
    // 场景2：输入六个反引号 `````` 光标在中间回车 → 后三个作为结尾标记（丢弃），创建代码块
    const fenceMatch = textBefore.match(/^```(\w*)\s*$/)
    if (fenceMatch && (atEnd || /^```\s*$/.test(textAfter))) {
      event.preventDefault()
      const from = $from.start()
      const to = from + parent.textContent.length
      const lang = fenceMatch[1] || 'plaintext'
      ed.chain().focus().deleteRange({ from, to }).setCodeBlock({ language: lang }).run()
      return true
    }
  }
  return false
}
