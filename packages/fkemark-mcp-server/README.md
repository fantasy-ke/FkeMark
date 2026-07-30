# fkemark-mcp-server

FkeMark 的 Markdown MCP stdio Server。它让支持 MCP 的外部 Agent 在受控权限内读取、搜索、提取大纲、写入、追加或删除 FkeMark Markdown 文件。

## 使用方式

在外部 Agent 的 MCP 配置中直接使用 npm CLI（需要 Node.js 18+ 和 npm/npx）：

```json
{
  "mcpServers": {
    "fkemark": {
      "command": "npx",
      "args": ["-y", "fkemark-mcp-server"],
      "env": {
        "FKEMARK_MCP_ENABLED": "1",
        "FKEMARK_MCP_ROOTS": "D:/Notes",
        "FKEMARK_MCP_PERMISSION": "data-read-write"
      }
    }
  }
}
```

也可以全局安装后使用固定命令：

```bash
npm install -g fkemark-mcp-server
fkemark-mcp-server
```

## 配置

优先级从高到低：环境变量、FkeMark 应用设置、默认值。

| 环境变量 | 说明 |
| --- | --- |
| `FKEMARK_MCP_ENABLED` | 设为 `1`/`true` 启用服务；设为 `0`/`false` 禁用服务。 |
| `FKEMARK_MCP_ROOTS` | 允许访问的 Markdown 文件夹，多个路径可用换行或系统路径分隔符分隔。 |
| `FKEMARK_MCP_PERMISSION` | `read-only`、`data-read-write` 或 `full-access`。 |
| `FKEMARK_SETTINGS_PATH` | 可选，自定义 FkeMark 设置文件路径。 |

## 权限

- `read-only`：列出、读取、搜索、提取大纲。
- `data-read-write`：只读能力 + 写入和追加 Markdown 文件。
- `full-access`：数据读写能力 + 删除 Markdown 文件。

服务只处理允许目录内的 `.md` / `.markdown` 文件，并会阻止越权路径与指向目录外的符号链接。

## 打包与发布

GitHub Actions 的 MCP npm 工作流手动触发时默认只执行 `npm pack`，并把生成的 `.tgz` 作为 artifact 上传。只有在手动触发时勾选 `publish`，或推送 `v*` 标签，并且仓库配置了具备 npm 发布权限的 `NPM_TOKEN` 时，才会执行 `npm publish --access public`。
