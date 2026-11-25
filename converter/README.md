# 离线文档转换器（构建者说明）

此目录将 **Microsoft MarkItDown 0.1.9 的官方格式转换器**和 **Tesseract 图片 OCR** 冻结为 PyInstaller **6.22.3 onedir**。桌面应用从 GitHub 下载组件，不在安装包和便携包中携带它。组件安装后，本地文档和图片的转换不需要 Python、pip 或外部服务。

## 构建与验证

只有构建者需要 CPython **3.12**（本地实际验证 **3.12.13**）。构建脚本可通过 `FKEMARK_BUILD_PYTHON` 指定 Python 可执行文件。脚本只使用参数数组和 `spawnSync(shell: false)`，在 `converter/.venv-build/` 建立隔离环境。

CI 使用 `actions/setup-python` 的 `python-version: '3.12'`，按 runner 的平台和原生架构选择可用补丁版本。不要把本地验证版本直接固定给所有平台：官方安装清单中 `3.12.13` 没有 Windows/macOS 构建，固定它会在冻结转换器前失败。转换器依赖仍由现有约束文件锁定。

```bash
npm run converter:build   # 安装固定依赖、源码测试、原生冻结、目录/许可证检查、冻结烟雾测试
npm run converter:package # 打包上述已验证目录，保留原生动态库、符号链接及许可证
npm run converter:test    # 已准备环境的离线源码测试与构建/便携回归测试，不安装依赖
npm run converter:smoke   # 使用冻结可执行文件测试所有支持格式
```

应用构建（含 Tauri 和 Windows 便携包）不准备 Python，也不下载或嵌入组件。构建组件的 CI 首次下载固定的 `tessdata_fast` 4.1.0 简体中文、英文模型与许可证，核验预置 SHA-256 后打入 `_internal/tessdata/`。

输出始终为：

```text
converter/.build/dist/converter/
  document-converter.exe         # Windows；Unix 不带 .exe
  _internal/                     # Python、动态库、包数据和 dist-info
  licenses/                      # Python、官方格式转换器、依赖、PyInstaller 引导器许可证
  bundle-manifest.json            # 实际版本、架构、体积及 macOS 最低版本检查结果
```

归档输出为 `converter/.build/FkeMark-converter-p1-<Rust 目标>.tar.gz`。`p1` 是转换器协议版本，不是发行版本；同名归档由 GitHub Release 标签隔离。

## 发布组件

在包含本工作流的提交上创建并推送 `converter-vX.Y.Z` 标签即可，三段版本号由发布者指定，不得有前导零。例如：

```bash
git tag converter-v0.1.0
git push origin converter-v0.1.0
```

[组件流水线](../.github/workflows/converter.yml) 使用标签中的版本号，在四个原生平台构建并创建同名 GitHub 预发行版，不触发应用或 MCP 发布，也不更改应用的最新版本。发布后如需更新组件，使用更高的版本号创建新标签，不覆盖旧归档。

“设置 → 组件”中的下载和检查更新会选择版本号最高、带当前平台 `p1` 归档的已发布版本。应用校验归档大小和 SHA-256，并原子安装到应用数据目录的 `components/converter-p1/<标签>/<Rust 目标>/`。导入只使用本地组件，不自动联网；新版安装成功前保留旧组件。发布依赖此组件的应用版本前，先确认组件预发行版的四个归档均可下载。

## 官方 API 与模块隔离

为保留现有 macOS **10.15** 支持，不实例化 `MarkItDown`（其构造器强制初始化 Magika / ONNX Runtime）。用户已明确选择按确定格式直接调用官方公开的 `DocumentConverter.convert(BinaryIO, StreamInfo)` 接口。

`stage_official.py` 从已安装的固定 Microsoft wheel 复制白名单格式模块到生成的 `fkemark_markitdown` 命名空间：不改动格式转换实现，仅生成最小的空聚合入口，避免 Python 自动执行原包的广泛 `__init__`。复制内容和冻结副本属于 MIT 授权的正常分发；不把第三方代码副本提交到仓库。`requirements.txt` 仅启用 `pdf/docx/pptx/xlsx/xls` 五个可选格式。

Magika、ONNX 及 HTTP 客户端可能是**构建环境**依赖，但不会被转换入口导入；PyInstaller 明确排除 Magika / ONNX / 云客户端。OCR 使用独立的 Tesseract 路径和组件内的模型，不加载插件或联网。PPTX 的官方辅助模块包含一个未启用的图像描述函数，转换入口从不传入模型或客户端。

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

支持 PDF、DOCX、PPTX、XLSX、XLS、HTML/HTM、EPUB、TXT、CSV、JSON、XML；PNG、JPEG、WebP 单帧图片走离线 OCR，支持简体中文和英文，最长边 8192 像素、最多 2000 万像素。扫描 PDF 不自动做 OCR；网址导入不运行脚本、不读取登录态。未知扩展名按确定 Content-Type、PDF/OLE 签名、OOXML/EPUB 内部结构或可靠 HTML/JSON/XML 特征识别，不把损坏二进制回退成乱码。文本默认严格 UTF-8，支持 BOM UTF-16/32 和显式响应 charset。

文本 PDF 先走官方正文和表格提取，再通过 pdfplumber 的字形字号推断标题：只将唯一匹配、字号一致且明显大于正文字号的独立行提升为 Markdown 标题，按字号从大到小映射到 H1–H6。模糊匹配或无法取得字形时保留原输出，不改写表格行。

上限：输入 **50 MiB**、Markdown **5 MiB**、请求 **64 KiB**、ZIP **2048** 条目、实际累计解压 **100 MiB**、单条目 **50 MiB**。ZIP 做中央目录与实际逐块读取/CRC 双重检查，不提取到磁盘；拒绝任意 ZIP、路径穿越、加密条目、宏标记和 XML 实体声明。

## 原生兼容性

依赖版本固定在 `requirements.txt` 和 `constraints.txt`。下表来自官方 PyPI wheel 标签或源码构建目标，不等同于旧系统实际运行验证。

| 原生依赖 | 固定版本 | Intel 最低版本 | ARM 最低版本 |
| --- | --- | --- | --- |
| pandas | 3.1.1 | macOS 10.13 | macOS 11.0 |
| NumPy | 2.5.5 | macOS 10.13 | macOS 11.0 |
| Pillow | 13.0.0 | macOS 10.13 | macOS 11.0 |
| cryptography | 48.0.1 | macOS 10.9 universal2 | 同一 universal2 |
| PDFium / pypdfium2 | 4.30.0 | macOS 10.13 | macOS 11.0 |
| lxml | 6.1.3 | macOS 10.13 | 同一 universal2 |
| cffi | 2.1.1 | macOS 10.15 | macOS 11.0 |
| tesserocr | 2.7.1（Windows 使用 2.13.0） | 原生源码构建，目标 macOS 10.15 | 原生源码构建，目标 macOS 11.0 |

Intel wheel 虽标记为 10.9，内部动态库实际要求 macOS 12.0；ARM 2.7.1 wheel 则引用未随包提供的 Tesseract 符号。两个 macOS 架构均通过 `build_legacy_ocr.py` 静态编译 Tesseract 5.3.4 和 Leptonica 1.84.1，再构建 Python 绑定；构建机需有 CMake、Clang 和 `pkg-config`。所有平台由 Pillow 解码图片，仅向 OCR 引擎传递像素。

最新版 pdfplumber 要求仅支持 macOS 11+ 的 PDFium，因此固定到仍符合 MarkItDown 要求的 **pdfplumber 0.11.9 / pdfminer.six 20251230**。最新版 cryptography 已不提供 Intel wheel，因此使用 **48.0.1**。NumPy 同版有额外的 macOS 14 Accelerate 变体；macOS 构建会显式下载并安装上述较低最低版本的 wheel，而不是让新 runner 自动选中高版本变体。

官方核心依赖的 ONNX 1.32 已没有 Intel wheel；仅 Intel **构建环境**约束到 1.23.2，不进入冻结产物。CI 为 Intel 使用 `macos-15-intel`、ARM 使用原生 ARM runner，Windows/Linux 使用 x64 runner，每个平台执行原生冻结、源码测试、冻结烟雾测试。`verify_bundle.py` 检查分发中所有 Mach-O 的目标架构最低版本，Intel 高于 10.15 / ARM 高于 11.0 即失败，不通过修改应用最低版本掩盖不兼容。

Windows 可在生成归档后运行 `cargo test --manifest-path src-tauri/Cargo.toml 冻结转换器通过真实进程完成中文文档导入 -- --ignored`，验证 Rust 解包后执行真实的转换器。macOS 最低版本扫描不替代旧系统实测。官方 XLS 路由依赖 xlrd；固定的 pandas 会发出未来废弃提示，独立进程协议会抑制第三方输出。
