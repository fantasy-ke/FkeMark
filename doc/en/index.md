---
layout: home
hero:
  name: FkeMark
  text: Filesystem-first Markdown editor
  tagline: Local .md files, hybrid live rendering, and three editing modes for long-form writing, project notes, and documentation.
  image:
    src: /logo.svg
    alt: FkeMark
  actions:
    - theme: brand
      text: Read the docs
      link: /en/guide/
features:
  - icon: 📝
    title: Hybrid live rendering
    details: Switch between Live, Read, and Source modes without giving up Markdown control.
  - icon: 📁
    title: Filesystem-first
    details: Notes remain plain .md files on disk, ready for Git, sync tools, or other editors.
  - icon: 🎛️
    title: Adjustable writing view
    details: Tune themes, fonts, width, radius, focus mode, and typewriter mode for different writing tasks.
  - icon: 🌐
    title: Bilingual docs
    details: Chinese and English pages share the same theme, navigation, and version menu.
  - icon: 🚀
    title: Static deployment
    details: The docs build to static files and are ready for Cloudflare Pages.
  - icon: 🧩
    title: Teek enhancements
    details: VitePress Theme Teek adds code blocks, article info, back-to-top, and grouped footer links.
---

<div class="home-paper-showcase">
  <section class="paper-card" aria-label="Markdown editing sample">
    <div class="paper-window-bar"><span class="paper-dot"></span></div>
    <div class="markdown-sample" aria-hidden="true">
      <p><span class="md-token">#</span> Today’s project notes</p>
      <p><span class="md-token">- [x]</span> Collect requirements</p>
      <p><span class="md-token">- [x]</span> Write docs</p>
      <p><span class="md-token">- [ ]</span> Deploy to Cloudflare Pages</p>
      <p><span class="md-token">&gt;</span> Your files stay local and portable.</p>
      <p><span class="md-token">&#96;&#96;&#96;ts</span></p>
      <p>const mode = 'Live + Source'</p>
      <p><span class="md-token">&#96;&#96;&#96;</span></p>
    </div>
  </section>

  <section class="paper-flow" aria-label="Documentation navigation">
    <h2>Start here</h2>
    <ol>
      <li><strong>Quick Start</strong>: understand the core workflow.</li>
      <li><strong>Install & Build</strong>: download releases or run from source.</li>
      <li><strong>Editing Guide</strong>: learn modes, block editing, import, and export.</li>
      <li><strong>Clear Blue Theme</strong>: review the Markdown-editor visual design.</li>
    </ol>
  </section>
</div>

<section class="home-section" aria-labelledby="workflow-title">
  <div class="home-section-header">
    <span class="home-section-kicker">Workflow</span>
    <h2 id="workflow-title">Open a folder and keep ownership of your Markdown</h2>
    <p>The docs focus on local files, long-form reading, editing flow, layout checks, and static publishing instead of noisy marketing panels.</p>
  </div>
  <div class="home-feature-grid">
    <article class="home-feature-card">
      <span>01</span>
      <h3>Choose a folder</h3>
      <p>Open your local workspace while keeping the existing Markdown directory structure.</p>
    </article>
    <article class="home-feature-card">
      <span>02</span>
      <h3>Draft quickly</h3>
      <p>Use Source for precise syntax and Live for fewer formatting interruptions.</p>
    </article>
    <article class="home-feature-card">
      <span>03</span>
      <h3>Review layout</h3>
      <p>Use Read mode or split view to check headings, tables, code blocks, and images.</p>
    </article>
    <article class="home-feature-card">
      <span>04</span>
      <h3>Publish safely</h3>
      <p>Build the docs as static files and deploy them with Cloudflare Pages.</p>
    </article>
  </div>
</section>

<section class="home-section" aria-labelledby="mode-title">
  <div class="home-section-header">
    <span class="home-section-kicker">Editor Modes</span>
    <h2 id="mode-title">Three modes for drafting, layout, and reading</h2>
  </div>
  <div class="home-mode-grid">
    <article class="mode-card">
      <span>Live</span>
      <h3>Write near the final view</h3>
      <p>Common Markdown blocks render while you type, which fits everyday writing and tutorials.</p>
      <strong>Best for daily writing</strong>
    </article>
    <article class="mode-card">
      <span>Read</span>
      <h3>Review like a finished article</h3>
      <p>Hide editing noise and check hierarchy, rhythm, and readability.</p>
      <strong>Best for final review</strong>
    </article>
    <article class="mode-card">
      <span>Src</span>
      <h3>Keep Markdown control</h3>
      <p>Return to source when you need exact syntax, tables, links, or batch changes.</p>
      <strong>Best for structure edits</strong>
    </article>
  </div>
</section>

<div class="home-split">
  <section class="home-note-card" aria-labelledby="for-who-title">
    <h3 id="for-who-title">Good fit for</h3>
    <ul>
      <li><strong>Project docs</strong>: requirements, plans, and deployment notes.</li>
      <li><strong>Long-term notes</strong>: knowledge bases, reading notes, and technical summaries.</li>
      <li><strong>Tutorial writing</strong>: code blocks, tables, images, and quotes.</li>
      <li><strong>Local-first workflows</strong>: Git, sync drives, and other editors.</li>
    </ul>
  </section>

  <section class="home-note-card" aria-labelledby="doc-map-title">
    <h3 id="doc-map-title">Doc map</h3>
    <ul>
      <li><a href="/en/guide/">Quick Start</a>: learn the core concepts.</li>
      <li><a href="/en/guide/editing">Editing Guide</a>: use Live / Read / Source.</li>
      <li><a href="/en/guide/theme">Theme</a>: review the Clear Blue and Teek setup.</li>
      <li><a href="/en/guide/changelog">Changelog</a>: open the version entry.</li>
    </ul>
  </section>
</div>

<section class="home-doc-cta" aria-label="Continue reading">
  <div>
    <h2>Continue with the guide</h2>
    <p>Start with the guide for product usage, or jump directly to the Cloudflare Pages deployment setup.</p>
  </div>
  <div class="home-doc-links">
    <a href="/en/guide/">Docs</a>
    <a href="/en/guide/deploy">Deployment</a>
    <a href="/">中文</a>
  </div>
</section>
