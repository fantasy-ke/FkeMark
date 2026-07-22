# FkeMark 文档站

这里是 FkeMark 的独立文档站源码，使用 **VitePress** 构建，内容集中放在 `doc/` 文件夹内。

## 为什么选择 VitePress

FkeMark 是 Markdown 编辑器，文档天然以 Markdown 为主。对当前需求来说，VitePress 比更重的文档框架更合适：

- **Markdown 优先**：页面就是 `.md` 文件，教程维护成本低。
- **默认主题成熟**：导航、侧边栏、搜索、代码高亮、深色模式都内置。
- **可轻量定制**：当前主题只扩展官方默认主题，没有引入额外主题依赖。
- **静态部署简单**：可以直接部署到 Cloudflare Pages、GitHub Pages 或任意静态托管服务。

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

## 目录结构

```text
doc/
├─ .vitepress/
│  ├─ config.mts              # VitePress 站点配置
│  └─ theme/
│     ├─ index.ts             # 扩展官方默认主题
│     └─ custom.css           # 文档站“墨纸 Vellum”视觉主题
├─ guide/                     # 教程正文
│  ├─ index.md                # 快速开始
│  ├─ install.md              # 安装与构建
│  ├─ editing.md              # 编辑教程
│  ├─ theme.md                # 主题设计说明
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

当前文档站使用 **VitePress Default Theme + 自定义 CSS** 的方式实现“墨纸 Vellum”主题。

这样做的原因很简单：官方默认主题已经覆盖文档站基础能力，自定义 CSS 只负责 FkeMark 需要的阅读气质，避免额外主题包带来的维护成本。

主题落地位置：

- 文档站主题：`.vitepress/theme/index.ts`、`.vitepress/theme/custom.css`
- Markdown 预览主题：`public/theme/fkemark-vellum.css`
- 主题说明页：`guide/theme.md`

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
