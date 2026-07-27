# Live Renderer Architecture and Compatibility

## Refactor source

The live editor data flow was rewritten around the BlockNote architecture from `refactoringhq/tolaria`, based on commit `a904e2f96ae634c05155abdf05a89456a8f54f52`. Both FkeMark and Tolaria use the `AGPL-3.0-only` license; directly adapted parser, serializer, chunk-apply, and document-cache files keep source comments.

## Current rendering flow

1. FkeMark keeps one BlockNote editor instance for the app lifecycle; switching Live, Read, Source, and split modes does not destroy the editor DOM.
2. Input events mark the document as dirty instead of serializing Markdown on every key press.
3. After 1500ms of idle time, FkeMark runs one direct block serialization; saving yields one browser task first, then flushes the pending serialization once.
4. Documents over 320 lines or 16KB are parsed into BlockNote blocks in a Worker first; unsupported syntax falls back to BlockNote's built-in parser.
5. Documents over 320 blocks apply the first 48 blocks, then append at most 120 blocks per frame while temporarily disabling editing and allowing stale tasks to abort.
6. Parsed documents enter a memory-budgeted cache; returning to the same document can reuse block results.
7. Standard blocks are directly serialized with a block-object cache; consecutive list items are saved as compact Markdown, so opening a file does not insert blank lines between items.
8. Code blocks use FkeMark's custom BlockNote schema with a Shiki highlighter; languages and themes are loaded on demand, and `text` / `plaintext` stays unhighlighted.

## Performance logs

The editor keeps the latest 100 performance records. In the developer console, run:

```js
window.__FKEMARK_EDITOR_PERFORMANCE__.export()
window.__FKEMARK_EDITOR_PERFORMANCE__.copy()
```

Important stages:

- `blocknote.parse.fast`: large-document Worker fast parsing.
- `blocknote.parse.fallback`: BlockNote parsing when the fast parser cannot handle syntax.
- `blocknote.apply.chunk`: a document chunk that takes over 50ms.
- `blocknote.apply`: whole-document chunk-apply duration and slowest chunk.
- `blocknote.serialize`: direct block-to-Markdown serialization.
- `editor.markdown.flush`: full flush from idle refresh, synchronous read, or save.
- `prosemirror.dispatch`, `browser.long-animation-frame`: low-level editor transactions or browser long frames.

If editing still feels slow, export the log and include the operation sequence, such as “open a 900-line file → edit in Live → switch to split view → save”. The `stage`, `sourceLines`, `blockCount`, `slowestChunkMs`, and `reason` fields help separate parsing, rendering, serialization, and disk-save costs.

## Preserved capabilities

- Headings, paragraphs, bold, italic, strike, inline code, and normal links.
- Unordered lists, ordered lists, and task lists; consecutive list items keep the compact single-line-break form after open and save.
- Quotes, dividers, Front Matter, wiki links, and basic Markdown round-tripping.
- Code block syntax highlighting, the code-language picker, and fenced-code shortcuts; common languages load highlighting on demand, while plain-text blocks keep no language marker.
- Table blocks and the table context menu; right-click a cell to insert or delete rows and columns.
- Image blocks and the image context menu; right-click an image to resize, reset size, set 50% / 100% width, or delete it.
- Read view and split preview still use FkeMark's original Markdown renderer.

## Remaining differences from the old live editor

These limits apply only to the new BlockNote Live editor; Read view and split preview still render through the original Markdown engine:

- Inline and block math are inserted as Markdown text for now; they are not rendered as the old custom formula nodes inside the Live editor.
- Highlight, underline, and interactive footnotes have not been migrated to BlockNote custom schema. Unknown custom blocks trigger lossy fallback and write `fallbackReason` to logs.
- Image width/height comments, drag resizing, upload placeholders, and upload cancellation are not migrated yet; the current right-click menu covers size presets, reset, and delete for inserted image blocks.
- Roman numeral, alpha, and other custom ordered-list appearances normalize to standard numbered lists.
- Some floating syntax helpers that depended on old TipTap 2 custom nodes still need separate BlockNote block, inline-content, or style-schema migrations. Reusing the old TipTap 2 nodes would reintroduce dual editor state and synchronous conversion costs.
