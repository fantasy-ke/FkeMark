# 离线文档转换器（构建者说明）

此目录将 **Microsoft MarkItDown 0.1.9 的官方格式转换器**冻结为 PyInstaller **6.22.3 onedir**，随桌面应用分发。运行用户不需要 Python、pip、系统转换器或网络服务；没有系统 Python 回退。

## 构建与验证

只有构建者需要 CPython **3.12**（本地实际验证 **3.12.13**）。构建脚本可通过 `FKEMARK_BUILD_PYTHON` 指定 Python 可执行文件。脚本只使用参数数组和 `spawnSync(shell: false)`，在 `converter/.venv-build/` 建立隔离环境。

```bash
npm run converter:build   # 安装固定依赖、源码测试、原生冻结、目录/许可证检查、冻结烟雾测试
npm run converter:test    # 已准备环境的离线源码测试与构建/便携回归测试，不安装依赖
npm run converter:smoke   # 使用冻结可执行文件测试所有支持格式
```

普通 `npm test` / `npm run build` 不准备 Python、不下载转换器依赖。Tauri 的 `beforeDevCommand` / `beforeBuildCommand` 调用 `converter:prepare`，复用源文件签名、平台和架构匹配的冻结目录；资源改变时重新构建。`scripts/build.cjs` 的便携/安装构建也准备此目录。

输出始终为：

```text
src-tauri/resources/converter/
  document-converter.exe         # Windows；Unix 不带 .exe
  _internal/                     # Python、动态库、包数据和 dist-info
  licenses/                      # Python、官方格式转换器、依赖、PyInstaller 引导器许可证
  bundle-manifest.json            # 实际版本、架构、体积及 macOS 最低版本检查结果
  build-stamp.json
```

Tauri 采用资源**列表** `resources/converter/`，安装后仍为 `$RESOURCE/resources/converter/`。本地及 CI Windows 便携包使用 `scripts/package-portable.cjs`，把整个目录复制到 `resources/converter/`，压缩时不扁平化路径。只复制转换器 exe 会丢失 `_internal`，不支持这种分发。

## 官方 API 与模块隔离

为保留现有 macOS **10.15** 支持，不实例化 `MarkItDown`（其构造器强制初始化 Magika / ONNX Runtime）。用户已明确选择按确定格式直接调用官方公开的 `DocumentConverter.convert(BinaryIO, StreamInfo)` 接口。

`stage_official.py` 从已安装的固定 Microsoft wheel 复制白名单格式模块到生成的 `fkemark_markitdown` 命名空间：不改动格式转换实现，仅生成最小的空聚合入口，避免 Python 自动执行原包的广泛 `__init__`。复制内容和冻结副本属于 MIT 授权的正常分发；不把第三方代码副本提交到仓库。`requirements.txt` 仅启用 `pdf/docx/pptx/xlsx/xls` 五个可选格式。

Magika、ONNX 及 HTTP 客户端可能作为官方核心包的声明依赖存在于**构建虚拟环境**，但不会被转换入口导入；PyInstaller 显式排除 Magika / ONNX / 云客户端，构建检查拒绝这些模块或 `.onnx` 模型进入分发目录。没有插件加载、OCR、宏执行、音频、图片识别、网站专用转换器或云端转换路由。PPTX 的官方辅助模块包含一个未启用的图像描述函数，转换入口从不传入模型或客户端。

## 单次 UTF-8 JSON 协议

stdin 仅接受一个 JSON 对象：

```json
{
  "protocolVersion": 1,
  "path": "/absolute/read-only-snapshot",
  "extension": ".pdf",
  "url": "https://example.org/final/resource",
  "contentType": "application/pdf",
  "filename": "source.pdf"
}
```

`url`、`contentType`、`filename` 可省略，`extension` 可为空。路径是 Rust 创建的只读本地快照；URL 下载、重定向、安全校验、超时和并发限制均由 Rust 管理，Python 不请求 URL。最终 URL 与响应类型通过 `StreamInfo` 提供给官方转换器。HTML 在转换前仅解析原始 DOM 中的相对 `href/src/data-src`，保留合法 HTTP(S)、`data:image/` 和 `blob:` 图片；转换后的 Markdown 不做往返处理。

成功：`{"protocolVersion":1,"markdown":"...","title":null}`。失败：`{"protocolVersion":1,"error":"conversion_failed"}`。读取 `result.markdown`，不使用软弃用的 `text_content`。stdout 只有一份 JSON，第三方 Python/原生日志均屏蔽，不在 stderr 暴露正文、路径或完整 URL。

支持 PDF、DOCX、PPTX、XLSX、XLS、HTML/HTM、EPUB、TXT、CSV、JSON、XML。未知扩展名按确定 Content-Type、PDF/OLE 签名、OOXML/EPUB 内部结构或可靠 HTML/JSON/XML 特征识别；不把未知普通文本武断猜成 CSV，也不让损坏二进制回退成乱码。文本默认严格 UTF-8，支持 BOM UTF-16/32 和显式响应 charset。

上限：输入 **50 MiB**、Markdown **5 MiB**、请求 **64 KiB**、ZIP **2048** 条目、实际累计解压 **100 MiB**、单条目 **50 MiB**。ZIP 做中央目录与实际逐块读取/CRC 双重检查，不提取到磁盘；拒绝任意 ZIP、路径穿越、加密条目、宏标记和 XML 实体声明。

## 原生兼容性

依赖完整固定在 `constraints.txt`。以下是实际查询官方 PyPI wheel 标签的结果，不等同于旧系统实际运行验证：

| 原生依赖 | 固定版本 | Intel 最低 wheel 标记 | ARM 最低 wheel 标记 |
| --- | --- | --- | --- |
| pandas | 3.1.1 | macOS 10.13 | macOS 11.0 |
| NumPy | 2.5.5 | macOS 10.13 | macOS 11.0 |
| Pillow | 13.0.0 | macOS 10.13 | macOS 11.0 |
| cryptography | 48.0.1 | macOS 10.9 universal2 | 同一 universal2 |
| PDFium / pypdfium2 | 4.30.0 | macOS 10.13 | macOS 11.0 |
| lxml | 6.1.3 | macOS 10.13 | 同一 universal2 |
| cffi | 2.1.1 | macOS 10.15 | macOS 11.0 |

最新版 pdfplumber 要求仅支持 macOS 11+ 的 PDFium，因此固定到仍符合 MarkItDown 要求的 **pdfplumber 0.11.9 / pdfminer.six 20251230**。最新版 cryptography 已不提供 Intel wheel，因此使用 **48.0.1**。NumPy 同版有额外的 macOS 14 Accelerate 变体；macOS 构建会显式下载并安装上述较低最低版本的 wheel，而不是让新 runner 自动选中高版本变体。

官方核心依赖的 ONNX 1.32 已没有 Intel wheel；仅 Intel **构建环境**约束到 1.23.2，不进入冻结产物。CI 为 Intel 使用 `macos-15-intel`、ARM 使用原生 ARM runner，Windows/Linux 使用 x64 runner，每个平台执行原生冻结、源码测试、冻结烟雾测试。`verify_bundle.py` 检查分发中所有 Mach-O 的目标架构最低版本，Intel 高于 10.15 / ARM 高于 11.0 即失败，不通过修改应用最低版本掩盖不兼容。

## 当前实际验证

2026-11-24，Windows 11 x64 / CPython 3.12.13：

- Python 源码协议、离线/格式、安全/大小上限测试通过。
- Windows onedir 真实冻结并独立执行 12 种格式与失败协议烟雾测试通过；快照内容未被改写、stderr 为空。
- 完整目录约 **119.0 MiB**（清单记录实际字节数）。
- 构建与便携目录/ZIP 保真测试通过。

macOS Intel、macOS ARM、Linux 的原生构建与旧 macOS 系统实际运行尚未在本机验证，需以 CI 和目标设备运行结果为准。官方 XLS 路由依赖 xlrd；当前固定 pandas 会发出未来废弃提示，应用协议中该第三方提示被抑制，并已通过真实 XLS 测试。没有 OCR 的扫描 PDF 会得到 `empty_result`，不偷偷联网或安装额外能力。
