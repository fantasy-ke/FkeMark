# 安装与构建

## 下载发行版

推荐普通用户从 GitHub Releases 下载：

- [最新发行版](https://github.com/fantasy-ke/FkeMark/releases/latest)
- [全部发行记录](https://github.com/fantasy-ke/FkeMark/releases)

按平台选择安装包：

| 平台 | 推荐文件 |
| --- | --- |
| Windows | `.msi` 或 `.exe`（NSIS），也可使用便携版 `.zip` |
| macOS | `.dmg` |
| Linux | `.deb` 或 `.AppImage` |

## Windows 安装包、绿色版与日志

Windows 发布产物按用途区分：

| 文件 | 用途 |
| --- | --- |
| `FkeMark-*-windows-x64.msi` | MSI 安装包，适合普通安装和系统安装策略。 |
| `FkeMark-*-windows-x64-setup.exe` | NSIS 安装包，适合交互式安装。 |
| `FkeMark-*-windows-x64-portable.zip` | 绿色版压缩包，解压后直接运行里面的 `FkeMark.exe`。 |

安装包安装完成后，安装目录里通常只有 `FkeMark.exe` 这类运行文件，这是 Tauri 桌面应用的正常形态：前端资源、图标和运行时配置会被打进应用或写到 Windows 的 AppData 目录，安装目录不会预置一堆配置、缓存或历史文件。

从本版本开始，应用接入 Tauri 日志插件，启动后会在 `FkeMark.exe` 所在目录创建独立日志文件：

```text
FkeMark.log
```

- 安装版：日志位于安装目录，也就是 `FkeMark.exe` 同级目录。
- 绿色版：日志位于解压后的绿色版目录，也就是 `FkeMark.exe` 同级目录。
- 日志超过约 2 MB 后会轮转，最多保留 5 份历史日志。
- 如果把应用安装或解压到 `C:\Program Files` 等受保护目录，Windows 可能阻止普通用户写入日志；这种情况下请使用可写安装目录/解压目录，或以具备写权限的方式运行。

用户设置、缓存、版本历史、回收站等运行数据仍按 Windows 规范保存在 AppData 目录，不会全部堆到安装目录；安装目录只额外生成独立日志文件，方便排查启动和文件写入问题。

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
