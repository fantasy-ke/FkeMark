# FkeMark

一款**文件系统优先、无数据库、高颜值**的极简 Markdown 混合即时渲染编辑器。

采用 Tauri v2 + React + BlockNote（基于 ProseMirror / TipTap）构建，安装包小、启动快、原生体验好。所有文件直接以 `.md` 形式保存在你的磁盘上，不依赖任何云端或本地数据库——你的笔记永远是你自己的纯文本文件。

> 作者：[fantasyke](https://github.com/fantasy-ke) · 文档：<https://fkemark.fantasyke.cn> · 仓库：<https://github.com/fantasy-ke/FkeMark>

---

## ✨ 特性

### 编辑体验

- **四种视图模式**：Live（混合即时渲染）/ Read（只读预览）/ Source（Markdown 源码）/ Split（源码与预览分栏），可随时切换。
- **文件系统优先**：直接读写本地 `.md` 文件，不依赖数据库或账号；其他编辑器、Git 与同步盘都能继续使用这些文件。
- **丰富的块级编辑**：标题、引用、有序 / 无序列表（多级样式）、任务列表、表格、代码块（语法高亮 + 语言切换）、Mermaid 图表、数学公式（KaTeX）、图片、链接、高亮、下划线等。
- **长文档友好**：小地图、标题折叠、长代码块折叠，并针对长文输入做了序列化与渲染性能优化。
- **知识化写作**：`[[Wiki 双链]]` 自动补全、反向链接面板、侧边栏文档大纲。
- **专注模式**：一键隐藏侧栏、工具栏与状态栏，只保留编辑区。
- **提效工具**：命令面板（`Ctrl+P` 快速打开文件）、目录内文本搜索、全局查找替换、片段与模板、拼写检查、Vim 模式、可自定义快捷键。
- **本地版本历史**：保存前自动留存快照，支持差异对比与恢复。
- **回收站**：删除的文件先进入应用回收站，可还原或彻底清除。
- **演示模式**：用单独一行的 `---` 分页，把笔记直接变成幻灯片。

### 外观与集成

- **高颜值 UI**：明亮 / 深色 / 跟随系统三种明暗模式，外加 ayu、Catppuccin、Codex、Dracula、Everforest、GitHub、Linear、Vercel、VS Code+、Xcode，共 13 套主题；可自定义字体（自动读取本机字体）、编辑器宽度、圆角与工具栏布局。
- **AI 助手**：续写 / 摘要 / 润色 / 翻译，支持本地服务与 API（OpenAI 兼容、Responses、Anthropic Messages 三种上游格式）。
- **MCP 服务**：内置 [`fkemark-mcp-server`](./packages/fkemark-mcp-server)，让外部 Agent 在只读 / 可读写 / 完全访问三档权限内读取、搜索与写入你的 Markdown 文件。
- **图片与同步**：粘贴图片可存入本地资源目录，也可上传至 SM.MS、自建图床、WebDAV 或内联 Base64；支持 WebDAV 文档同步。
- **导入 / 导出**：导入 Markdown / HTML / TXT；导出 Markdown、HTML、TXT、PDF、DOCX、EPUB、RTF、OPML 八种格式。
- **多语言与跨平台**：内置简体中文与英文界面；支持 Windows / macOS / Linux。

## 📦 安装

前往 [Releases](https://github.com/fantasy-ke/FkeMark/releases) 页面下载对应平台安装包：

- **Windows**：`.msi` 或 `.exe`（NSIS）安装包 / 便携版
- **macOS**：`.dmg`
- **Linux**：`.deb` / `.AppImage`

## 🛠 从源码构建

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 稳定版工具链
- 平台依赖（Linux）：`libwebkit2gtk-4.1-dev`、`libappindicator1-dev`、`librsvg2-dev`、`patchelf`

### 步骤

```bash
# 1. 安装前端依赖
npm install

# 2. 开发模式（热更新）
npm run tauri:dev

# 3. 生产构建（产出安装包到 src-tauri/target/release/bundle）
npm run tauri:build
```

也可使用快捷脚本分别构建指定平台产物：

```bash
npm run tauri:build:msi      # Windows MSI
npm run tauri:build:nsis     # Windows NSIS
npm run tauri:build:deb      # Linux deb
npm run tauri:build:appimage # Linux AppImage
npm run tauri:build:dmg      # macOS dmg
```

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 仅启动前端开发服务器（不含桌面端能力） |
| `npm run tauri:dev` | 启动桌面端开发模式（热更新） |
| `npm test` | 运行前端单元与组件测试（Vitest） |
| `npm run build` | 类型检查并构建前端产物 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 检查 Rust 后端编译 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 后端测试 |

## 📁 项目结构

```
.
├── src/                          # React 前端
│   ├── App.tsx                   # 应用状态编排入口
│   ├── app/                      # 应用级状态与布局（标签页、保存、更新、同步等 hooks）
│   ├── components/               # 界面组件
│   │   ├── editor/               # BlockNote 编辑器、工具栏、自定义节点与编辑期 hooks
│   │   ├── settings/             # 设置页各分区
│   │   └── ai/                   # AI 对话侧栏
│   ├── utils/markdown/           # Markdown 解析、序列化、元数据、双链、公式等
│   ├── utils/                    # 导入导出、更新、图床、主题、快捷键等通用工具
│   ├── styles/                   # 样式（语义变量、布局与 components/ 下的组件样式）
│   ├── i18n/locales/             # 中英文语言资源
│   └── types/                    # 共享类型
├── src-tauri/                    # Tauri v2 后端（Rust）
│   ├── src/file_system/          # 文件读写、搜索索引、版本快照、回收站、图片资源
│   └── capabilities/             # Tauri v2 权限声明
├── tests/                        # Vitest 前端单元与组件测试
├── packages/fkemark-mcp-server/  # 独立的 Markdown MCP stdio Server
├── scripts/                      # 打包与图标生成脚本
├── doc/                          # VitePress 文档站（中英双语）
├── .github/workflows/            # CI：构建、发布与代码审查
└── .project-memory/memory/       # 项目长期记忆与每日工作记录
```

目录职责、代码规范与验证要求的完整说明见 [`AGENTS.md`](./AGENTS.md)。

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！提交前请确保 `npm test` 通过。

## 📄 许可证

本项目基于 [AGPL-3.0 许可证](./LICENSE)（GNU Affero 通用公共许可证 v3）开源。这是约束最强的开源许可证之一：任何分发（含通过网络服务器提供修改版）都必须向用户提供完整的对应源码。

Copyright © 2026 fantasyke
