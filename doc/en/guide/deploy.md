# Deploy Docs

This docs site uses **VitePress + VitePress Theme Teek**. All content lives inside <code>doc/</code>, and the build output is a static site suitable for Cloudflare Pages.

## Local development

~~~bash
cd doc
npm install
npm run dev
~~~

## Build static files

~~~bash
cd doc
npm run build
~~~

The output directory is:

~~~text
doc/.vitepress/dist
~~~

Publish that directory to any static hosting service.

## Recommended: Cloudflare Pages

### Option A: set Cloudflare Root directory to <code>doc</code>

This is the preferred setup.

| Setting | Recommended value |
| --- | --- |
| Framework preset | <code>VitePress</code> |
| Root directory | <code>doc</code> |
| Build command | <code>npm run build</code> |
| Build output directory | <code>.vitepress/dist</code> |
| Environment variable | <code>DOCS_BASE=/</code> |
| Node.js | <code>NODE_VERSION=22.16.0</code> or a newer 22/24 LTS version |

Steps:

1. Open Cloudflare Dashboard and go to **Workers & Pages / Pages**.
2. Choose **Create application**, then **Pages**.
3. Connect the Git repository: <code>https://github.com/fantasy-ke/FkeMark</code>.
4. Choose the production branch based on your release strategy: <code>main</code> for stable docs, <code>dev</code> for preview docs.
5. Fill in the build settings above.
6. Save and deploy. Cloudflare will install dependencies, build the docs, and publish <code>.vitepress/dist</code>.

### Option B: keep Root directory at repository root

If the Cloudflare project must keep the repository root, use explicit <code>doc</code> commands:

| Setting | Value |
| --- | --- |
| Framework preset | <code>None</code> or <code>VitePress</code> |
| Root directory | empty or repository root |
| Build command | <code>npm --prefix doc ci && npm --prefix doc run build</code> |
| Build output directory | <code>doc/.vitepress/dist</code> |
| Environment variable | <code>DOCS_BASE=/</code> |

## Cloudflare headers

<code>doc/public/_headers</code> is copied to the build output root. It configures:

- Basic security headers for all pages.
- Long cache for VitePress static assets.
- Shorter cache for the reusable theme CSS so visual updates can ship safely.

## GitHub Pages

The repository URL is:

~~~text
https://github.com/fantasy-ke/FkeMark
~~~

For GitHub Pages, the expected URL is:

~~~text
https://fantasy-ke.github.io/FkeMark/
~~~

The config automatically uses <code>/FkeMark/</code> as <code>base</code> in GitHub Actions. For root-domain deployment, set:

~~~bash
DOCS_BASE=/ npm run build
~~~

## Why VitePress

| Framework | Best for | Decision |
| --- | --- | --- |
| VitePress | Markdown-first, lightweight static docs | Best fit for this Vite/npm project |
| Docusaurus | Large docs and versioning | Powerful but heavier |
| Astro Starlight | Content sites, built-in nav/search/i18n | Good, but introduces Astro ecosystem |
| Nextra | Next.js + MDX docs | Better for existing Next.js projects |

For this project’s home page, guide, theme docs, and deployment notes, VitePress is the smallest maintainable choice, with Teek as the theme enhancement layer.

## Troubleshooting

### Styles or icons return 404

Check <code>DOCS_BASE</code>:

- Cloudflare Pages root domain: <code>DOCS_BASE=/</code>
- GitHub Pages repository page: <code>DOCS_BASE=/FkeMark/</code>
- Custom subpath: set the real subpath, for example <code>DOCS_BASE=/docs/</code>

### Cloudflare build fails

The VitePress/Teek dependency chain needs a recent Node.js runtime. Set:

~~~text
NODE_VERSION=22.16.0
~~~

A validated 24 LTS version can also be used later.

### Cloudflare cannot find the output directory

Make sure Root directory and Build output directory match:

- Root directory is <code>doc</code>: output directory should be <code>.vitepress/dist</code>.
- Root directory is repository root: output directory should be <code>doc/.vitepress/dist</code>.
