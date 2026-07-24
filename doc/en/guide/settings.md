# Settings

The settings page centralizes appearance, editing behavior, view preferences, images, language, shortcuts, AI assistant, experimental options, and version information. It also includes toolbar layout, line-number display, and version snapshot retention.

![FkeMark settings page](/images/guide/settings.svg)

## Settings sections

| Section | Controls | Best for |
| --- | --- | --- |
| Appearance | Theme, font, font size, line height, radius | Comfortable reading and writing |
| Editor | Default editor mode, markers, auto bracket, spell check | Daily typing behavior |
| View | Editor width, line numbers, minimap, focus mode, toolbar position | Long documents, wide screens, or compact screens |
| Behavior | Auto save, close-window action, version snapshot retention | Avoiding accidental close, data loss, or too many snapshots |
| Images | Image save, upload, or asset handling options | Consistent Markdown image management |
| Language | Chinese / English | Switching UI language |
| Shortcuts | App and editor shortcuts | Building personal high-frequency actions |
| AI Assistant | Local or OpenAI-compatible API settings | Continue, polish, summarize, translate |
| Experimental | Mermaid, Vim, and other enhancements | Optional capabilities without affecting basic writing |
| About | Version, update channel, developer tools | Checking updates or version info |

## Key settings

| Setting | How to think about it |
| --- | --- |
| Toolbar layout | In Appearance, drag buttons, hide low-frequency entries, move separators, or place buttons into groups. |
| Show line numbers | In View, show line numbers on the left; long documents keep growing line numbers while editing. |
| Version snapshot retention | In Behavior, choose 10, 25, 50, or 100 local snapshots per file. |
| Spell check | In Editor, enable the toolbar spell-check button and local writing-quality panel. |

## Suggested setups

### Long-form writing

- Editor width: medium or wide.
- Focus mode: on.
- Minimap: on for long notes or code-heavy files.
- Line numbers: on when you need stable locations for review.
- Version snapshot retention: 50 is a balanced default; use 100 for frequently edited long documents.
- Auto save: on.

### Project documentation

- Default mode: Live.
- Show Markdown markers: on, so syntax stays visible.
- Toolbar: fixed at top or close to the editor.
- Shortcuts: keep save, find, link, and headings easy to reach.

### Presentation and review

- Use Read mode to review the final result.
- Before presentation mode, split slides with standalone <code>---</code> lines.
- Keep spell check enabled for mixed Chinese/English writing.

## FAQ

### Do settings change Markdown file content?

No. Most settings only change display and editing behavior inside FkeMark.

### What if I set a wrong shortcut?

Use the reset button for one shortcut, or reset all shortcuts to defaults.

### Is AI assistant required?

No. AI assistant is disabled by default and does not affect the local Markdown editing flow.
