# FkeMark 项目长期记忆

## 项目概述
- **名称**：FkeMark — 极简 Markdown 混合即时渲染编辑器
- **技术栈**：Tauri v2 + React + TypeScript + TipTap/ProseMirror + Vite + Tailwind CSS
- **仓库**：https://github.com/fantasy-ke/FkeMark
- **许可证**：AGPL-3.0-only

## 技术栈版本（2026-07-18 更新）
- **Tauri**：v2（从 v1 迁移）
- **Rust**：1.97.1（stable toolchain）
- **Node**：22.22.2（managed）
- **Python**：3.13.12（managed）
- **Vite**：4.5.x
- **TypeScript**：5.2.x

## 关键架构决策
- **Rust 后端**：lib.rs + main.rs 分离（v2 标准），`pub fn run()` 入口
- **前端 Tauri 调用**：`@tauri-apps/api/core` 的 `invoke` 调用自定义 Rust 命令
- **权限系统**：`src-tauri/capabilities/default.json` ACL 权限（v2 替代 v1 allowlist）
- **字体设置**：CSS 变量 `--font-editor` / `--editor-font-size` / `--md-font-family` / `--md-font-size` 全局应用
- **i18n**：zh-CN + en，在 `src/i18n/locales/` 下
- **CI/CD**：GitHub Actions，dev.yml + release.yml 三阶段流水线（release → build → publish）

## MSVC 构建环境注意
- 机器未安装 MSVC C++ Build Tools（无 `link.exe`）
- `cargo check` 可通过（仅类型检查），但 `tauri build` 产出二进制需要安装 C++ Build Tools
- 安装方法：VS Installer 添加 C++ 工作负载，或 `winget install Microsoft.VisualStudio.2022.BuildTools`

## 文件结构关键路径
- Rust 源码：`src-tauri/src/lib.rs`（主逻辑）、`main.rs`（入口）
- Rust 设置：`src-tauri/src/settings.rs`（AppSettings struct）
- Rust 文件系统：`src-tauri/src/file_system.rs`
- 前端入口：`src/App.tsx`
- 编辑器：`src/components/Editor.tsx`
- 顶栏：`src/components/TopBar.tsx`
- 设置面板：`src/components/SettingsPanel.tsx`
- Tauri 配置：`src-tauri/tauri.conf.json`
- 权限：`src-tauri/capabilities/default.json`
- 构建脚本：`scripts/build.cjs`
