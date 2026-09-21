/**
 * `==高亮==` 对应的编辑器样式。
 *
 * BlockNote 默认样式里没有高亮，因此需要显式注册：渲染为 `<mark>`，
 * 并通过 parse / toExternalHTML 与 Markdown 传输层的 `<mark>` 标记保持一致。
 */
import { createStyleSpec } from '@blocknote/core'

export const highlightStyleSpec = createStyleSpec(
  {
    type: 'highlight' as const,
    propSchema: 'boolean' as const,
  },
  {
    parse(element) {
      return element.tagName === 'MARK' ? true : undefined
    },
    render() {
      const mark = document.createElement('mark')
      return { dom: mark, contentDOM: mark }
    },
    toExternalHTML() {
      const mark = document.createElement('mark')
      return { dom: mark, contentDOM: mark }
    },
  },
)
