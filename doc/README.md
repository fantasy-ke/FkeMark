# FkeMark 文档站

这里是 FkeMark 的独立文档站源码，内容集中放在 `doc/` 文件夹内。站点使用 **VitePress + VitePress Theme Teek** 构建，并叠加 FkeMark 自己的“墨纸 Vellum”阅读视觉。

## 当前方案

FkeMark 是 Markdown 编辑器，文档天然以 Markdown 为主。本项目选择 VitePress，再使用 Teek 做主题增强：

- **Markdown 优先**：页面就是 `.md` 文件，教程维护成本低。
- **静态输出**：构建后是纯静态文件，适合 Cloudflare Pages、GitHub Pages 或任意静态托管。
- **Teek 主题增强**：提供文章卡片风格、主题色切换、代码块增强、返回顶部、站点统计和页脚分组。
- **保留 FkeMark 风格**：自定义 CSS 继续负责纸感背景、墨色正文、暖棕/墨绿配色和首页展示。

> 当前依赖组合以 `doc/package-lock.json` 为准：Teek 使用 `vitepress-theme-teek`，VitePress 保持在 Teek 兼容的 1.6.x 版本线。

## 本地预览

进入文档目录后安装依赖并启动预览：

```bash
cd doc
npm install
npm run dev
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地预览文档站 |
| `npm run build` | 生成静态文件 |
| `npm run preview` | 预览构建后的静态站点 |
| `npm audit --audit-level=moderate` | 检查文档站依赖安全告警 |

## 目录结构

```text
doc/
├─ .vitepress/
│  ├─ config.mts              # VitePress + Teek 站点配置
│  └─ theme/
│     ├─ index.ts             # Teek 主题入口
│     └─ custom.css           # 文档站“墨纸 Vellum”视觉覆写
├─ guide/                     # 教程正文
│  ├─ index.md                # 快速开始
│  ├─ install.md              # 安装与构建
│  ├─ editing.md              # 编辑教程
│  ├─ theme.md                # Teek + 墨纸主题说明
│  └─ deploy.md               # Cloudflare / GitHub Pages 部署
├─ public/
│  ├─ _headers                # Cloudflare Pages 响应头配置
│  ├─ logo.svg                # 文档站图标
│  └─ theme/fkemark-vellum.css# 可复用 Markdown 预览主题
├─ index.md                   # 文档站首页
├─ package.json
└─ README.md                  # 当前维护说明
```

> `README.md` 是维护者入口，不作为线上站点页面发布；首页由 `index.md` 负责。

## 主题说明

当前文档站使用 **VitePress Theme Teek + 自定义 CSS**：

- `.vitepress/theme/index.ts` 引入 Teek 主题和 Teek 样式。
- `.vitepress/config.mts` 通过 `defineTeekConfig` 配置导航、侧边栏、主题增强、代码块、页脚和文章信息。
- `.vitepress/theme/custom.css` 叠加 FkeMark 的“墨纸 Vellum”视觉。
- `public/theme/fkemark-vellum.css` 提供可在应用 Markdown 预览区复用的阅读主题 CSS。

更多说明见：[`guide/theme.md`](guide/theme.md)。

## Cloudflare Pages 部署

推荐在 Cloudflare Pages 中这样设置：

| 配置项 | 推荐值 |
| --- | --- |
| Framework preset | `VitePress` |
| Root directory | `doc` |
| Build command | `npm run build` |
| Build output directory | `.vitepress/dist` |
| Environment variable | `DOCS_BASE=/` |
| Node.js | `NODE_VERSION=22.16.0` 或更高的 22/24 LTS 版本 |

如果 Cloudflare 项目根目录必须保持仓库根目录，也可以使用：

| 配置项 | 值 |
| --- | --- |
| Build command | `npm --prefix doc ci && npm --prefix doc run build` |
| Build output directory | `doc/.vitepress/dist` |
| Environment variable | `DOCS_BASE=/` |

更多步骤见：[`guide/deploy.md`](guide/deploy.md)。

## 发布前检查

每次改文档后至少执行：

```bash
cd doc
npm run build
```

如果改了依赖，再额外执行：

```bash
npm audit --audit-level=moderate
```

## 参考链接

- [VitePress](https://vitepress.dev/)
- [VitePress Theme Teek](https://vp.teek.top/)
- [Teek GitHub](https://github.com/Kele-Bingtang/vitepress-theme-teek)
- [Cloudflare Pages：Deploy a VitePress site](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vitepress-site/)
