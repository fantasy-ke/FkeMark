# 墨纸主题

“墨纸 Vellum”是为 Markdown 软件设计的主题方向：不做花哨仪表盘，而是像一张有纹理的稿纸，让标题、引用、代码和表格都更像可长期阅读的文档。

## 设计原则

- **纸感背景**：米白底色 + 轻网格，呼应笔记本和稿纸。
- **墨色正文**：正文用深墨色，减少纯黑带来的刺眼感。
- **暖棕强调**：用于标题标记、按钮、代码边框。
- **墨绿辅助**：用于链接、完成状态和可点击入口。
- **少量动效**：只在首页卡片悬停时出现，尊重 `prefers-reduced-motion`。

## 色彩令牌

<div class="theme-token-grid">
  <div class="theme-token"><i style="background:#fbf6ea"></i><span>paper / #fbf6ea</span></div>
  <div class="theme-token"><i style="background:#2d2a24"></i><span>ink / #2d2a24</span></div>
  <div class="theme-token"><i style="background:#8f4f24"></i><span>warm brown / #8f4f24</span></div>
  <div class="theme-token"><i style="background:#2f7c68"></i><span>leaf green / #2f7c68</span></div>
</div>

## 已落地位置

- 文档站主题：`doc/.vitepress/theme/custom.css`
- 可复用 Markdown 预览主题：[fkemark-vellum.css](../theme/fkemark-vellum.css)

## 在 Markdown 渲染容器中使用

把 CSS 引入你的页面，然后给 Markdown 内容容器添加 `fkemark-vellum` 类：

```html
<link rel="stylesheet" href="/theme/fkemark-vellum.css" />

<article class="markdown-body fkemark-vellum">
  <h1>项目记录</h1>
  <p>这里是 Markdown 渲染后的正文。</p>
</article>
```

## 适合与不适合

适合：教程、长期笔记、项目说明、读书笔记、技术方案。

不适合：高密度数据看板、强品牌营销页、需要大量图表交互的页面。
