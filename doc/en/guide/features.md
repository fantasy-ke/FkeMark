# Feature Modules & Buttons

This page summarizes recently added editor modules and entry buttons. Whether a button is shown directly depends on “Settings → Appearance → Toolbar layout”; hidden buttons can be dragged back to the toolbar or placed into Format, Block, Insert, or Utility groups.

## Editor modules

| Module | Entry | Main use | Tip |
| --- | --- | --- | --- |
| Local version history | “Version History” toolbar button | Keep snapshots before saves, create a current snapshot manually, then compare or restore. | The document must be saved first. Restoring replaces the editor content and leaves it unsaved. |
| Version comparison | Compare view inside version history | Review additions, deletions, and context from a snapshot to the current content. | In long comparisons, use “Previous diff” and “Next diff” instead of scrolling line by line. |
| Snippets & templates | “Open snippets and templates” toolbar button | Insert built-in diary, meeting, todo, tech-note, and reading-note templates, or manage personal Markdown snippets. | Custom snippets can use date and time variables that expand when inserted. |
| Writing quality check | “Spell check” toolbar button | Show Chinese / English counts and check Chinese typos, common English misspellings, duplicate words, and repeated punctuation. | Enable spell check in Settings first. The native English dictionary still provides right-click suggestions. |
| Presentation mode | “Presentation mode” toolbar button | Read or present the current Markdown as slides. | A standalone <code>---</code> starts a new slide; use arrows, Space, or Page keys to navigate, and <kbd>Esc</kbd> to exit. |

## Toolbar button list

| Button | What it does | Notes |
| --- | --- | --- |
| H heading dropdown | Switch H1-H6 or paragraph | Useful for adjusting document hierarchy quickly. |
| Bold / italic / strike / inline code | Insert or toggle inline formatting | Works well after selecting text. |
| Quote / bullet list / ordered list / task list / divider | Insert common block structures | The ordered-list button includes decimal, alpha, and roman styles. |
| Table | Choose rows and columns from a grid | Good for small structured notes. |
| Link / wiki link / image | Insert external links, wiki links, or image syntax | Keep images near the Markdown file when possible. |
| Code block / slash command | Insert a code block or open the command menu | Code blocks can still choose a language. |
| Version History | View, create, compare, and restore local snapshots | The diff view includes Previous / Next diff navigation. |
| Snippets & Templates | Insert built-in templates or personal snippets | Best for repeated structures such as meeting notes and reading notes. |
| Spell check | Open the writing-quality panel | Controlled by “Settings → Editor → Spell check”. |
| Presentation mode | Present the current document as slides | A standalone <code>---</code> separates slides. |

## Related settings

| Setting | Path | Description |
| --- | --- | --- |
| Toolbar layout | Settings → Appearance → Toolbar layout | Drag buttons to reorder them, hide entries, move separators, or group buttons. |
| Show line numbers | Settings → View → Show line numbers | Show line numbers on the left; long documents keep updating line numbers while editing. |
| Version snapshot retention | Settings → Behavior → Version snapshot retention | Choose 10, 25, 50, or 100 local snapshots per file. |

## Suggested use

- Daily writing: keep heading, list, link, image, table, and version-history buttons visible.
- Long-form review: enable line numbers, minimap, and diff navigation to locate changes quickly.
- Repeated formats: save meeting notes, tech notes, and reading notes as snippets.
- Slides: split pages with <code>---</code>, save, then review pacing in presentation mode.
