---
layout: home
hero:
  name: FkeMark
  text: 文件系统优先的 Markdown 编辑器
  tagline: 本地 .md 文件、混合即时渲染、三种编辑模式；给长期写作和项目文档一个轻量但好看的桌面入口。
  image:
    src: /logo.svg
    alt: FkeMark
  actions:
    - theme: brand
      text: 开始阅读文档
      link: /guide/
features:
  - icon: 📝
    title: 混合即时渲染
    details: 在 Live / Read / Source 三种模式之间切换，既保留 Markdown 控制力，也获得接近成稿的阅读体验。
  - icon: 📁
    title: 文件系统优先
    details: 不把笔记锁进数据库；文档仍是你磁盘上的 .md 纯文本文件，随时可被其他工具接管。
  - icon: 🎛️
    title: 写作视图可调
    details: 支持主题、字体、宽度、圆角、专注模式与打字机模式，适配长文、教程和笔记场景。
  - icon: 🌐
    title: 中英文文档
    details: 中文与 English 文档共用同一套主题和导航，可在头部快速切换。
  - icon: 🚀
    title: 静态部署友好
    details: 文档站输出为纯静态文件，适合 Cloudflare Pages 托管和版本化发布。
  - icon: 🧩
    title: Teek 主题增强
    details: 使用 VitePress Theme Teek 提供代码块、文章信息、返回顶部和页脚分组能力。
---

<div class="home-paper-showcase">
  <section class="paper-card" aria-label="Markdown 编辑示例">
    <div class="paper-window-bar"><span class="paper-dot"></span></div>
    <div class="markdown-sample" aria-hidden="true">
      <p><span class="md-token">#</span> 今天的项目记录</p>
      <p><span class="md-token">- [x]</span> 整理需求</p>
      <p><span class="md-token">- [x]</span> 写教程</p>
      <p><span class="md-token">- [ ]</span> 发布到 Cloudflare Pages</p>
      <p><span class="md-token">&gt;</span> 文件就在本地，写作不被工具绑架。</p>
      <p><span class="md-token">&#96;&#96;&#96;ts</span></p>
      <p>const mode = 'Live + Source'</p>
      <p><span class="md-token">&#96;&#96;&#96;</span></p>
    </div>
  </section>

  <section class="paper-flow" aria-label="文档导航">
    <h2>从这里进入</h2>
    <ol>
      <li><strong>快速开始</strong>：了解 FkeMark 的核心工作流。</li>
      <li><strong>安装与构建</strong>：下载发行版或从源码运行。</li>
      <li><strong>编辑教程</strong>：学习三种模式、块级编辑和导入导出。</li>
      <li><strong>墨纸主题</strong>：查看为 Markdown 软件设计的视觉主题。</li>
    </ol>
  </section>
</div>

<section class="home-section" aria-labelledby="workflow-title">
  <div class="home-section-header">
    <span class="home-section-kicker">Workflow</span>
    <h2 id="workflow-title">从打开文件夹开始，不改变你的 Markdown 归属</h2>
    <p>FkeMark 的首页和教程都围绕“本地文件 + 长文阅读”展开，减少营销式噪音，把重点放在写作流程、排版检查和发布准备上。</p>
  </div>
  <div class="home-feature-grid">
    <article class="home-feature-card">
      <span>01</span>
      <h3>选择目录</h3>
      <p>直接打开本地资料夹，Markdown 文件仍按原来的目录结构保存。</p>
    </article>
    <article class="home-feature-card">
      <span>02</span>
      <h3>快速起草</h3>
      <p>用 Source 保留语法控制，用 Live 减少源码打断。</p>
    </article>
    <article class="home-feature-card">
      <span>03</span>
      <h3>阅读校对</h3>
      <p>切到 Read 或分屏，检查标题、表格、代码块和图片排版。</p>
    </article>
    <article class="home-feature-card">
      <span>04</span>
      <h3>稳定发布</h3>
      <p>文档站可直接构建成静态文件，交给 Cloudflare Pages 托管。</p>
    </article>
  </div>
</section>

<section class="home-section" aria-labelledby="mode-title">
  <div class="home-section-header">
    <span class="home-section-kicker">Editor Modes</span>
    <h2 id="mode-title">三种编辑姿态，覆盖草稿、排版和阅读</h2>
  </div>
  <div class="home-mode-grid">
    <article class="mode-card">
      <span>Live</span>
      <h3>边写边看成稿</h3>
      <p>常见 Markdown 块即时渲染，适合日常笔记、教程整理和轻量排版。</p>
      <strong>推荐：日常写作</strong>
    </article>
    <article class="mode-card">
      <span>Read</span>
      <h3>把文档当成文章检查</h3>
      <p>隐藏编辑干扰，用接近发布后的阅读效果检查层级和节奏。</p>
      <strong>推荐：最终校对</strong>
    </article>
    <article class="mode-card">
      <span>Src</span>
      <h3>保留 Markdown 控制力</h3>
      <p>需要精确调整语法、表格、链接或批量修改时回到纯源码。</p>
      <strong>推荐：结构调整</strong>
    </article>
  </div>
</section>

<div class="home-split">
  <section class="home-note-card" aria-labelledby="for-who-title">
    <h3 id="for-who-title">适合这些内容</h3>
    <ul>
      <li><strong>项目文档</strong>：需求、方案、部署记录。</li>
      <li><strong>长期笔记</strong>：知识库、读书摘录、技术总结。</li>
      <li><strong>教程写作</strong>：代码块、表格、图片和引用混排。</li>
      <li><strong>本地优先</strong>：需要 Git、同步盘或其他编辑器共用文件。</li>
    </ul>
  </section>

  <section class="home-note-card" aria-labelledby="doc-map-title">
    <h3 id="doc-map-title">文档入口</h3>
    <ul>
      <li><a href="/guide/">快速开始</a>：先了解核心概念。</li>
      <li><a href="/guide/editing">编辑教程</a>：熟悉 Live / Read / Source。</li>
      <li><a href="/guide/theme">主题设计</a>：查看墨纸视觉和 Teek 配置。</li>
      <li><a href="/guide/changelog">更新日志</a>：查看文档站版本入口。</li>
    </ul>
  </section>
</div>

<section class="home-doc-cta" aria-label="继续阅读文档">
  <div>
    <h2>继续阅读文档教程</h2>
    <p>如果你只想快速开始，从“文档教程”进入；如果要部署站点，直接查看 Cloudflare Pages 配置。</p>
  </div>
  <div class="home-doc-links">
    <a href="/guide/">文档教程</a>
    <a href="/guide/deploy">部署方式</a>
    <a href="/en/">English</a>
  </div>
</section>
