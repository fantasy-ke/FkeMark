# Vellum Theme

“Vellum” is the reading-oriented visual direction for FkeMark’s Markdown experience. It avoids dashboard-like decoration and instead uses a quiet paper surface so headings, quotes, code blocks, and tables remain comfortable for long reading.

The docs site uses **VitePress Theme Teek + FkeMark custom CSS**. Teek provides documentation features, while the custom styles provide the product’s visual character.

## Why Teek

Teek was selected because it fits the current docs site better than only extending the default VitePress theme:

- **Still VitePress-based**: Markdown-first, static builds, and Cloudflare Pages friendly.
- **Richer docs features**: article cards, code block enhancements, theme color switching, back-to-top, site analysis, and grouped footers.
- **Centralized configuration**: <code>defineTeekConfig</code> keeps theme features in one place.
- **Default home page retained**: <code>teekHome: false</code> + <code>vpHome: true</code> keeps the VitePress home layout while Teek enhances guide pages.
- **Brand styles layered on top**: <code>custom.css</code> overrides colors, cards, and Markdown reading details.

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

- **Paper surface**: soft off-white backgrounds with subtle grid texture.
- **Ink text**: deep neutral text instead of harsh pure black.
- **Brown accent**: used for headings, quote edges, and warm highlights.
- **Green accent**: used for links, actions, and completion states.
- **Unified site color**: home, content, sidebar, and top navigation now share the same palette.

## Color tokens

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#f5efe6"></i><span>Paper background</span></div>
  <div class="theme-token"><i style="background:#292620"></i><span>Ink text</span></div>
  <div class="theme-token"><i style="background:#2f7c68"></i><span>FkeMark green</span></div>
  <div class="theme-token"><i style="background:#8f4f24"></i><span>Vellum brown</span></div>
</div>

## Reuse in a Markdown renderer

Import the CSS and add the <code>fkemark-vellum</code> class to your Markdown container:

~~~html
<link rel="stylesheet" href="/theme/fkemark-vellum.css" />

<article class="markdown-body fkemark-vellum">
  <h1>Project notes</h1>
  <p>This is rendered Markdown content.</p>
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

Good for tutorials, long-term notes, project docs, reading notes, and technical plans.

Not ideal for dense dashboards, heavy marketing pages, or highly interactive chart-heavy pages.

## References

- [VitePress Theme Teek docs](https://vp.teek.top/)
- [Teek quick start](https://vp.teek.top/guide/quickstart)
- [Teek GitHub](https://github.com/Kele-Bingtang/vitepress-theme-teek)
- [VitePress: Extending the Default Theme](https://vitepress.dev/guide/extending-default-theme)
