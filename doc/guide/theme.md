# Studio Graphite 主题

FkeMark 文档站默认切换为 **Studio Graphite**。它面向 Markdown 编辑器的长期写作和阅读：用暖纸背景降低冷白屏疲劳，用石墨色建立文档质感，用铜色和青绿承担按钮、链接、状态和重点信息。

文档站使用 **VitePress Theme Teek + FkeMark 自定义 CSS**。Teek 负责文档增强能力，自定义样式负责 Studio Graphite 视觉、首页模块、文档正文、顶部导航和侧边栏的一致性。

## 为什么选择 Teek

本次选型保留 Teek 作为能力底座，而不是迁移到另一套第三方主题：

- **仍然基于 VitePress**：Markdown 优先、静态构建、适合 Cloudflare Pages。
- **文档能力完整**：文章卡片、代码块增强、主题色切换、返回顶部、站点分析和分组页脚已经接入。
- **配置集中**：通过 <code>defineTeekConfig</code> 管理导航、侧边栏、语言、版本入口和主题增强。
- **保留默认首页**：<code>teekHome: false</code> + <code>vpHome: true</code> 保持 VitePress 首页布局，再叠加 FkeMark 的自定义模块。
- **视觉层可插拔**：<code>custom.css</code> 可以在不拆导航、搜索和页脚能力的前提下插入新主题。

## 已启用的 Teek 能力

| 能力 | 当前用途 |
| --- | --- |
| <code>pageStyle: 'card-nav'</code> | 教程页使用卡片式阅读布局 |
| <code>themeEnhance</code> | Studio 铜色、编辑器青绿、布局增强和 spotlight 阅读辅助 |
| <code>codeBlock</code> | 代码块增强、长代码折叠和语言标识 |
| <code>backTop</code> | 阅读进度式返回顶部按钮 |
| <code>articleAnalyze</code> | 最近更新、字数和阅读信息 |
| <code>docAnalysis</code> | 站点统计信息 |
| <code>footerGroup</code> / <code>footerInfo</code> | 项目、版本、部署和主题链接 |

## 设计原则

- **暖纸底色**：用米色页面底和暖白内容卡片替代单一蓝白背景，降低长时间阅读疲劳。
- **石墨骨架**：正文、代码窗口和导航结构使用石墨色，强调本地编辑器和项目文档气质。
- **双强调色**：铜色负责主按钮、链接和标题装饰，青绿负责次级状态和编辑器感细节。
- **首页产品化**：首页保留 Markdown 示例窗口、工作流卡片和文档入口，但通过主次层级减少同质卡片堆叠。
- **克制动效**：只保留轻微悬浮反馈，并通过 <code>prefers-reduced-motion</code> 尊重减少动效偏好。

## 色板

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#f3eee6"></i><span>warm paper / #f3eee6</span></div>
  <div class="theme-token"><i style="background:#fffaf2"></i><span>paper card / #fffaf2</span></div>
  <div class="theme-token"><i style="background:#211c18"></i><span>graphite ink / #211c18</span></div>
  <div class="theme-token"><i style="background:#c96442"></i><span>studio copper / #c96442</span></div>
  <div class="theme-token"><i style="background:#179fa4"></i><span>editor teal / #179fa4</span></div>
  <div class="theme-token"><i style="background:#e8dfd2"></i><span>sidebar paper / #e8dfd2</span></div>
</div>

## 可复用 Markdown 预览主题

| 文件 | 作用 |
| --- | --- |
| <code>doc/.vitepress/theme/custom.css</code> | 文档站全局、正文、顶部导航、侧边栏和 Teek 组件的 Studio Graphite 主题覆写 |
| <code>doc/.vitepress/theme/home.css</code> | 首页 Markdown 示例、工作流卡片和 CTA 模块样式 |
| <code>doc/public/theme/fkemark-vellum.css</code> | 可在应用 Markdown 预览区复用的 Studio Graphite 主题 CSS |

> <code>fkemark-vellum.css</code> 和 <code>fkemark-vellum</code> 类名保留是为了兼容旧引用；当前视觉已经切换为 Studio Graphite。

在 Markdown 渲染容器中复用：

~~~html
<link rel="stylesheet" href="/theme/fkemark-vellum.css" />

<article class="markdown-body fkemark-vellum">
  <h1>项目记录</h1>
  <blockquote>本地文件优先，写作不被工具绑架。</blockquote>
  <pre><code>const mode = 'Live + Source'</code></pre>
</article>
~~~

## VitePress 主题入口

~~~ts
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import './custom.css'

export default Teek
~~~

## 适合场景

适合教程、长期笔记、项目文档、读书笔记、技术方案和发布前校对。

不适合密集仪表盘、强营销页面或重交互图表页面。

## 参考链接

- [VitePress Theme Teek 文档](https://vp.teek.top/)
- [Teek 快速开始](https://vp.teek.top/guide/quickstart)
- [Teek GitHub](https://github.com/Kele-Bingtang/vitepress-theme-teek)
- [VitePress：扩展默认主题](https://vitepress.dev/guide/extending-default-theme)
