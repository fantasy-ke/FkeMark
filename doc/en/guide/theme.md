# Clear Blue Theme

FkeMark Docs now use **Clear Blue** as the default visual system. It is designed for a Markdown editor: clean blue-white surfaces, readable content cards, clear hierarchy, and restrained decoration for long writing and review sessions.

The site uses **VitePress Theme Teek + FkeMark custom CSS**. Teek provides documentation features, while the custom styles keep the home page, docs pages, top navigation, sidebar, buttons, links, and Markdown details consistent.

## Why Teek

Teek fits the current docs site better than only extending the default VitePress theme:

- **Still VitePress-based**: Markdown-first, static builds, and Cloudflare Pages friendly.
- **Richer docs features**: article cards, code block enhancements, theme color switching, back-to-top, site analysis, and grouped footers.
- **Centralized configuration**: <code>defineTeekConfig</code> keeps navigation, sidebars, language switching, version links, and theme enhancements in one place.
- **Default home page retained**: <code>teekHome: false</code> + <code>vpHome: true</code> keeps the VitePress home layout while adding FkeMark sections.
- **Controlled brand layer**: <code>custom.css</code> overrides colors, cards, buttons, Markdown reading details, and responsive layout.

## Enabled Teek features

| Feature | Usage |
| --- | --- |
| <code>pageStyle: 'card-nav'</code> | Card-style reading layout for guide pages |
| <code>themeEnhance</code> | Theme color, layout enhancement, and spotlight reading helper |
| <code>codeBlock</code> | Enhanced code blocks, long-code collapse, and language labels |
| <code>backTop</code> | Reading-progress back-to-top button |
| <code>articleAnalyze</code> | Updated time, word count, and reading info |
| <code>docAnalysis</code> | Site statistics in the footer area |
| <code>footerGroup</code> / <code>footerInfo</code> | Project, version, deploy, and theme links |

## Design principles

- **Blue-white surface**: pale blue page background with white content cards for comfortable reading.
- **Clear hierarchy**: deep ink-blue body text with muted blue-gray secondary text.
- **Editor feel**: subtle grid texture, navy code blocks, rounded cards, and clean borders echo Markdown editing tools.
- **Unified primary color**: home, content, sidebar, top navigation, buttons, and links share the same blue palette.
- **Subtle motion**: only small hover feedback, so documentation stays focused.

## Color tokens

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#f6f9ff"></i><span>clear page / #f6f9ff</span></div>
  <div class="theme-token"><i style="background:#ffffff"></i><span>white card / #ffffff</span></div>
  <div class="theme-token"><i style="background:#172033"></i><span>markdown ink / #172033</span></div>
  <div class="theme-token"><i style="background:#2563eb"></i><span>FkeMark blue / #2563eb</span></div>
  <div class="theme-token"><i style="background:#0ea5e9"></i><span>editor sky / #0ea5e9</span></div>
  <div class="theme-token"><i style="background:#eaf2ff"></i><span>sidebar blue / #eaf2ff</span></div>
</div>

## Reuse in a Markdown renderer

| File | Purpose |
| --- | --- |
| <code>doc/.vitepress/theme/custom.css</code> | Blue-white overrides for the docs home page, docs pages, top navigation, sidebar, and Teek components |
| <code>doc/public/theme/fkemark-vellum.css</code> | Reusable Clear Blue CSS for an application Markdown preview area |

> The <code>fkemark-vellum.css</code> file name and <code>fkemark-vellum</code> class are kept for compatibility with older references; the current visual style is Clear Blue.

Import the CSS and add the <code>fkemark-vellum</code> class to your Markdown container:

~~~html
<link rel="stylesheet" href="/theme/fkemark-vellum.css" />

<article class="markdown-body fkemark-vellum">
  <h1>Project notes</h1>
  <blockquote>Local files first, writing stays portable.</blockquote>
  <pre><code>const mode = 'Live + Source'</code></pre>
</article>
~~~

## VitePress theme entry

~~~ts
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import './custom.css'

export default Teek
~~~

## Best fit

Good for tutorials, long-term notes, project docs, reading notes, technical plans, and final review before publishing.

Not ideal for dense dashboards, heavy marketing pages, or highly interactive chart-heavy pages.

## References

- [VitePress Theme Teek docs](https://vp.teek.top/)
- [Teek quick start](https://vp.teek.top/guide/quickstart)
- [Teek GitHub](https://github.com/Kele-Bingtang/vitepress-theme-teek)
- [VitePress: Extending the Default Theme](https://vitepress.dev/guide/extending-default-theme)
