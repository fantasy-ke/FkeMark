# 安装与构建

## 下载发行版

推荐普通用户从 GitHub Releases 下载：

- [最新发行版](https://github.com/fantasy-ke/FkeMark/releases/latest)
- [全部发行记录](https://github.com/fantasy-ke/FkeMark/releases)

按平台选择安装包：

| 平台 | 推荐文件 |
| --- | --- |
| Windows | `.msi` 或 `.exe`（NSIS），也可使用便携版 |
| macOS | `.dmg` |
| Linux | `.deb` 或 `.AppImage` |

## 从源码运行

环境要求：

- Node.js 18+
- Rust 稳定版工具链
- Linux 需要 WebKitGTK 等 Tauri 运行依赖

```bash
npm install
npm run tauri:dev
```

## 打包桌面应用

```bash
npm run tauri:build
```

也可以只打某个平台产物：

```bash
npm run tauri:build:msi
npm run tauri:build:nsis
npm run tauri:build:deb
npm run tauri:build:appimage
npm run tauri:build:dmg
```

## 检查质量

```bash
npm test
```

如果测试失败，优先修复失败用例再发布。
