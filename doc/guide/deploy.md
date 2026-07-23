# 部署文档站

本项目文档站使用 **VitePress + VitePress Theme Teek**，所有内容都在 `doc/` 文件夹内。构建后会生成纯静态文件，最适合部署到 Cloudflare Pages。

## 本地开发

```bash
cd doc
npm install
npm run dev
```

## 生成静态文件

```bash
cd doc
npm run build
```

构建产物在：

```text
doc/.vitepress/dist
```

把这个目录发布到任意静态托管服务即可。

## 推荐：Cloudflare Pages

官方 Cloudflare Pages 已经提供 VitePress 部署指引，本项目推荐直接使用 Cloudflare Pages 托管文档站。

### 方案 A：Cloudflare Root directory 设置为 `doc`

这是最推荐的配置，命令最短，也最不容易写错。

| 配置项 | 推荐值 |
| --- | --- |
| Framework preset | `VitePress` |
| Root directory | `doc` |
| Build command | `npm run build` |
| Build output directory | `.vitepress/dist` |
| Environment variable | `DOCS_BASE=/` |
| Node.js | `NODE_VERSION=22.16.0` 或更高的 22/24 LTS 版本 |

部署步骤：

1. 打开 Cloudflare Dashboard，进入 **Workers & Pages / Pages**。
2. 选择 **Create application**，再选择 **Pages**。
3. 连接 Git 仓库：`https://github.com/fantasy-ke/FkeMark`。
4. 生产分支按实际发布策略选择：稳定发布用 `main`，开发预览用 `dev`。
5. 按上表填写构建配置。
6. 保存并部署，Cloudflare 会自动安装依赖、构建并发布 `.vitepress/dist`。

### 方案 B：Cloudflare Root directory 保持仓库根目录

如果 Cloudflare 项目不方便把根目录设置为 `doc`，可以让命令显式进入 `doc` 构建：

| 配置项 | 值 |
| --- | --- |
| Framework preset | `None` 或 `VitePress` |
| Root directory | 留空或仓库根目录 |
| Build command | `npm --prefix doc ci && npm --prefix doc run build` |
| Build output directory | `doc/.vitepress/dist` |
| Environment variable | `DOCS_BASE=/` |

## Teek 依赖注意事项

- Teek 当前使用 `vitepress-theme-teek`，并要求 VitePress 保持在 1.6.x 兼容线。
- 依赖版本以 `doc/package-lock.json` 为准，CI/Cloudflare 推荐使用锁文件安装。
- `doc/package.json` 中通过 `overrides.vite` 固定经过验证的 Vite 版本，避免兼容链路里的依赖审计告警。
- 如果后续升级 Teek，先在本地执行 `npm install` 更新锁文件，再运行 `npm run build` 和 `npm audit --audit-level=moderate`。

## Cloudflare 响应头

`doc/public/_headers` 会在构建时复制到输出目录根部，用于 Cloudflare Pages：

- 给所有页面加基础安全响应头。
- 给 VitePress 生成的静态资源加长期缓存。
- 给可复用主题文件保留较短缓存，方便迭代。

## GitHub Pages

仓库地址使用：

```text
https://github.com/fantasy-ke/FkeMark
```

如果部署到 GitHub Pages，预期访问地址是：

```text
https://fantasy-ke.github.io/FkeMark/
```

配置里已经在 GitHub Actions 环境下自动使用 `/FkeMark/` 作为 base。如果你手动部署到根域名，可以设置：

```bash
DOCS_BASE=/ npm run build
```

## 为什么选 VitePress？

| 框架 | 适合 | 本项目取舍 |
| --- | --- | --- |
| VitePress | Markdown-first、轻量静态文档站 | 最贴近当前 Vite/npm 项目，配置少 |
| Docusaurus | 大型文档、多版本、React 插件生态 | 能力强但偏重 |
| Astro Starlight | 内容站、内置导航/搜索/i18n | 也很好，但需要引入 Astro 生态 |
| Nextra | Next.js + MDX 文档站 | 适合已有 Next.js 项目 |

当前目标是首页、教程、主题和部署说明，VitePress 是最小可用且维护成本最低的框架；Teek 是在这个基础上的主题增强层。

## 常见问题

### 页面打开后样式或图标 404

优先检查 `DOCS_BASE`：

- Cloudflare Pages 根域名部署：`DOCS_BASE=/`
- GitHub Pages 仓库页部署：`DOCS_BASE=/FkeMark/`
- 自定义子路径部署：按真实子路径填写，例如 `DOCS_BASE=/docs/`

### Cloudflare 构建失败

本项目文档站使用的 VitePress/Teek 依赖需要较新的 Node.js。Cloudflare Pages 环境变量建议设置：

```text
NODE_VERSION=22.16.0
```

如果后续升级依赖，也可以改成项目验证过的 24 LTS 版本。

### Cloudflare 显示“找不到输出目录”

检查 Root directory 与 Build output directory 是否匹配：

- Root directory 是 `doc`：输出目录填 `.vitepress/dist`
- Root directory 是仓库根目录：输出目录填 `doc/.vitepress/dist`

## 参考链接

- [Cloudflare Pages：Deploy a VitePress site](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vitepress-site/)
- [Cloudflare Pages：Headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [VitePress：Deploy Your VitePress Site](https://vitepress.dev/guide/deploy)
- [VitePress Theme Teek](https://vp.teek.top/)
