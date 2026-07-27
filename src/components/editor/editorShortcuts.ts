import type { Editor as TiptapEditor } from '@tiptap/react'
import { getCommandMeta, matchKeymap } from '../../utils/keymap'

// 鈹€鈹€ 缂栬緫鍣ㄥ揩鎹烽敭澶勭悊 鈹€鈹€
export function handleEditorShortcut(
  ed: TiptapEditor,
  event: KeyboardEvent,
  view: { state: { selection: { $from: { start: () => number; parent: { textContent: string }; parentOffset: number; depth: number; node: (d: number) => { type: { name: string }; childCount: number } } } } },
  keymap: Record<string, string>,
  openLinkDialog: () => void
): boolean {
  const key = event.key
  const chain = () => ed.chain() as any

  // 鈹€鈹€ 鍙嚜瀹氫箟鍛戒护锛堟煡 keymap 鍙嶆煡锛屼粎澶勭悊 editor 浣滅敤鍩燂級鈹€鈹€
  const cmd = matchKeymap(event, keymap)
  if (cmd && getCommandMeta(cmd)?.scope === 'editor') {
    event.preventDefault()
    switch (cmd) {
      case 'heading1': chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'heading2': chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'heading3': chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'heading4': chain().focus().toggleHeading({ level: 4 }).run(); break
      case 'heading5': chain().focus().toggleHeading({ level: 5 }).run(); break
      case 'heading6': chain().focus().toggleHeading({ level: 6 }).run(); break
      case 'paragraph': chain().focus().setParagraph().run(); break
      case 'bold': chain().focus().toggleBold().run(); break
      case 'italic': chain().focus().toggleItalic().run(); break
      case 'strike': chain().focus().toggleStrike().run(); break
      case 'blockquote': chain().focus().toggleBlockquote().run(); break
      case 'link': openLinkDialog(); break
    }
    return true
  }
  // 鈹€鈹€ Tab 鍦ㄨ〃鏍煎崟鍏冩牸鍐呭鑸?+ 鏈€鍚庝竴鏍兼柊寤鸿 鈹€鈹€
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
        chain().focus().addRowAfter().run()
        setTimeout(() => {
          ed.commands.goToNextCell?.()
        }, 0)
      }
      return true
    }
  }
  // Enter 澶勭悊锛?-- 鈫?鍒嗗壊绾匡紝``` 鈫?浠ｇ爜鍧?
  if (key === 'Enter' && !event.shiftKey) {
    const { $from } = view.state.selection
    const parent = $from.parent
    const textBefore = parent.textContent.slice(0, $from.parentOffset)
    const textAfter = parent.textContent.slice($from.parentOffset)
    const atEnd = $from.parentOffset === parent.textContent.length

    // --- 鈫?鍒嗗壊绾匡紙浠呰灏捐Е鍙戯級
    if (atEnd && /^---\s*$/.test(textBefore)) {
      event.preventDefault()
      const from = $from.start()
      const to = from + parent.textContent.length
      chain().focus().deleteRange({ from, to }).setHorizontalRule().run()
      return true
    }

    // ``` 鈫?浠ｇ爜鍧?
    // 鍦烘櫙1锛氳灏捐緭鍏?```lang + Enter
    // 鍦烘櫙2锛氳緭鍏ュ叚涓弽寮曞彿 `````` 鍏夋爣鍦ㄤ腑闂村洖杞?鈫?鍚庝笁涓綔涓虹粨灏炬爣璁帮紙涓㈠純锛夛紝鍒涘缓浠ｇ爜鍧?
    const fenceMatch = textBefore.match(/^```(\w*)\s*$/)
    if (fenceMatch && (atEnd || /^```\s*$/.test(textAfter))) {
      event.preventDefault()
      const from = $from.start()
      const to = from + parent.textContent.length
      const lang = fenceMatch[1] || 'text'
      chain().focus().deleteRange({ from, to }).setCodeBlock({ language: lang }).run()
      return true
    }
  }
  return false
}
