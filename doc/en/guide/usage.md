# Usage

FkeMark is built around one idea: **your documents stay in local folders, and the editor only makes Markdown writing, reading, organizing, and publishing easier**.

![FkeMark writing workflow](/images/guide/workflow.svg)

## Daily workflow

| Step | Action | Result |
| --- | --- | --- |
| 1 | Open a local folder | The sidebar shows your existing Markdown structure |
| 2 | Create or open a <code>.md</code> file | The file stays plain text |
| 3 | Choose Live / Split / Read / Source | Switch between drafting, side-by-side checks, proofreading, and source control |
| 4 | Insert images, tables, links, or code blocks | Build common Markdown structures quickly |
| 5 | Save, review version history, export, or publish | Continue with local files, snapshots, export formats, or the docs site |

## Recommended writing path

1. **Structure first**: write headings, lists, and paragraphs in <code>Source</code> or <code>Live</code>.
2. **Fill the content**: use the toolbar for links, images, tables, and code blocks.
3. **Check side by side**: use split view for complex tables, formulas, or code blocks.
4. **Proofread as an article**: switch to <code>Read</code> and review hierarchy and rhythm.
5. **Save reliably**: keep Markdown as the primary format; export only for sharing, archive, or migration.

## Importing as Markdown

Before your first import, download and install the converter from GitHub under **Settings → Components**. Use the same page to check for and install updates. No restart is needed. If you minimize the download panel, click the download icon in the title bar to reopen it. The installer and portable package do not include the converter.

In the New menu, choose “Import local document…” or “Import from URL…”. For text PDFs, distinct font sizes are used to infer Markdown headings; headings in the same size as body text may not be recognized. PNG, JPEG, and WebP support offline recognition of Simplified Chinese and English text. Scanned PDFs are not automatically processed with OCR. URL import reads the HTTP(S) response without running page scripts or using browser login sessions.

A centered panel shows the source and target formats. You can minimize it and keep editing; it reopens with the result. A successful import opens in a new tab that you can save manually.

## Saving and snapshots

- When saving an existing document, FkeMark keeps a local snapshot before writing the new content.
- To keep a manual checkpoint, click “Create Current Snapshot” in the Version History toolbar menu.
- When comparing a snapshot, use “Previous diff / Next diff” to jump between changed lines.
- If a file changes very frequently, adjust the per-file snapshot limit in “Settings → Behavior”.

## Folder organization tips

| Scenario | Suggested folders |
| --- | --- |
| Project docs | <code>docs/</code>, <code>notes/</code>, <code>changelog/</code> |
| Study notes | <code>inbox/</code>, <code>reading/</code>, <code>summary/</code> |
| Blog drafts | <code>drafts/</code>, <code>assets/</code>, <code>published/</code> |

::: tip
Keep images and attachments near the Markdown files that use them. A local <code>assets/</code> folder is usually enough.
:::

## Next steps

- Markdown features: [Syntax](./syntax).
- Buttons and actions: [Toolbar](./toolbar).
- Faster operation: [Shortcuts](./shortcuts).
- Theme, toolbar, subscription, or debug-entry preferences: [Settings](./settings).
