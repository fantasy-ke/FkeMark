"""单次 JSON 协议的离线文档转换器。"""
import contextlib
import io
import json
import logging
import os
from pathlib import Path
import sys
from urllib.parse import urljoin, urlsplit

from input_policy import (
    ConversionError, IMAGE_FORMATS, MAX_OUTPUT_BYTES, MAX_REQUEST_BYTES,
    determine_format, read_snapshot, validate_request,
)
from image_ocr import recognize_image

# 源码与冻结产物使用同一个生成的官方模块白名单，不导入 markitdown 的聚合入口。
if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parent / ".stage"))


def normalize_html(text, url):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(text, "html.parser")
    for element in soup.find_all(["a", "img"]):
        attributes = ("href",) if element.name == "a" else ("src", "data-src")
        for attribute in attributes:
            value = element.get(attribute)
            if not isinstance(value, str):
                continue
            value = value.strip()
            try:
                if url and not urlsplit(value).scheme:
                    value = urljoin(url, value)
                parsed = urlsplit(value)
                scheme = parsed.scheme.lower()
                allowed = scheme in ("http", "https") and bool(parsed.hostname) and parsed.username is None and parsed.password is None
                if element.name == "img":
                    allowed = allowed or (scheme == "data" and value.lower().startswith("data:image/")) or scheme == "blob"
                    allowed = allowed or (not url and not scheme and not value.startswith("//"))
                if not allowed or any(ord(char) < 32 for char in value):
                    del element[attribute]
                else:
                    element[attribute] = value
            except ValueError:
                del element[attribute]
    # 只处理原始 HTML 的链接，不将转换出的 Markdown 再往返解析。
    return str(soup)


def official_converter(extension):
    from fkemark_markitdown.converters._csv_converter import CsvConverter
    from fkemark_markitdown.converters._docx_converter import DocxConverter
    from fkemark_markitdown.converters._epub_converter import EpubConverter
    from fkemark_markitdown.converters._html_converter import HtmlConverter
    from fkemark_markitdown.converters._pdf_converter import PdfConverter
    from fkemark_markitdown.converters._plain_text_converter import PlainTextConverter
    from fkemark_markitdown.converters._pptx_converter import PptxConverter
    from fkemark_markitdown.converters._xlsx_converter import XlsConverter, XlsxConverter

    return {
        ".pdf": PdfConverter, ".docx": DocxConverter, ".pptx": PptxConverter,
        ".xlsx": XlsxConverter, ".xls": XlsConverter, ".epub": EpubConverter,
        ".html": HtmlConverter, ".htm": HtmlConverter, ".csv": CsvConverter,
        ".txt": PlainTextConverter, ".json": PlainTextConverter, ".xml": PlainTextConverter,
    }[extension]()


def convert_request(request):
    try:
        request = validate_request(request)
        data = read_snapshot(request["path"])
        extension, text = determine_format(data, request)
        if text is not None:
            if extension in (".html", ".htm"):
                text = normalize_html(text, request.get("url"))
            data = text.encode("utf-8")
        if extension in IMAGE_FORMATS:
            markdown = recognize_image(data, IMAGE_FORMATS[extension])
            title = None
        else:
            from fkemark_markitdown._stream_info import StreamInfo
            from input_policy import content_metadata

            mimetype, _ = content_metadata(request.get("contentType"))
            info = StreamInfo(
                extension=extension, mimetype=mimetype, charset="utf-8" if text is not None else None,
                filename=request.get("filename"), local_path=request["path"], url=request.get("url"),
            )
            # 只按确定格式调用公开 DocumentConverter 接口，不实例化 MarkItDown，不传云客户端。
            with io.BytesIO(data) as stream:
                result = official_converter(extension).convert(stream, info, keep_data_uris=True, strict=True)
                markdown = result.markdown
                if extension == ".pdf" and isinstance(markdown, str) and markdown.strip():
                    from pdf_headings import add_pdf_headings

                    markdown = add_pdf_headings(stream, markdown)
            title = result.title if isinstance(result.title, str) and result.title.strip() else None
        if not isinstance(markdown, str):
            raise ConversionError("conversion_failed")
        if len(markdown.encode("utf-8")) > MAX_OUTPUT_BYTES:
            raise ConversionError("output_too_large")
        if not markdown.strip():
            raise ConversionError("empty_result")
        if title and len(title.encode("utf-8")) > 4096:
            title = None
        return {"protocolVersion": 1, "markdown": markdown, "title": title}
    except ConversionError as error:
        return {"protocolVersion": 1, "error": error.code}
    except Exception:
        # 第三方异常可能包含文档正文、磁盘路径或完整 URL，协议不暴露异常详情。
        return {"protocolVersion": 1, "error": "conversion_failed"}


@contextlib.contextmanager
def silence_dependencies():
    logging.disable(logging.CRITICAL)
    with open(os.devnull, "w", encoding="utf-8") as sink:
        saved = []
        try:
            # 同时关闭原生动态库的输出，避免 stdout 中出现额外日志破坏协议。
            for descriptor in (1, 2):
                saved.append((descriptor, os.dup(descriptor)))
                os.dup2(sink.fileno(), descriptor)
            with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                yield
        finally:
            for descriptor, original in saved:
                os.dup2(original, descriptor)
                os.close(original)


def main():
    with silence_dependencies():
        try:
            raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
            if len(raw) > MAX_REQUEST_BYTES:
                raise ConversionError("invalid_input")
            request = json.loads(raw.decode("utf-8"))
            response = convert_request(request)
        except (UnicodeError, ValueError, ConversionError):
            response = {"protocolVersion": 1, "error": "invalid_input"}
        except Exception:
            response = {"protocolVersion": 1, "error": "conversion_failed"}
    sys.stdout.buffer.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n")
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
