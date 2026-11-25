# 固定官方转换器白名单 + 完整 onedir 资源，不加载第三方聚合入口。
import json
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, copy_metadata

root = Path(SPECPATH)
runtime_distributions = json.loads((root / "runtime-distributions.json").read_text(encoding="utf-8"))
datas = collect_data_files("pdfminer") + collect_data_files("pptx") + collect_data_files("pypdfium2")
datas += [(str(root / ".build" / "tessdata"), "tessdata")]
for distribution in runtime_distributions:
    datas += copy_metadata(distribution)

analysis = Analysis(
    [str(root / "document_converter.py")],
    pathex=[str(root), str(root / ".stage")],
    binaries=[], datas=datas, hiddenimports=[],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=["markitdown", "magika", "onnxruntime", "openai", "azure", "xlwt", "pytest", "tkinter"],
    noarchive=False,
)
archive = PYZ(analysis.pure)
executable = EXE(
    archive, analysis.scripts, [], exclude_binaries=True,
    name="document-converter", debug=False, bootloader_ignore_signals=False,
    strip=False, upx=False, console=True,
    target_arch=None, codesign_identity=None, entitlements_file=None,
)
collection = COLLECT(
    executable, analysis.binaries, analysis.datas,
    strip=False, upx=False, name="converter",
)
