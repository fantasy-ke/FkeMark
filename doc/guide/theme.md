# 墨纸 Vellum 主题

“墨纸 Vellum”是为 Markdown 软件设计的 VitePress 主题方向：不做花哨仪表盘，而是像一张有纹理的稿纸，让标题、引用、代码和表格都更像可长期阅读的文档。

## 主题选型

当前使用 **VitePress 官方默认主题 + 自定义 CSS**，不是额外安装第三方主题包。

这样更适合 FkeMark：

- VitePress 默认主题已经提供导航、侧边栏、本地搜索、代码高亮、深色模式。
- 自定义 CSS 只负责纸感、字体、配色和首页展示，不重复造文档框架。
- 少一个第三方主题依赖，Cloudflare Pages 构建更稳定，后续升级也更简单。
- FkeMark 本身是 Markdown 编辑器，主题需要服务长文阅读，而不是做复杂营销页。

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
| `doc/.vitepress/theme/index.ts` | 扩展 VitePress 默认主题，并使用 `theme-without-fonts` 避免加载无用默认字体 |
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

## VitePress 主题扩展方式

文档站入口保持很轻：

```ts
import DefaultTheme from 'vitepress/theme-without-fonts'
import './custom.css'

export default DefaultTheme
```

后续如果需要更复杂的首页组件，再在这个入口里扩展 Layout 或注册 Vue 组件即可；当前阶段只用 CSS 已经够用。

## 适合与不适合

适合：教程、长期笔记、项目说明、读书笔记、技术方案。

不适合：高密度数据看板、强品牌营销页、需要大量图表交互的页面。

## 参考链接

- [VitePress：Extending the Default Theme](https://vitepress.dev/guide/extending-default-theme)
- [VitePress：Default Theme Config](https://vitepress.dev/reference/default-theme-config)
