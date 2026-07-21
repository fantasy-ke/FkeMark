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

## 依赖配置注意事项
- **`highlight.js` 是传递依赖被直接 import**：`src/lib/lowlight.ts` 直接 `import ... from 'highlight.js/lib/languages/...'`，但 `highlight.js` 仅在 `package.json` 中作为 `lowlight` 的传递依赖存在（未声明为直接依赖）。当前 npm 扁平化后可用、构建通过；若将来 `lowlight` 改依赖其他高亮库会断裂。建议把它提升为 `package.json` 直接 `dependencies` 以消除脆弱性（属历史技术债，非新增功能引入）。
- **`katex` 已被实际启用**：之前仅安装未用，本次 KaTeX 功能（MathNode）正式 import 并使用；`package.json` 已声明 `katex ^0.16.8`，构建会把 KaTeX 字体打包进 `dist/assets/`。
- **应用内更新 Rust crates**：`reqwest`(features: stream + rustls-tls, default-features=false) / `sha2` / `futures-util` 已在 `Cargo.toml` 声明，避免 Windows OpenSSL 依赖。

## 前端主题避坑要点
- **主题只定义以下语义 token**（见 `src/styles/variables.css`）：`--bg`/`--surface`/`--fg`/`--muted`/`--border`/`--accent`(赤陶色 #c96442)/`--accent-soft`/`--accent-hover`/`--accent-foreground`/`--destructive`/`--fg-soft`/`--font-mono`/`--radius-btn` 等。**不存在** `--text`、`--text-muted`、`--bg-elevated` 这三个常见误用变量——引用它们会永远落到写死的浅色兜底值（`#333`/`#999`/`#fafafa`），在暗色主题下导致文字看不清 / 浅色块过亮。
- **所有前端 CSS 必须用上述真实 token**，不要凭直觉写 `--text` 之类的变量名；hover/激活态配色统一用 `--accent`/`--accent-soft`，不要用写死蓝色（旧代码曾用 `#4f7cff`）。
- **已知同类遗留**：`src/styles/components/toast.css` 的 `.toast-*` 系列仍误用 `--bg-elevated`/`--text`/`--text-muted` 与写死蓝色 `--accent, #4f7cff`，待单独修复。

## 前端样式结构约定（2026-07-20 重构）
- **总入口**：`src/index.css` 被 `main.tsx` 引入，用 `@import` 聚合 `variables/layout/titlebar/sidebar/editor/statusbar/components/overlays/forms/menus/markdown/about/misc/search/tabs/onboarding.css`。
- **组件样式已拆分**：`src/styles/components.css` 仅为**聚合入口**（6 条 `@import './components/*.css'`），各组件/功能样式独立存放于 `src/styles/components/`：
  - `settings-panel.css`（设置面板侧滑式 + 通用控件）
  - `settings-page.css`（全页面设置模式）
  - `update.css`（版本更新 About + 更新通知 Toast）
  - `confirm-dialog.css`（确认/提示/输入对话框）
  - `toast.css`（统一 Toast 通知中心）
  - `shortcuts.css`（快捷键自定义）
- **新增组件样式**不要写回 `components.css` 单体，应在 `src/styles/components/` 下建对应文件，并在 `components.css` 聚合入口补一行 `@import`。
- **验证纯 CSS 改动的方法**（沙箱 `tsc` 因 `@tauri-apps/api` 子路径解析漂移常报无关错误）：用临时 JS 入口 `import './index.css'` + 临时 vite config（`rollupOptions.input` 指向临时 html）跑 `vite build`，仅验证 CSS `@import` 链路与类名，绕开 TS/Tauri。

## Markdown 渲染引擎架构（2026-07-20）
- **保留 `src/utils/markdown.ts`（手写引擎）原样不动**，作为 `'builtin'` 选项。
- **新增 `src/utils/markdown.third.ts`**：markdown-it（MD→HTML）+ turndown（HTML→MD）+ turndown-plugin-gfm，自定义规则保留 TipTap 兼容属性（data-tex/data-type=taskList/data-checked/==高亮==/图片尺寸），任务列表通过 pre/post-process 实现。
- **新增 `src/utils/markdown.engine.ts`**（路由层）：统一暴露 `markdownToHtml`/`htmlToMarkdown`/`escapeHtml`，根据 `localStorage('markdown-engine')` 在 `'builtin'`/`'third'` 间切换；提供 `setMarkdownEngine()`/`getMarkdownEngine()` 供设置面板调用。
- **Editor.tsx / Minimap.tsx 已改为从 `markdown.engine` 导入**（而非 `markdown`）。
- **设置面板切换入口**：实验性功能 → Markdown 渲染引擎（select 下拉）。
- **依赖**：`markdown-it` / `turndown` / `turndown-plugin-gfm` + 对应 @types。
- **黄金基线测试**：`tests/markdown.roundtrip.test.ts` 9/9 通过，直接引 `src/utils/markdown.ts`（不经过路由层），作为迁移前后保真对比基准。

## 前端 Markdown 渲染
- **现状**：`src/utils/markdown.ts` 是**纯手写、零第三方依赖**的双向转换器（`markdownToHtml` 逐行解析 + `htmlToMarkdown` 递归遍历 DOM），非标准 CommonMark 实现。
- **深度耦合 TipTap/ProseMirror 的 HTML 结构**：用 `data-type="taskList"`、`data-checked`、`data-marker`、`data-separators`、`data-tex`(KaTeX 无损往返)、无 `<thead>` 的 TipTap 表格等自定义属性，专为"所见即所得 ↔ 源码"无损往返定制。
- **换第三方库的核心约束**：必须能保留上述自定义属性的无损往返（尤其 `data-tex`/`data-separators`），否则数学公式/表格会丢精度。
- **2026 候选库（已调研）**：markdown-it(~21M/wk, CommonMark+插件生态最丰) / marked(~15M/wk, 最快) / remark-unified(~8M, AST 最强可扩展) / turndown(HTML→MD 标准) / @tiptap/markdown(官方 2025-10 双向, 基于 MarkedJS, 可自定义 tokenizer 保留 data-tex) / tiptap-markdown(社区版作者已声明弃坑) / Vditor(国产, 含 IR 即时渲染模式, 贴合本项"混合即时渲染"定位) / Milkdown(ProseMirror+remark)。

## 编辑器视图模式（2026-07-20）
- **4 种模式**：`source` / `live` / `read` / `split`（见 `src/types/index.ts` 的 `EditorMode`）
- **分栏模式（'split'）架构决策**：左侧=源码 `<textarea>`，右侧=**静态 HTML 预览**（`dangerouslySetInnerHTML` 渲染 `markdownToPreviewHtml(content)`），而非复用 TipTap 编辑器实例。原因：双 TipTap 实例会导致滚动复位 + content 反馈回路（预览编辑器 onUpdate 回写破坏源码）。静态预览通过 `onUpdate` 早退（`editorModeRef.current !== 'live'` 不回写）+ 内容同步 effect 跳过 `'split'` 来隔离。
- **`markdownToPreviewHtml(md, docDir)`**（`markdown.engine.ts`）：在 `markdownToHtml` 基础上用 `DOMParser` + `katex.renderToString` 把 `.fk-math[data-tex]` 占位符渲染为 KaTeX HTML。因为静态预览不走 TipTap（MathNode 的 KaTeX 渲染是 TipTap 专属），必须自行渲染公式。KaTeX CSS 已由 MathNode 全局引入。
- **拖拽分隔条**：`startSplitDrag` 计算 `clientX` 相对容器比例，钳制 0.15~0.85，持久化 `localStorage('fkemark:splitRatio')`；左栏宽 `splitRatio*100%`，右栏 `(1-splitRatio)*100%`。
- **小地图视口指示器**：`Minimap.tsx` 的 `scrollRef` 类型放宽到 `RefObject<HTMLElement|null>`（兼容 textarea），新增 `.minimap-viewport` 高亮条（`top`/`height` 由 `scrollTop/scrollHeight`、`clientHeight/scrollHeight` 比例算得）；用 `window` 捕获阶段 `scroll` 监听 + `resize` 监听实时更新（规避 textarea/div 挂载时序）。源码/分栏模式传 `editorMode="source"` + `scrollRef={textareaRef}`（绑定源码文本域滚动），live/read 模式传 editor-scroll div。
- **状态栏**：`App.tsx` 视图切换组含 4 按钮（live/split/read/source），`showEmptyState` 排除 source 与 split；body 加 `split-mode` class（CSS 钩子）。
- **i18n**：`status.mode.split` / `settings.mode.split` / `palette.mode.split`（zh-CN + en）。

## 构建环境注意（2026-07-20）
- **Vite 4.5 内联 `<style>` 构建缺陷**：`index.html` 含内联 `<style>` 时，`vite build` 报 "No matching HTML proxy module found"（html-inline-proxy 插件 bug）。已修复：内联 splash 样式外置为 `src/splash.css`，`index.html` 改用 `<link rel="stylesheet" href="/src/splash.css" />`（commit `2547960`）。新增启动画面样式请放 `src/splash.css` 而非 inline。
- `tests/core.test.ts` 的「导出格式应包含 md/html/txt」已陈旧（实际导出含 pdf），与该测试断言不一致，属既有问题，非功能缺陷。

## 链接/图片内联编辑（2026-07-21）
- **单击链接编辑**：实时模式下 `.editor-scroll` 的 `onClickCapture` 检测 `<a.md-link>` 点击 → `editor.view.posAtDOM` 定位 ProseMirror link mark → 弹出 LinkDialog 预填 `href` + `text`。`applyLink()` 支持已有 link mark 替换（先 `unsetLink`，再 `setLink({ href })`），也兼容选中文本创建新链接的原有逻辑。
- **单击图片编辑**：`onClickCapture` 检测 `<img>` 点击 → 定位 ProseMirror image node → 弹出 `ImageEditPopup`（浮动内联弹窗，src + alt 字段，OK/Cancel）。保存通过 `tr.setNodeMarkup(pos, undefined, { src, alt })` 直接更新 node attrs。
- **CSS**：`.image-edit-popup-*` 系列在 `menus.css`，风格与 `.link-dialog-*` 一致（surface 背景 + accent 确认按钮）。
- **阅读模式**：`isReadMode` 检查跳过编辑（仅渲染，不触发弹窗）。

## 全模式文本检索（2026-07-21）
- **FindReplaceBar** 新增 `forceTextMode`/`content`/`onContentChange` props。文本模式下：`findMatchesInText()` 在纯文本中正则搜索 → `countLinesToIndex()` 估算行号 → `textarea.setSelectionRange()` 选中 → `scrollTop` 滚动。替换通过 `onContentChange` 回调改写内容。
- **所有 ProseMirror 搜索函数**（`doSearch`/`updateCurrentMatch`/`replaceCurrent`/`replaceAll`）均新增 `isTextMode` 分支。
- **Editor.tsx wiring**：`visible={findReplaceVisible}`（取消 `!isSourceMode` 限制），源码/分栏传 `forceTextMode={true}` + `content` + `onContentChange`。
- **限制**：textarea 无高亮装饰（不支持富文本），以选中文本 + 计数提供视觉反馈。

## 图片路径转换（2026-07-21 修复）
- **`isRelativeAssetPath`** 从仅匹配 `./assets/`/`assets/` 改为匹配所有非绝对 URL 的相对路径（排除 `http:`/`https:`/`data:`/`#`/`/` 开头）。确保任意本地相对路径图片都能通过 `convertFileSrc` 转为 Tauri asset 协议 URL。
- **影响**：`markdown.ts` 的 `parseInlineMd` + `markdown.third.ts` 的 `postProcessImageSrc` 均调用 `toAssetUrl()`，现在对所有相对路径生效。

## 窗口最大化权限（2026-07-21 修复）
- `capabilities/default.json` 需 `core:window:allow-toggle-maximize` 才能使 `getCurrentWebviewWindow().toggleMaximize()` 生效。之前仅有 `allow-maximize`/`allow-unmaximize` 而缺 `allow-toggle-maximize`，导致 IPC 被拒 + `safeTauriCall` 静默吞错。
- TopBar 新增 `isMaximized` prop（来自 App 的 `windowMaximized`），按钮在最大化/还原图标间切换。
