import { createExtension } from '@blocknote/core'
import type { EditorState, Transaction } from 'prosemirror-state'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/** 待接受的续写建议：文本与插入位置。 */
export interface AiGhostTextSuggestion {
  text: string
  pos: number
}

export interface AiGhostTextState {
  suggestion: AiGhostTextSuggestion | null
  /** 请求进行中的光标位置，用于在光标处渲染小加载图标；无请求时为 null。 */
  loadingAt: number | null
}

export const EMPTY_AI_GHOST_STATE: AiGhostTextState = { suggestion: null, loadingAt: null }

export const aiGhostTextKey = new PluginKey<AiGhostTextState>('fkeMarkAiGhostText')

function createGhostTextWidget(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'ai-ghost-text'
  span.textContent = text
  span.setAttribute('contenteditable', 'false')
  span.setAttribute('aria-hidden', 'true')
  return span
}

function createGhostLoadingWidget(): HTMLElement {
  const span = document.createElement('span')
  span.className = 'ai-ghost-loading'
  span.setAttribute('contenteditable', 'false')
  span.setAttribute('aria-hidden', 'true')
  return span
}

export function createAiGhostTextPlugin(): Plugin<AiGhostTextState> {
  return new Plugin<AiGhostTextState>({
    key: aiGhostTextKey,
    state: {
      init: () => EMPTY_AI_GHOST_STATE,
      apply(transaction, previous) {
        const meta = transaction.getMeta(aiGhostTextKey) as AiGhostTextState | undefined
        if (meta) return meta
        // 文档变化或光标移动后，原位置上的建议与加载状态立即失效，避免接受时插入到错误位置。
        if ((previous.suggestion || previous.loadingAt !== null) && (transaction.docChanged || transaction.selectionSet)) {
          return EMPTY_AI_GHOST_STATE
        }
        return previous
      },
    },
    props: {
      decorations(state) {
        const pluginState = aiGhostTextKey.getState(state)
        if (!pluginState) return DecorationSet.empty
        const clamp = (pos: number) => Math.max(0, Math.min(pos, state.doc.content.size))
        const decorations: Decoration[] = []
        if (pluginState.loadingAt !== null) {
          decorations.push(Decoration.widget(clamp(pluginState.loadingAt), createGhostLoadingWidget, {
            side: 1,
            key: 'fkemark-ai-ghost-loading',
          }))
        }
        if (pluginState.suggestion) {
          const text = pluginState.suggestion.text
          decorations.push(Decoration.widget(clamp(pluginState.suggestion.pos), () => createGhostTextWidget(text), {
            side: 1,
            key: 'fkemark-ai-ghost-text',
          }))
        }
        return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
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

/** 写入或清除建议与加载状态。只改插件元数据，不产生文档变更。 */
export function applyAiGhostText(transaction: Transaction, state: AiGhostTextState): Transaction {
  return transaction.setMeta(aiGhostTextKey, state)
}
