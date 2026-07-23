# FkeMark 文档站

这里是 FkeMark 的独立文档站源码，内容集中放在 <code>doc/</code> 文件夹内。站点使用 **VitePress + VitePress Theme Teek** 构建，并叠加 FkeMark 自己的“蓝白 Clear Blue”阅读视觉。

## 当前方案

FkeMark 是 Markdown 编辑器，文档天然以 Markdown 为主。本项目选择 VitePress，再使用 Teek 做主题增强：

- **Markdown 优先**：页面就是 <code>.md</code> 文件，教程维护成本低。
- **静态输出**：构建后是纯静态文件，适合 Cloudflare Pages、GitHub Pages 或任意静态托管。
- **Teek 主题增强**：提供文章卡片风格、主题色切换、代码块增强、返回顶部、站点统计和页脚分组。
- **双语入口**：<code>/</code> 是中文站点，<code>/en/</code> 是 English 站点，头部可以快速切换语言。
- **版本入口**：头部“版本 / Versions”下拉负责跳转历史版本与更新日志，顶部不再放独立 Releases / GitHub 文本按钮。
- **保留 FkeMark 风格**：自定义 CSS 统一首页、文档正文、侧边栏和顶部导航的蓝白清晰背景、墨蓝正文、蓝色/天蓝配色。

> 当前依赖组合以 <code>doc/package-lock.json</code> 为准：Teek 使用 <code>vitepress-theme-teek</code>，VitePress 保持在 Teek 兼容的 1.6.x 版本线。

## 本地预览

进入文档目录后安装依赖并启动预览：

~~~bash
cd doc
npm install
npm run dev
~~~

常用命令：

| 命令 | 作用 |
| --- | --- |
| <code>npm run dev</code> | 本地预览文档站 |
| <code>npm run build</code> | 生成静态文件 |
| <code>npm run preview</code> | 预览构建后的静态站点 |
| <code>npm audit --audit-level=moderate</code> | 检查文档站依赖安全告警 |

## 目录结构

~~~text
doc/
├─ .vitepress/
│  ├─ config.mts              # VitePress + Teek 站点配置、双语与版本下拉
│  └─ theme/
│     ├─ index.ts             # Teek 主题入口
│     └─ custom.css           # 文档站“蓝白 Clear Blue”视觉覆写
├─ guide/                     # 中文教程正文
│  ├─ index.md                # 快速开始
│  ├─ install.md              # 安装与构建
│  ├─ editing.md              # 编辑教程
│  ├─ usage.md                # 使用方法
│  ├─ syntax.md               # Markdown 语法
│  ├─ toolbar.md              # 工具栏说明
│  ├─ shortcuts.md            # 快捷键
│  ├─ settings.md             # 设置页面
│  ├─ theme.md                # Teek + 蓝白主题说明
│  ├─ deploy.md               # Cloudflare / GitHub Pages 部署
│  └─ changelog.md            # 更新日志入口
├─ en/                        # English 文档
│  ├─ index.md                # English 首页
│  └─ guide/                  # English guide pages
├─ public/
│  ├─ _headers                # Cloudflare Pages 响应头配置
│  ├─ logo.svg                # 文档站图标
│  ├─ images/guide/           # 使用流程、工具栏、设置页面示意图
│  └─ theme/fkemark-vellum.css# 可复用 Markdown 预览主题
├─ index.md                   # 中文文档站首页
├─ package.json
└─ README.md                  # 当前维护说明
~~~

> <code>README.md</code> 是维护者入口，不作为线上站点页面发布；首页由 <code>index.md</code> / <code>en/index.md</code> 负责。

## 主题说明

当前文档站使用 **VitePress Theme Teek + 自定义 CSS**：

- <code>.vitepress/theme/index.ts</code> 引入 Teek 主题和 Teek 样式。
- <code>.vitepress/config.mts</code> 通过 <code>defineTeekConfig</code> 配置导航、侧边栏、语言切换、版本下拉、主题增强、代码块、页脚和文章信息。
- <code>.vitepress/theme/custom.css</code> 叠加 FkeMark 的“蓝白 Clear Blue”视觉，并统一首页、正文区域、顶部导航和侧边栏背景。
- <code>public/theme/fkemark-vellum.css</code> 提供可在应用 Markdown 预览区复用的蓝白 Clear Blue 阅读主题 CSS；文件名和类名保留旧入口以兼容已有引用。

更多说明见：[guide/theme.md](guide/theme.md)。

## 双语维护

新增或调整教程时，请同步检查：

| 中文页面 | English 页面 |
| --- | --- |
| <code>guide/index.md</code> | <code>en/guide/index.md</code> |
| <code>guide/install.md</code> | <code>en/guide/install.md</code> |
| <code>guide/editing.md</code> | <code>en/guide/editing.md</code> |
| <code>guide/usage.md</code> | <code>en/guide/usage.md</code> |
| <code>guide/syntax.md</code> | <code>en/guide/syntax.md</code> |
| <code>guide/toolbar.md</code> | <code>en/guide/toolbar.md</code> |
| <code>guide/shortcuts.md</code> | <code>en/guide/shortcuts.md</code> |
| <code>guide/settings.md</code> | <code>en/guide/settings.md</code> |
| <code>guide/theme.md</code> | <code>en/guide/theme.md</code> |
| <code>guide/deploy.md</code> | <code>en/guide/deploy.md</code> |
| <code>guide/changelog.md</code> | <code>en/guide/changelog.md</code> |

头部语言切换由 <code>.vitepress/config.mts</code> 的 <code>locales</code> 配置提供，中文导航额外提供 English 入口，英文导航额外提供中文入口。

## Cloudflare Pages 部署

推荐在 Cloudflare Pages 中这样设置：

| 配置项 | 推荐值 |
| --- | --- |
| Framework preset | <code>VitePress</code> |
| Root directory | <code>doc</code> |
| Build command | <code>npm run build</code> |
| Build output directory | <code>.vitepress/dist</code> |
| Environment variable | <code>DOCS_BASE=/</code> |
| Node.js | <code>NODE_VERSION=22.16.0</code> 或更高的 22/24 LTS 版本 |

如果 Cloudflare 项目根目录必须保持仓库根目录，也可以使用：

| 配置项 | 值 |
| --- | --- |
| Build command | <code>npm --prefix doc ci && npm --prefix doc run build</code> |
| Build output directory | <code>doc/.vitepress/dist</code> |
| Environment variable | <code>DOCS_BASE=/</code> |

更多步骤见：[guide/deploy.md](guide/deploy.md)。

## 发布前检查

每次改文档后至少执行：

~~~bash
cd doc
npm run build
~~~

如果改了依赖，再额外执行：

~~~bash
npm audit --audit-level=moderate
~~~

本次文档站还需要额外确认：

- <code>.vitepress/dist/en/index.html</code> 已生成。
- <code>.vitepress/dist/_headers</code> 已生成。
- <code>.vitepress/dist/README.html</code> 没有生成。
- 顶部导航不再出现独立 <code>Releases</code> / <code>GitHub</code> 文本按钮，版本入口在“版本 / Versions”下拉中。

## 参考链接

- [VitePress](https://vitepress.dev/)
- [VitePress Theme Teek](https://vp.teek.top/)
- [Teek GitHub](https://github.com/Kele-Bingtang/vitepress-theme-teek)
- [Cloudflare Pages：Deploy a VitePress site](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vitepress-site/)
