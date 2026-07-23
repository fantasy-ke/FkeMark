# AGENTS.md

本文件适用于仓库根目录及其全部子目录。除非更深层目录存在独立的 `AGENTS.md`，否则所有自动化代理和协作者都应遵循本规范。

## 1. 项目概况

FkeMark 是一个文件系统优先、无数据库的 Markdown 桌面编辑器。

- 前端：React 18、TypeScript、Vite、TipTap / ProseMirror
- 桌面端：Tauri v2、Rust
- 多语言：简体中文和英文，资源位于 `src/i18n/locales/`
- 测试：Vitest 与 Rust tests
- 文档站：`doc/` 下的 VitePress 项目
- 许可证：AGPL-3.0-only

关键目录：

- `src/app/`：应用状态、默认设置和主布局
- `src/components/`：界面组件，按功能放入 `editor/`、`settings/`、`ai/` 等子目录
- `src/utils/`：通用工具；Markdown 相关实现统一放在 `src/utils/markdown/`
- `src/styles/`：按功能拆分的样式文件
- `src/i18n/locales/`：中英文语言资源
- `tests/`：前端单元与组件测试
- `src-tauri/src/`：Rust 后端、设置、文件系统和更新逻辑
- `src-tauri/capabilities/`：Tauri v2 权限声明
- `.project-memory/memory/`：项目长期记忆和每日工作记录

## 2. 开始修改前

1. 阅读 `.project-memory/memory/MEMORY.md` 和日期最新的 `.project-memory/memory/YYYY-MM-DD.md`，了解历史决策、已知陷阱和近期改动。
2. 执行 `git status --short`，记录修改前已存在的未提交文件。
3. 不覆盖、不格式化、不暂存、不回滚与当前任务无关的修改；发现无关问题只记录，不顺手修复。
4. 非小型改动先建立基线：
   - `npm test`
   - `npm run build`
   - 涉及 Rust 时执行 `cargo check --manifest-path src-tauri/Cargo.toml` 或对应定向测试。
5. 明确需求中的假设、歧义和成功标准。能从项目结构与记忆中确认的内容直接确认，不能安全推断时再询问。
6. 广泛搜索时排除 `node_modules/`、`dist/`、`src-tauri/target/` 和 `release/`。

## 3. 实现原则

- 采用能够满足需求的最小实现，不增加未要求的抽象、配置、依赖或“以后可能用到”的扩展点。
- 修改应保持外科手术式范围；每一处变更都应能追溯到当前需求。
- 优先复用现有组件、工具函数、类型、样式变量和测试模式。
- 不重排无关代码，不统一无关格式，不删除原有死代码；只清理由本次修改产生的无用导入、变量和文件。
- 修复问题时优先定位共享根因，避免在多个调用方重复打补丁。
- 新增依赖前先确认标准库、浏览器/Tauri 原生能力或已安装依赖不能完成需求。
- 代码注释仅用于解释必要的复杂逻辑或平台限制；新增注释优先使用中文，并保持与所在文件风格一致。

## 4. 文件组织与 800 行限制

- 不得让代码文件超过 800 行。代码文件包括 TS、TSX、JS、JSX、MTS、CTS、RS、CSS 和 SCSS。
- 修改接近上限的文件时，应提前拆出本次涉及的功能，避免刚好卡在 800 行附近。
- 拆分后的文件必须归属于原功能的同一目录，例如：
  - 编辑器功能放在 `src/components/editor/`
  - 设置页功能放在 `src/components/settings/`
  - AI 功能放在 `src/components/ai/`
  - Markdown 工具放在 `src/utils/markdown/`
- 不要为了拆分创建只有一层转发、没有实际职责的抽象。
- 拆分后同步更新导入、导出、测试和样式入口，确保行为不变且没有重复实现。
- Markdown 转换、解析、元数据、脚注、双链、演示等工具不得重新散落成多个 `src/utils/markdown*.ts`；统一放在 `src/utils/markdown/`，由 `index.ts` 或明确的模块入口导出。
- 多语言主文件接近上限时，按功能拆到独立语言模块，再由 `zh-CN.ts` 和 `en.ts` 合并导出。

## 5. 前端与交互规范

- 遵循现有设计语言和 CSS 变量，不引入通用营销式渐变、浮夸卡片或与 Markdown 阅读体验不一致的视觉风格。
- 可丢失用户输入的弹窗必须使用显式保存/确认、取消和关闭操作，并支持 `Escape`；遮罩点击不得直接关闭此类弹窗。
- 浮层定位优先复用 `src/utils/popupPosition.ts` 中的边界限制能力，不重复实现窗口边缘计算。
- 新交互必须考虑实时编辑、分栏、阅读和源码模式之间的差异，不应默认所有模式具有同一 DOM 结构。
- 修改编辑器内容时遵循 TipTap / ProseMirror transaction 和现有 Markdown 往返流程，避免直接修改 DOM。
- 外部链接只允许经过现有安全校验的 HTTP/HTTPS 地址；不要放开 `javascript:`、相对路径或不受控的 `data:` 链接。
- 图片地址处理应保留合法的 HTTP(S)、`data:` 和 `blob:` 来源，不应误转为本地资源地址。
- 新增可见文本时同时补充中文和英文资源，不在组件中散落可翻译字符串。
- 明显的 UI 改动除自动化测试外，还应在本地页面或 Tauri 应用中进行一次实际界面核验。

## 6. Markdown 相关规范

- 内置和第三方 Markdown 引擎必须保持一致的功能入口和尽可能一致的往返结果。
- 修改 Markdown 解析或渲染时，必须考虑：
  - Markdown → HTML → Markdown 往返保真
  - 围栏代码和行内代码中的字面语法
  - 表格、任务列表、脚注、Front Matter、双向链接、图片和数学公式
  - 阅读模式、实时编辑和分栏预览
- 不要为通过陈旧测试而删除现有能力。测试失败时先比较断言与当前实现，确认是回归还是测试预期已经过期。
- 修改路由层或共享预处理时，优先在共享入口修复一次，并补充最小可复现测试。
- 新增 Markdown 模块应放在 `src/utils/markdown/`，相关测试放在 `tests/`，命名应能表达具体能力。

## 7. 设置与 Tauri 规范

新增或修改持久化设置时，通常需要同步检查：

1. `src/types/index.ts` 中的 `AppSettings`
2. `src/app/appDefaults.ts` 中的前端默认值
3. `src-tauri/src/settings.rs` 中的 Rust 字段与默认值
4. 旧设置文件缺少新字段时的反序列化兼容
5. 设置界面、中英文文案和兼容测试

Tauri v2 注意事项：

- 前端自定义命令使用 `@tauri-apps/api/core` 的 `invoke`。
- 新增文件、网络、Shell 或系统能力时同步检查 `src-tauri/capabilities/default.json`，只添加完成需求所需的最小权限。
- Windows 上创建 `WebviewWindow` 的命令必须为 `async fn`，避免同步创建导致 WebView2 死锁。
- 多窗口命令应操作 Tauri 注入的当前 `WebviewWindow`，不要硬编码 `main` 窗口。
- 新窗口的透明度等关键属性应与主窗口配置一致；主窗口专属副作用应通过窗口标识隔离。
- 托盘图标由代码创建时，不要同时在配置中再创建第二个托盘实例。
- 只格式化本次涉及的 Rust 文件。若全仓库 `cargo fmt --check` 被历史文件阻塞，使用定向 `rustfmt --check`，并在交付说明中明确记录。

## 8. 验证要求

实现完成后根据改动范围执行：

```powershell
npm test
npm run build
git diff --check
```

涉及 Rust 或 Tauri 时再执行：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

补充要求：

- 新功能或 Bug 修复应留下最小、可运行、能防止回归的测试。
- 涉及 Markdown 往返时运行相关 Markdown 测试；涉及 UI 时运行对应组件测试并做界面核验。
- 完成前扫描活跃代码文件行数，确认没有文件超过 800 行。
- 验证失败时记录失败是否由本次修改造成；不得为了“全绿”修改无关历史问题。
- 交付前再次执行 `git status --short` 和 `git diff --check`，确认没有遗漏、临时文件或意外改动。

## 9. 项目记忆记录

较完整的功能、重构或 Bug 修复完成后，在当天的 `.project-memory/memory/YYYY-MM-DD.md` 追加记录，至少包含：

- 需求
- 实现
- 涉及文件或模块
- 验证结果
- 已知限制或未处理的无关问题
- Git 提交信息（仅在实际提交后填写）

只追加本次任务记录，不覆盖历史内容。长期稳定的架构决策或高风险平台陷阱再整理到 `.project-memory/memory/MEMORY.md`。

## 10. Git 规范

- 以当前用户指令为准。用户明确要求“先看一遍”“先不要提交”时，不得暂存或提交。
- 需要提交时，先再次核对 `git status`，仅暂存本次任务的明确文件；避免使用 `git add .`。
- 不得把用户原有的未提交修改、构建产物、临时截图或调试文件混入提交。
- 提交标题和正文使用中文，标题说明功能或修复目标，正文使用详细子项说明：
  - 实现了什么
  - 关键兼容或安全处理
  - 测试与验证结果
- 一项完整任务通常对应一个聚焦提交；不要把无关清理混入同一提交。
- 未经明确要求不推送、不创建标签、不发版、不创建 Pull Request。
- 提交后确认工作区中只剩用户原有或明确保留的未提交修改。

## 11. 完成标准

任务仅在以下条件满足后才算完成：

- 用户要求的行为已实现，未增加额外范围。
- 相关引用、类型、默认值、语言资源和权限已同步。
- 必要测试已新增或更新，并完成与改动范围匹配的验证。
- 没有代码文件超过 800 行。
- 没有覆盖、暂存或提交无关修改。
- 项目记忆已按任务规模更新。
- 最终说明包含实现摘要、验证结果、已知限制以及 Git 状态。