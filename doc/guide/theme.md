# 蓝白 Clear Blue 主题

FkeMark 文档站默认切换为 **蓝白清晰主题**。它面向 Markdown 编辑器的长期写作和阅读：界面保持干净、轻量、留白充分，重点突出标题、引用、代码块、表格和文档导航，而不是做成营销页或仪表盘。

文档站使用 **VitePress Theme Teek + FkeMark 自定义 CSS**。Teek 负责文档增强能力，自定义样式负责蓝白视觉、首页模块、文档正文、顶部导航和侧边栏的一致性。

## 为什么选择 Teek

Teek 比只扩展 VitePress 默认主题更适合当前文档站：

- **仍然基于 VitePress**：Markdown 优先、静态构建、适合 Cloudflare Pages。
- **文档能力更完整**：文章卡片、代码块增强、主题色切换、返回顶部、站点分析和分组页脚。
- **配置集中**：通过 <code>defineTeekConfig</code> 管理导航、侧边栏、语言、版本入口和主题增强。
- **保留默认首页**：<code>teekHome: false</code> + <code>vpHome: true</code> 保持 VitePress 首页布局，再叠加 FkeMark 的自定义模块。
- **品牌样式可控**：<code>custom.css</code> 覆盖颜色、卡片、按钮、Markdown 阅读细节和响应式布局。

## 已启用的 Teek 能力

| 能力 | 当前用途 |
| --- | --- |
| <code>pageStyle: 'card-nav'</code> | 教程页使用卡片式阅读布局 |
| <code>themeEnhance</code> | 主题色、布局增强和 spotlight 阅读辅助 |
| <code>codeBlock</code> | 代码块增强、长代码折叠和语言标识 |
| <code>backTop</code> | 阅读进度式返回顶部按钮 |
| <code>articleAnalyze</code> | 最近更新、字数和阅读信息 |
| <code>docAnalysis</code> | 站点统计信息 |
| <code>footerGroup</code> / <code>footerInfo</code> | 项目、版本、部署和主题链接 |

## 设计原则

- **蓝白背景**：以浅蓝页面底和白色内容卡片为主，降低长时间阅读疲劳。
- **清晰层次**：正文使用墨蓝色，辅助文字使用灰蓝色，避免纯黑过重。
- **编辑器感**：用轻网格、代码块深蓝底、圆角卡片和清晰边框呼应 Markdown 编辑器。
- **统一主色**：首页、文档正文、侧边栏、顶部导航、按钮和链接都使用同一套蓝色系。
- **克制动效**：只保留轻微悬浮反馈，不干扰阅读和教程浏览。

## 色板

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#f6f9ff"></i><span>clear page / #f6f9ff</span></div>
  <div class="theme-token"><i style="background:#ffffff"></i><span>white card / #ffffff</span></div>
  <div class="theme-token"><i style="background:#172033"></i><span>markdown ink / #172033</span></div>
  <div class="theme-token"><i style="background:#2563eb"></i><span>FkeMark blue / #2563eb</span></div>
  <div class="theme-token"><i style="background:#0ea5e9"></i><span>editor sky / #0ea5e9</span></div>
  <div class="theme-token"><i style="background:#eaf2ff"></i><span>sidebar blue / #eaf2ff</span></div>
</div>

## 可复用 Markdown 预览主题

| 文件 | 作用 |
| --- | --- |
| <code>doc/.vitepress/theme/custom.css</code> | 文档站首页、正文、顶部导航、侧边栏和 Teek 组件的蓝白主题覆写 |
| <code>doc/public/theme/fkemark-vellum.css</code> | 可在应用 Markdown 预览区复用的蓝白 Clear Blue 主题 CSS |

> <code>fkemark-vellum.css</code> 和 <code>fkemark-vellum</code> 类名保留是为了兼容旧引用；当前视觉已经切换为蓝白 Clear Blue。

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
