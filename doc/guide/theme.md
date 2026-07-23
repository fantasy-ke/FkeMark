# 墨纸 Vellum 主题

“墨纸 Vellum”是为 Markdown 软件设计的阅读主题方向：不做花哨仪表盘，而是像一张有纹理的稿纸，让标题、引用、代码和表格都更适合长期阅读。

当前文档站已经切换为 **VitePress Theme Teek + FkeMark 自定义 CSS**。Teek 负责文档主题能力，FkeMark 自定义样式负责产品气质。

## 主题选型

本次选择 Teek，是因为它比只扩展 VitePress 默认主题更适合当前文档站需求：

- **仍然基于 VitePress**：保持 Markdown-first、静态构建和 Cloudflare Pages 友好。
- **文档增强更完整**：内置文章卡片风格、代码块增强、主题色切换、返回顶部、站点分析和页脚分组。
- **配置集中**：通过 `defineTeekConfig` 管理主题功能，减少后续散落的自定义代码。
- **可保留默认首页**：当前配置使用 `teekHome: false` + `vpHome: true`，首页继续走 VitePress Home 布局，教程页使用 Teek 增强。
- **可叠加品牌样式**：`custom.css` 继续覆盖颜色、字体、卡片和 Markdown 阅读细节。

## 已启用的 Teek 配置

| 配置 | 当前用途 |
| --- | --- |
| `pageStyle: 'card-nav'` | 教程页使用更有层次的卡片式阅读布局 |
| `themeEnhance` | 开启主题色、布局增强和聚光灯阅读辅助 |
| `codeBlock` | 开启代码块增强、长代码折叠和语言名称显示 |
| `backTop` | 使用阅读进度式返回顶部按钮 |
| `articleAnalyze` | 显示更新时间、字数/阅读信息等文章辅助信息 |
| `docAnalysis` | 页脚展示文档站统计信息 |
| `footerGroup` / `footerInfo` | 区分项目链接、部署链接和主题版权信息 |

## 设计原则

- **纸感背景**：米白底色 + 轻网格，呼应笔记本和稿纸。
- **墨色正文**：正文用深墨色，减少纯黑带来的刺眼感。
- **暖棕强调**：用于标题标记、按钮、代码边框。
- **墨绿辅助**：用于链接、完成状态和可点击入口。
- **少量动效**：只在卡片悬停时出现，并尊重 `prefers-reduced-motion`。

## 色彩令牌

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#fbf6ea"></i><span>paper / #fbf6ea</span></div>
  <div class="theme-token"><i style="background:#2d2a24"></i><span>ink / #2d2a24</span></div>
  <div class="theme-token"><i style="background:#8f4f24"></i><span>warm brown / #8f4f24</span></div>
  <div class="theme-token"><i style="background:#2f7c68"></i><span>leaf green / #2f7c68</span></div>
</div>

## 已落地位置

| 文件 | 作用 |
| --- | --- |
| `doc/.vitepress/theme/index.ts` | Teek 主题入口，加载 `vitepress-theme-teek/index.css` 与本项目自定义 CSS |
| `doc/.vitepress/config.mts` | VitePress 与 Teek 的站点配置 |
| `doc/.vitepress/theme/custom.css` | 文档站整体视觉主题 |
| `doc/public/theme/fkemark-vellum.css` | 可在应用 Markdown 预览区复用的主题 CSS |
| `doc/index.md` | 首页纸张式示例区 |

## 在 Markdown 渲染容器中使用

把 CSS 引入你的页面，然后给 Markdown 内容容器添加 `fkemark-vellum` 类：

```html
<link rel="stylesheet" href="/theme/fkemark-vellum.css" />

<article class="markdown-body fkemark-vellum">
  <h1>项目记录</h1>
  <p>这里是 Markdown 渲染后的正文。</p>
</article>
```

## VitePress 主题入口

文档站入口保持很轻，只负责接入 Teek 和自定义样式：

```ts
import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/index.css'
import './custom.css'

export default Teek
```

## 适合与不适合

适合：教程、长期笔记、项目说明、读书笔记、技术方案。

不适合：高密度数据看板、强品牌营销页、需要大量图表交互的页面。

## 参考链接

- [VitePress Theme Teek 文档](https://vp.teek.top/)
- [Teek 快速开始](https://vp.teek.top/guide/quickstart)
- [Teek GitHub](https://github.com/Kele-Bingtang/vitepress-theme-teek)
- [VitePress：Extending the Default Theme](https://vitepress.dev/guide/extending-default-theme)
