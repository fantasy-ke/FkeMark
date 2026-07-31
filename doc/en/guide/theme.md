# Studio Graphite Theme

FkeMark Docs now use **Studio Graphite** as the default visual system. It is designed for a Markdown editor: warm paper surfaces reduce cold-screen fatigue, graphite text adds a product-document feel, and copper plus teal carry actions, links, status, and accents.

The site uses **VitePress Theme Teek + FkeMark custom CSS**. Teek provides documentation features, while the custom styles keep the Studio Graphite home page, docs pages, top navigation, sidebar, buttons, links, and Markdown details consistent.

## Why Teek

This selection keeps Teek as the capability layer instead of migrating to another third-party theme:

- **Still VitePress-based**: Markdown-first, static builds, and Cloudflare Pages friendly.
- **Richer docs features**: article cards, code block enhancements, theme color switching, back-to-top, site analysis, and grouped footers are already wired in.
- **Centralized configuration**: <code>defineTeekConfig</code> keeps navigation, sidebars, language switching, version links, and theme enhancements in one place.
- **Default home page retained**: <code>teekHome: false</code> + <code>vpHome: true</code> keeps the VitePress home layout while adding FkeMark sections.
- **Pluggable visual layer**: <code>custom.css</code> inserts a new theme without dismantling navigation, search, and footer behavior.

## Enabled Teek features

| Feature | Usage |
| --- | --- |
| <code>pageStyle: 'card-nav'</code> | Card-style reading layout for guide pages |
| <code>themeEnhance</code> | Studio Copper, Editor Teal, layout enhancement, and spotlight reading helper |
| <code>codeBlock</code> | Enhanced code blocks, long-code collapse, and language labels |
| <code>backTop</code> | Reading-progress back-to-top button |
| <code>articleAnalyze</code> | Updated time, word count, and reading info |
| <code>docAnalysis</code> | Site statistics in the footer area |
| <code>footerGroup</code> / <code>footerInfo</code> | Project, version, deploy, and theme links |

## Design principles

- **Warm paper surface**: replace the single blue-white wash with beige pages and warm white content cards.
- **Graphite structure**: use graphite for body text, code windows, and navigation structure to match a local editor and project-doc tone.
- **Two accent colors**: copper handles primary buttons, links, and heading ornaments; teal handles secondary states and editor-like details.
- **Product-doc home page**: keep the Markdown sample, workflow cards, and doc map while using hierarchy to reduce repetitive card blocks.
- **Subtle motion**: keep only small hover feedback and respect <code>prefers-reduced-motion</code>.

## Color tokens

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#f3eee6"></i><span>warm paper / #f3eee6</span></div>
  <div class="theme-token"><i style="background:#fffaf2"></i><span>paper card / #fffaf2</span></div>
  <div class="theme-token"><i style="background:#211c18"></i><span>graphite ink / #211c18</span></div>
  <div class="theme-token"><i style="background:#c96442"></i><span>studio copper / #c96442</span></div>
  <div class="theme-token"><i style="background:#179fa4"></i><span>editor teal / #179fa4</span></div>
  <div class="theme-token"><i style="background:#e8dfd2"></i><span>sidebar paper / #e8dfd2</span></div>
</div>

## Reuse in a Markdown renderer

| File | Purpose |
| --- | --- |
| <code>doc/.vitepress/theme/custom.css</code> | Studio Graphite overrides for global surfaces, docs pages, top navigation, sidebar, and Teek components |
| <code>doc/.vitepress/theme/home.css</code> | Home-page Markdown sample, workflow cards, and CTA module styles |
| <code>doc/public/theme/fkemark-vellum.css</code> | Reusable Studio Graphite CSS for an application Markdown preview area |

> The <code>fkemark-vellum.css</code> file name and <code>fkemark-vellum</code> class are kept for compatibility with older references; the current visual style is Studio Graphite.

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
