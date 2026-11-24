"""隔离官方格式转换器，避免包的聚合入口加载自动识别、云端或网站功能。"""
from importlib import metadata
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
STAGE = ROOT / ".stage"
PACKAGE = STAGE / "fkemark_markitdown"
CONVERTERS = {
    "_plain_text_converter.py", "_html_converter.py", "_markdownify.py",
    "_pdf_converter.py", "_docx_converter.py", "_pptx_converter.py",
    "_xlsx_converter.py", "_epub_converter.py", "_csv_converter.py", "_llm_caption.py",
}


def stage_official():
    distribution = metadata.distribution("markitdown")
    if distribution.version != "0.1.9":
        raise RuntimeError("构建需要固定版本 markitdown==0.1.9")
    source = Path(distribution.locate_file("markitdown"))
    # 此目录只存放脚本生成的白名单副本，不修改已安装的第三方包。
    if PACKAGE.exists():
        shutil.rmtree(PACKAGE)
    PACKAGE.mkdir(parents=True)
    for filename in ("_base_converter.py", "_stream_info.py", "_exceptions.py", "__about__.py"):
        shutil.copy2(source / filename, PACKAGE / filename)
    for directory in (PACKAGE, PACKAGE / "converters"):
        directory.mkdir(exist_ok=True)
        (directory / "__init__.py").write_text("", encoding="utf-8")
    for filename in CONVERTERS:
        shutil.copy2(source / "converters" / filename, PACKAGE / "converters" / filename)
    shutil.copytree(source / "converter_utils", PACKAGE / "converter_utils", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    print("已准备固定官方格式转换器白名单（不加载 MarkItDown 聚合入口）")


if __name__ == "__main__":
    stage_official()
