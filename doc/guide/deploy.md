# 部署文档站

本项目文档站使用 VitePress，所有内容都在 `doc/` 文件夹内。

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

当前目标只是首页 + 教程 + 主题，VitePress 是最小可用方案。
