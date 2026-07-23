# Markdown Syntax

FkeMark supports common Markdown syntax and renders most structures close to the final reading result in Live and Read modes.

## Quick reference

| Type | Example | Usage |
| --- | --- | --- |
| Heading | <code># Heading</code> | Organize article hierarchy |
| Bold | <code>**Important**</code> | Emphasize keywords |
| Italic | <code>*Term*</code> | Mark tone or terms |
| Strike | <code>~~Old text~~</code> | Mark deprecated content |
| Quote | <code>&gt; Quote</code> | Notes, excerpts, or tips |
| Unordered list | <code>- Item</code> | Simple lists |
| Ordered list | <code>1. Step</code> | Step-by-step flow |
| Task list | <code>- [x] Done</code> | Checklists |
| Link | <code>[Title](https://example.com)</code> | Reference internal or external material |
| Image | <code>&#33;[Alt](./assets/a.png)</code> | Insert screenshots or images |
| Inline code | <code>const name = 'FkeMark'</code> | Variables, commands, or short code |

## Code blocks

Use three tildes or backticks, plus a language name:

~~~~md
~~~ts
const mode = 'live'
console.log(mode)
~~~
~~~~

In the editor, typing <code>&#96;&#96;&#96;ts</code> and pressing Enter can also create a code block.

## Tables

~~~md
| Mode | Best for |
| --- | --- |
| Live | Daily writing |
| Read | Proofreading |
| Source | Precise editing |
~~~

For wide tables, split columns or use smaller tables for better reading.

## Front Matter and tags

Use YAML Front Matter at the top of a document for metadata:

~~~md
---
title: Project notes
date: 2026-07-23
tags:
  - markdown
  - fkemark
---
~~~

You can also keep lightweight tags in body text with <code>#tag</code>.

## Footnotes

~~~md
This needs a note.[^note]

[^note]: This is the footnote content.
~~~

## Math

Use inline math for short expressions and block math for standalone formulas:

~~~md
Inline: $a^2 + b^2 = c^2$

$$
E = mc^2
$$
~~~

## Writing tips

- Keep one level-one heading per document.
- Use descriptive link text instead of “click here”.
- Add language names to code blocks for highlighting and search.
- Write clear image alt text for reading and archiving.
