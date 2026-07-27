# 实时编辑渲染架构与兼容性

## 重构来源

实时编辑器的数据流按 `refactoringhq/tolaria` 的 BlockNote 架构重写，参考提交为 `a904e2f96ae634c05155abdf05a89456a8f54f52`。FkeMark 与 Tolaria 均采用 `AGPL-3.0-only` 许可证；直接改编的解析器、序列化器、分块应用和文档缓存文件已保留来源注释。

## 当前渲染流程

1. 应用生命周期内只创建一个 BlockNote 编辑器实例；切换实时、阅读、源码和分栏视图时不销毁编辑器 DOM。
2. 输入事件只标记文档为脏，不在每次按键后同步执行 Markdown 序列化。
3. 用户停止输入 1500ms 后执行一次直接块序列化；保存时先让出一个浏览器任务，再刷新唯一一次待处理序列化。
4. 320 行或 16KB 以上文档优先在 Worker 中解析为 BlockNote 块；快速解析器不支持的语法回退到 BlockNote 自带解析器。
5. 320 个块以上的文档先应用 48 个块，再按每帧最多 120 个块追加，期间临时禁止编辑并支持中止过期任务。
6. 已解析文档进入受内存预算限制的缓存；再次切换回同一文档时复用块结果。
7. 标准块直接序列化并使用块对象缓存；连续同类列表项保存为紧凑 Markdown，不会在每次打开后被额外插入空行。
8. 代码块使用 FkeMark 专用 BlockNote schema 接入 Shiki 高亮器；语言和主题按需动态加载，`text` / `plaintext` 保持纯文本。

## 性能日志

编辑器性能记录保留最近 100 条，可在开发者控制台执行以下命令导出：

```js
window.__FKEMARK_EDITOR_PERFORMANCE__.export()
window.__FKEMARK_EDITOR_PERFORMANCE__.copy()
```

重点阶段：

- `blocknote.parse.fast`：大文档 Worker 快速解析。
- `blocknote.parse.fallback`：快速解析不支持时的 BlockNote 解析。
- `blocknote.apply.chunk`：单个文档块批次超过 50ms。
- `blocknote.apply`：整篇文档分批应用总耗时及最慢批次。
- `blocknote.serialize`：块到 Markdown 的直接序列化。
- `editor.markdown.flush`：空闲刷新、同步读取或保存触发的完整刷新。
- `prosemirror.dispatch`、`browser.long-animation-frame`：底层编辑事务或浏览器长帧。

如果仍出现卡顿，请导出日志并同时说明操作顺序，例如“打开 900 行文件 → 实时编辑 → 切换分栏 → 保存”。根据 `stage`、`sourceLines`、`blockCount`、`slowestChunkMs` 和 `reason` 可以区分解析、渲染、序列化与磁盘保存问题。

## 已保留能力

- 标题、段落、粗体、斜体、删除线、行内代码和普通链接。
- 无序列表、有序列表和任务列表；连续列表项打开与保存后保持单换行的紧凑写法。
- 引用、分隔线、Front Matter、Wiki 链接和基础 Markdown 往返。
- 代码块语法高亮、代码语言浮层和围栏快捷输入；常见语言会按需加载高亮，纯文本代码块不会显示语言标记。
- 表格块与表格右键菜单；在单元格上右键可新增 / 删除行列。
- 图片块与图片右键菜单；在图片上右键可调整尺寸、重置尺寸、设为 50% / 100% 宽度或删除图片。
- 阅读视图和分栏预览继续使用 FkeMark 原有 Markdown 渲染引擎。

## 当前不能与旧实时编辑器完全等价的能力

以下限制只针对新的 BlockNote 实时编辑区域；阅读视图和分栏预览仍按原 Markdown 引擎渲染：

- 行内公式与块公式暂时作为 Markdown 文本插入，不在实时编辑区域内渲染为旧版自定义公式节点。
- 高亮、下划线和交互式脚注没有迁移为 BlockNote 自定义 schema；未知自定义块会触发有损回退并在日志中写入 `fallbackReason`。
- 图片宽高注释、拖拽缩放、上传占位进度和取消按钮尚未迁移；当前右键菜单只覆盖已插入图片块的尺寸预设、重置和删除。
- 罗马数字、字母等自定义有序列表外观会规范为标准数字有序列表。
- 旧版依赖 TipTap 2 自定义节点的部分悬浮语法提示仍需要分别迁移为 BlockNote 自定义 block、inline content 或 style schema，不能继续复用旧 TipTap 2 节点，否则会重新引入双编辑器状态和同步转换卡顿。
