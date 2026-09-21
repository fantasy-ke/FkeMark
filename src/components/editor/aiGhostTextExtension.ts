import { createExtension } from '@blocknote/core'
import type { EditorState, Transaction } from 'prosemirror-state'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/** 待接受的续写建议：文本与插入位置。 */
export interface AiGhostTextSuggestion {
  text: string
  pos: number
}

interface AiGhostTextState {
  suggestion: AiGhostTextSuggestion | null
}

export const aiGhostTextKey = new PluginKey<AiGhostTextState>('fkeMarkAiGhostText')

function createGhostTextWidget(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'ai-ghost-text'
  span.textContent = text
  span.setAttribute('contenteditable', 'false')
  span.setAttribute('aria-hidden', 'true')
  return span
}

export function createAiGhostTextPlugin(): Plugin<AiGhostTextState> {
  return new Plugin<AiGhostTextState>({
    key: aiGhostTextKey,
    state: {
      init: () => ({ suggestion: null }),
      apply(transaction, previous) {
        const meta = transaction.getMeta(aiGhostTextKey) as AiGhostTextState | undefined
        if (meta) return meta
        // 文档变化或光标移动后，原位置上的建议立即失效，避免接受时插入到错误位置。
        if (previous.suggestion && (transaction.docChanged || transaction.selectionSet)) {
          return { suggestion: null }
        }
        return previous
      },
    },
    props: {
      decorations(state) {
        const suggestion = aiGhostTextKey.getState(state)?.suggestion
        if (!suggestion) return DecorationSet.empty
        const pos = Math.max(0, Math.min(suggestion.pos, state.doc.content.size))
        return DecorationSet.create(state.doc, [
          Decoration.widget(pos, () => createGhostTextWidget(suggestion.text), {
            side: 1,
            key: 'fkemark-ai-ghost-text',
          }),
        ])
      },
    },
  })
}

export const aiGhostTextExtension = createExtension({
  key: 'fkeMarkAiGhostText',
  prosemirrorPlugins: [createAiGhostTextPlugin()],
})

export function readAiGhostText(state: EditorState): AiGhostTextSuggestion | null {
  return aiGhostTextKey.getState(state)?.suggestion ?? null
}

/** 写入或清除建议。只改插件元数据，不产生文档变更。 */
export function applyAiGhostText(
  transaction: Transaction,
  suggestion: AiGhostTextSuggestion | null,
): Transaction {
  return transaction.setMeta(aiGhostTextKey, { suggestion })
}
