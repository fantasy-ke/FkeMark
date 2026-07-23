# 使用方法

FkeMark 的使用方式围绕一个原则：**文档仍然保存在本地文件夹里，编辑器只负责更顺手地写、看、整理和发布 Markdown**。

![FkeMark 使用流程](/images/guide/workflow.svg)

## 日常使用流程

| 步骤 | 操作 | 结果 |
| --- | --- | --- |
| 1 | 打开本地文件夹 | 侧边栏显示原有 Markdown 目录结构 |
| 2 | 新建或打开 <code>.md</code> 文件 | 文件保持普通纯文本格式 |
| 3 | 选择 Live / Read / Source 模式 | 在起草、校对和源码控制之间切换 |
| 4 | 插入图片、表格、链接或代码块 | 常用 Markdown 内容可以直接组织 |
| 5 | 保存、导出或发布 | 用本地文件、导出格式或文档站继续流转 |

## 推荐写作路径

1. **先搭结构**：在 <code>Source</code> 或 <code>Live</code> 中写标题、列表和段落。
2. **再补内容**：用工具栏插入链接、图片、表格、代码块等高频元素。
3. **分屏检查**：复杂表格、公式或代码较多时，用分屏对照源码和预览。
4. **阅读校对**：切换到 <code>Read</code>，像看成稿一样检查层级和节奏。
5. **稳定保存**：优先保存为 Markdown；导出格式只用于分享、归档或迁移。

## 文件夹组织建议

| 场景 | 建议目录 |
| --- | --- |
| 项目文档 | <code>docs/</code>、<code>notes/</code>、<code>changelog/</code> |
| 学习笔记 | <code>inbox/</code>、<code>reading/</code>、<code>summary/</code> |
| 博客草稿 | <code>drafts/</code>、<code>assets/</code>、<code>published/</code> |

::: tip
不要把图片、附件和 Markdown 分散到太多地方。建议把图片放在当前文档同级的 <code>assets/</code> 或项目统一的资源目录中。
:::

## 下一步

- 想了解支持哪些 Markdown 写法：看 [Markdown 语法](./syntax)。
- 想知道按钮怎么用：看 [工具栏](./toolbar)。
- 想提升效率：看 [快捷键](./shortcuts)。
- 想调整界面：看 [设置页面](./settings)。
