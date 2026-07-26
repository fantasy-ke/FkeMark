// Adapted from refactoringhq/tolaria progressive BlockNote document application (AGPL-3.0-only, commit a904e2f).
import { recordEditorPerformanceOperation } from './useEditorPerformanceDiagnostics'
import type { AnyBlockNoteEditor, BlockNoteBlocks } from './blockNoteMarkdown'

export const PROGRESSIVE_BLOCK_APPLY_THRESHOLD = 320
export const PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE = 48
export const PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE = 120

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

function safeDocumentBlocks(editor: AnyBlockNoteEditor): unknown[] {
  return editor.document.length ? editor.document : [{ type: 'paragraph', content: [], children: [] }]
}

function replaceDocument(editor: AnyBlockNoteEditor, blocks: BlockNoteBlocks): void {
  editor.replaceBlocks(safeDocumentBlocks(editor) as never[], blocks as never[])
}

export async function applyBlockNoteDocument(options: {
  blocks: BlockNoteBlocks
  editor: AnyBlockNoteEditor
  editable: boolean
  shouldAbort?: () => boolean
  sourceCharacters?: number
  sourceLines?: number
  suppressChangeRef: { current: boolean }
}): Promise<boolean> {
  const {
    blocks, editor, editable, shouldAbort, sourceCharacters, sourceLines, suppressChangeRef,
  } = options
  const safeBlocks = blocks.length ? blocks : [{ type: 'paragraph', content: [], children: [] }]
  const startedAt = now()
  const progressive = safeBlocks.length >= PROGRESSIVE_BLOCK_APPLY_THRESHOLD
  let appliedChunks = 0
  let slowestChunkMs = 0
  const recordChunk = (durationMs: number, startIndex: number, chunkSize: number) => {
    slowestChunkMs = Math.max(slowestChunkMs, durationMs)
    if (durationMs < 50) return
    recordEditorPerformanceOperation('blocknote.apply.chunk', durationMs, {
      chunkIndex: appliedChunks + 1,
      startIndex,
      chunkSize,
      sourceCharacters: sourceCharacters ?? null,
      sourceLines: sourceLines ?? null,
    })
  }

  suppressChangeRef.current = true
  editor.isEditable = false
  try {
    if (!progressive) {
      if (shouldAbort?.()) return false
      const chunkStartedAt = now()
      replaceDocument(editor, safeBlocks)
      recordChunk(now() - chunkStartedAt, 0, safeBlocks.length)
      appliedChunks = 1
      return true
    }

    const initialChunkStartedAt = now()
    replaceDocument(editor, safeBlocks.slice(0, PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE))
    recordChunk(now() - initialChunkStartedAt, 0, PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE)
    appliedChunks = 1
    for (
      let index = PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE;
      index < safeBlocks.length;
      index += PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE
    ) {
      await nextFrame()
      if (shouldAbort?.()) return false
      const reference = editor.document.at(-1)
      const chunk = safeBlocks.slice(index, index + PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE)
      const chunkStartedAt = now()
      if (!reference) {
        replaceDocument(editor, chunk)
      } else {
        editor.insertBlocks(chunk as never[], reference, 'after')
      }
      recordChunk(now() - chunkStartedAt, index, chunk.length)
      appliedChunks += 1
    }
    return true
  } finally {
    suppressChangeRef.current = false
    editor.isEditable = editable
    recordEditorPerformanceOperation('blocknote.apply', now() - startedAt, {
      blockCount: safeBlocks.length,
      progressive,
      appliedChunks,
      aborted: shouldAbort?.() ?? false,
      slowestChunkMs: Math.round(slowestChunkMs * 10) / 10,
      sourceCharacters: sourceCharacters ?? null,
      sourceLines: sourceLines ?? null,
    })
  }
}
