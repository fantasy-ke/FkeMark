# Feature Modules & Buttons

This page summarizes recently added editor modules, app-shell entries, and settings-driven controls. Whether a toolbar button is shown directly depends on “Settings → Appearance → Toolbar layout”; hidden buttons can be dragged back to the toolbar or placed into Format, Block, Insert, or Utility groups.

## Editor modules

| Module | Entry | Main use | Tip |
| --- | --- | --- | --- |
| Local version history | “Version History” toolbar button | Keep snapshots before saves, create a current snapshot manually, then compare or restore. | The document must be saved first. Restoring replaces the editor content and leaves it unsaved. |
| Version comparison | Compare view inside version history | Review additions, deletions, and context from a snapshot to the current content. | In long comparisons, use “Previous diff” and “Next diff” instead of scrolling line by line. |
| Snippets & templates | “Open snippets and templates” toolbar button | Insert built-in diary, meeting, todo, tech-note, and reading-note templates, or manage personal Markdown snippets. | Custom snippets can use date and time variables that expand when inserted. |
| Writing quality check | “Spell check” toolbar button | Show Chinese / English counts and check Chinese typos, common English misspellings, duplicate words, and repeated punctuation. | Enable spell check in Settings first. The native English dictionary still provides right-click suggestions. |
| Presentation mode | “Presentation mode” toolbar button | Read or present the current Markdown as slides. | A standalone <code>---</code> starts a new slide; use arrows, Space, or Page keys to navigate, and <kbd>Esc</kbd> to exit. |
| Local subscription and trial | Settings “Subscription” section | Review the 7-day trial on this device, subscription validity, and available plans. | This is currently a local status entry with monthly, quarterly, yearly, and lifetime plans; payment and account validation are not connected yet. |

## App-shell entries

| Entry | What it does | Notes |
| --- | --- | --- |
| New menu | Create a text file, open a file, open a folder, or create a new window | While open, the button becomes a close icon; click again to collapse it. |
| Main menu | Save, export, switch theme, open settings, and open About | The open state also shows a close icon and exposes `aria-expanded`. |
| Settings search | Search for a specific setting from the top of the settings page | Results show the section and group path, then jump to the matching settings section. |
| Dev-build debug | About → Debug | Only shown in dev builds; enable the access switch before using browser context menus, F12, or Open DevTools. |

## Toolbar button list

| Button | What it does | Notes |
| --- | --- | --- |
| H heading dropdown | Switch H1-H6 or paragraph | Useful for adjusting document hierarchy quickly. |
| Bold / italic / strike / inline code | Insert or toggle inline formatting | Works well after selecting text. |
| Quote / bullet list / ordered list / task list / divider | Insert common block structures | The ordered-list button includes decimal, alpha, and roman styles. |
| Table | Choose rows and columns from a grid | Good for small structured notes; right-click a cell to insert or delete rows and columns. |
| Link / wiki link / image | Insert external links, wiki links, or image syntax | Keep images near the Markdown file when possible; right-click an image to resize or delete it. |
| Code block / slash command | Insert a code block or open the command menu | Code blocks can choose a language and show syntax highlighting; `text` / `plaintext` stays plain. |
| Version History | View, create, compare, and restore local snapshots | The diff view includes Previous / Next diff navigation. |
| Snippets & Templates | Insert built-in templates or personal snippets | Best for repeated structures such as meeting notes and reading notes. |
| Spell check | Open the writing-quality panel | Controlled by “Settings → Editor → Spell check”. |
| Presentation mode | Present the current document as slides | A standalone <code>---</code> separates slides. |

## Related settings

| Setting | Path | Description |
| --- | --- | --- |
| Theme cards | Settings → Appearance → Theme | Choose Light, Dark, or System first, then pick a palette card from the active tone group. |
| Toolbar layout | Settings → Appearance → Toolbar layout | Drag buttons to reorder them, hide entries, move separators, or group buttons. |
| Subscription status | Settings → Subscription | Review trial days remaining on this device, subscription validity, and locally activated plans. |
| Version snapshot retention | Settings → Behavior → Version snapshot retention | Choose 10, 25, 50, or 100 local snapshots per file. |

## Suggested use

- Daily writing: keep heading, list, link, image, table, and version-history buttons visible.
- Long-form review: enable the minimap and use diff navigation in version history to locate changes quickly.
- Repeated formats: save meeting notes, tech notes, and reading notes as snippets.
- Slides: split pages with <code>---</code>, save, then review pacing in presentation mode.
