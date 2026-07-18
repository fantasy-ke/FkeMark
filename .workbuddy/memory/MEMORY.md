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

## MSVC 构建环境
- 已安装 MSVC C++ Build Tools（VS 2022 Build Tools + VCTools workload + Windows 11 SDK 22621）
- cl.exe、link.exe、MSVC libs、Windows SDK libs 均已就绪
- `cargo check` 与 `tauri build` 均可通过

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

## Tauri v2 开发避坑要点
1. **托盘配置陷阱**（官方 Issue #8982）：`tauri.conf.json` 的 `app.trayIcon` 配置会自动创建一个托盘实例（无菜单/无事件），与代码 `TrayIconBuilder::new().build()` 并存会导致两个托盘图标（一个无效→点击无响应，一个有效）。正确做法：移除配置中的 `app.trayIcon`，纯代码创建——`TrayIconBuilder::with_id("main-tray").icon(app.default_window_icon().unwrap().clone()).tooltip("FkeMark").menu(&menu).on_menu_event(...).on_tray_icon_event(...).build(app)`。
2. **新窗口命令必须 async（最关键！）**（官方 Issue #13092）：Windows 上，**同步命令**中调用 `WebviewWindowBuilder::new().build()` 会**死锁 WebView2**，导致新窗口白屏冻结、无法关闭、进程无响应。必须将创建窗口的 Tauri 命令声明为 `async fn`。这是新建窗口白屏卡死的根因，与 transparent 等配置无关。
3. **新窗口配置一致性**：`WebviewWindowBuilder` 创建新窗口时，关键属性（特别是 `transparent`）应与主窗口保持一致，避免渲染异常。主窗口 `transparent: true` 时新窗口也需 `.transparent(true)`。
4. **多窗口命令通用性**：涉及窗口操作的 Tauri 命令应接收 `window: tauri::WebviewWindow` 参数（Tauri 自动注入当前调用窗口），而非硬编码 `app_handle.get_webview_window("main")`，否则新窗口（label != "main"）无法使用该命令。前端 `invoke('cmd')` 无需传该参数。
5. **多窗口初始化隔离**：新窗口可通过 URL 查询参数（如 `index.html?win=secondary`）识别，前端用 `new URL(window.location.href).searchParams.get('win')` 判断，据此跳过自动更新检查等主窗口专属逻辑，避免重复网络请求与全局副作用。
6. **`WebviewWindowBuilder` 无 `drag_drop_enabled` 方法**：拖放默认开启（对应配置 `dragDropEnabled`），无需也不能在 builder 上显式调用。
7. **`tauri::image::Image` 未实现 `Default`**：托盘图标设置时不能用 `unwrap_or_default()`，应用 `app.default_window_icon().unwrap().clone()`。
8. **新窗口 splash 闪烁修复**（`index.html` 预置启动画面）：`#root` 内若预置了 splash 启动画面（FM 图标 + loading spinner），新窗口加载时 splash 会短暂可见再被 React 替换——用户感知为"初始化界面闪一下"。修复方案：`WebviewWindowBuilder` 添加 `.visible(false)`（窗口创建时不可见），前端在 `loadSettings()` 完成后用**双 RAF** 调用 `getCurrentWebviewWindow().show()` 显示窗口（双 RAF 确保 React 首屏渲染并绘制完成）。同时新窗口（`win=secondary`）强制 `showOnboarding=false`，避免首启引导在新窗口闪现。注意 `getCurrentWebviewWindow()` 同步返回 `WebviewWindow` 实例（非 Promise），直接 `.show().catch(...)` 调用即可。
9. **macOS 透明窗口必须启用 `macos-private-api`**（最关键！）：`WebviewWindowBuilder::transparent()` 方法的 cfg 是 `#[cfg(any(not(target_os = "macos"), feature = "macos-private-api"))]`——即 **Windows/Linux 始终可用，但 macOS 上只有当 `tauri` 启用 `macos-private-api` feature 时才存在**。若 macOS 打包报 `no method named transparent found`，根因就是没开该 feature，而非代码问题。修复两步：① `Cargo.toml` 的 `tauri` 依赖追加 `features = ["...", "macos-private-api"]`（非 macOS 平台该 feature 为空操作，无副作用）；② `tauri.conf.json` 的 `app` 下加 `"macOSPrivateApi": true`（否则 `tauri-build` 的 feature allowlist 校验会报 "Cargo.toml features does not match allowlist"）。注意：启用 `macos-private-api` 会让 macOS 构建依赖私有 API，**无法上架 Mac App Store**（GitHub 分发 dmg 不受影响）。
