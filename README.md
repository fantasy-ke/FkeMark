# FkeMark

一款**文件系统优先、无数据库、高颜值**的极简 Markdown 混合即时渲染编辑器。

采用 Tauri + React + ProseMirror 构建，安装包小、启动快、原生体验好。所有文件直接以 `.md` 形式保存在你的磁盘上，不依赖任何云端或本地数据库——你的笔记永远是你自己的纯文本文件。

> 作者：[fantasyke](https://github.com/fantasy-ke) · 文档：<https://fantasy-ke.github.io/FkeMark/> · 仓库：<https://github.com/fantasy-ke/FkeMark>

---

## ✨ 特性

- **即时渲染混合编辑**：在 Live（所见即所得）/ Read（只读预览）/ Source（源码）三种模式间即时切换，也可分屏对照。
- **文件系统优先**：直接读写本地 Markdown 文件，无需导入导出库，文件始终可被其他工具打开。
- **高颜值 UI**：支持明亮 / 黑暗 / 跟随系统三套主题，可自定义字体（自动读取本机字体）、编辑器宽度与圆角。
- **丰富的块级编辑**：标题、引用、有序 / 无序列表（多级样式）、任务列表、表格、代码块（语法高亮 + 语言切换）、数学公式（KaTeX）、图片、链接、高亮、下划线等。
- **专注模式 & 打字机模式**：一键进入沉浸式写作，光标始终居中。
- **导入 / 导出**：支持 Markdown / HTML / TXT 互转，带格式校验与冲突处理。
- **多语言**：内置中文（简体）与英文界面。
- **跨平台**：Windows / macOS / Linux。

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

### 运行测试

```bash
npm test
```

## 📁 项目结构

```
.
├── src/                 # React + TipTap 前端源码
│   ├── components/      # UI 组件（编辑器、设置面板、关于页等）
│   ├── i18n/            # 多语言字典（zh-CN / en）
│   ├── styles/          # 样式
│   └── utils/           # 工具函数（导入导出、性能等）
├── src-tauri/           # Tauri 后端（Rust）
├── scripts/             # 构建辅助脚本
├── doc/                 # VitePress 项目首页与文档教程
└── .github/workflows/   # CI 打包流水线（仅 tag 触发）
```

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！提交前请确保 `npm test` 通过。

## 📄 许可证

本项目基于 [AGPL-3.0 许可证](./LICENSE)（GNU Affero 通用公共许可证 v3）开源。这是约束最强的开源许可证之一：任何分发（含通过网络服务器提供修改版）都必须向用户提供完整的对应源码。

Copyright © 2026 fantasyke
