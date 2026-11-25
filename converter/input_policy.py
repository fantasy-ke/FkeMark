"""只读输入、可靠格式识别及资源上限。"""
import codecs
import io
import json
import os
import re
import stat
import zipfile
from email.message import Message
from pathlib import Path
from urllib.parse import urlsplit

MAX_INPUT_BYTES = 50 * 1024 * 1024
MAX_OUTPUT_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = 64 * 1024
MAX_ZIP_ENTRIES = 2048
MAX_ZIP_BYTES = 100 * 1024 * 1024
IMAGE_FORMATS = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}
SUPPORTED = {".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".html", ".htm", ".epub", ".txt", ".csv", ".json", ".xml"} | IMAGE_FORMATS.keys()
ZIP_FORMATS = {".docx", ".pptx", ".xlsx", ".epub"}
TEXT_FORMATS = {".html", ".htm", ".txt", ".csv", ".json", ".xml"}
MIME_EXTENSIONS = {
    "application/pdf": ".pdf", "application/x-pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls", "application/epub+zip": ".epub",
    "text/html": ".html", "application/xhtml+xml": ".html", "text/plain": ".txt",
    "text/csv": ".csv", "application/csv": ".csv", "application/json": ".json",
    "application/xml": ".xml", "text/xml": ".xml",
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
}


class ConversionError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def validate_request(request):
    if not isinstance(request, dict) or type(request.get("protocolVersion")) is not int or request["protocolVersion"] != 1:
        raise ConversionError("invalid_input")
    path = request.get("path")
    extension = request.get("extension")
    if not isinstance(path, str) or not path or len(path) > 32768 or "\0" in path or not Path(path).is_absolute():
        raise ConversionError("invalid_input")
    if not isinstance(extension, str) or len(extension) > 16:
        raise ConversionError("invalid_input")
    if extension and extension.lower() not in SUPPORTED:
        raise ConversionError("unsupported_format")
    for key, limit in (("url", 8192), ("contentType", 1024), ("filename", 1024)):
        value = request.get(key)
        if value is not None and (not isinstance(value, str) or len(value) > limit or re.search(r"[\x00-\x1f\x7f]", value)):
            raise ConversionError("invalid_input")
    url = request.get("url")
    if url is not None:
        try:
            parsed = urlsplit(url)
            if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname or parsed.username is not None or parsed.password is not None:
                raise ValueError()
            _ = parsed.port
        except ValueError:
            raise ConversionError("invalid_url") from None
    return request


def read_snapshot(path):
    try:
        with open(path, "rb") as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise ConversionError("file_read_failed")
            if info.st_size > MAX_INPUT_BYTES:
                raise ConversionError("input_too_large")
            data = source.read(MAX_INPUT_BYTES + 1)
    except OSError:
        raise ConversionError("file_read_failed") from None
    if len(data) > MAX_INPUT_BYTES:
        raise ConversionError("input_too_large")
    return data


def inspect_zip(data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_ENTRIES or sum(item.file_size for item in entries) > MAX_ZIP_BYTES:
                raise ConversionError("input_too_large")
            total = 0
            names = set()
            for item in entries:
                name = item.filename.replace("\\", "/")
                if name in names or name.startswith("/") or ".." in name.split("/") or "\0" in name or item.flag_bits & 1:
                    raise ConversionError("conversion_failed")
                names.add(name)
                if "vbaproject" in name.lower() or name.lower().endswith((".docm", ".xlsm", ".pptm")):
                    raise ConversionError("unsupported_format")
                if item.file_size > MAX_INPUT_BYTES:
                    raise ConversionError("input_too_large")
                # 不能只信任中央目录声明；逐块实际解压并检查 CRC、累计大小及危险 XML 声明。
                with archive.open(item) as member:
                    previous = b""
                    while chunk := member.read(65536):
                        total += len(chunk)
                        if total > MAX_ZIP_BYTES:
                            raise ConversionError("input_too_large")
                        if name.lower().endswith((".xml", ".rels", ".opf", ".xhtml")):
                            probe = (previous + chunk).replace(b"\0", b"")
                            unsafe_xml = re.search(rb"<!\s*ENTITY\b", probe, re.I)
                            if not name.lower().endswith(".xhtml"):
                                unsafe_xml = unsafe_xml or re.search(rb"<!\s*DOCTYPE\b", probe, re.I)
                            if unsafe_xml or b"macroenabled" in probe.lower():
                                raise ConversionError("unsupported_format")
                            previous = chunk[-128:]
            if "word/document.xml" in names:
                return ".docx"
            if "ppt/presentation.xml" in names:
                return ".pptx"
            if "xl/workbook.xml" in names:
                return ".xlsx"
            if "mimetype" in names and "META-INF/container.xml" in names and archive.read("mimetype") == b"application/epub+zip":
                return ".epub"
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError):
        raise ConversionError("conversion_failed") from None
    raise ConversionError("unsupported_format")


def content_metadata(content_type):
    if not content_type:
        return None, None
    message = Message()
    message["Content-Type"] = content_type
    return message.get_content_type().lower(), message.get_content_charset()


def decode_text(data, charset):
    if data.startswith((codecs.BOM_UTF32_LE, codecs.BOM_UTF32_BE)):
        encoding = "utf-32"
    elif data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        encoding = "utf-16"
    else:
        encoding = charset or "utf-8-sig"
    try:
        text = data.decode(encoding, errors="strict")
    except (LookupError, UnicodeError):
        raise ConversionError("conversion_failed") from None
    # 对文本类型也拒绝二进制控制字符，不允许损坏文档悄悄回退为乱码。
    if re.search(r"[\x00-\x08\x0b\x0e-\x1f\x7f]", text):
        raise ConversionError("conversion_failed")
    return text


def determine_format(data, request):
    extension = request["extension"].lower()
    mimetype, charset = content_metadata(request.get("contentType"))
    detected = None
    if data[:1024].lstrip().startswith(b"%PDF-"):
        detected = ".pdf"
    elif data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        detected = inspect_zip(data)
    elif data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        detected = ".xls"
    if detected:
        if extension and extension != detected:
            raise ConversionError("conversion_failed")
        return detected, None
    if extension in ZIP_FORMATS or extension in (".pdf", ".xls"):
        raise ConversionError("conversion_failed")
    extension = extension or MIME_EXTENSIONS.get(mimetype)
    if extension in ZIP_FORMATS or extension in (".pdf", ".xls"):
        raise ConversionError("conversion_failed")
    if not extension:
        text = decode_text(data, charset)
        sample = text.lstrip()[:4096]
        if re.match(r"(?is)(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)", sample):
            extension = ".html"
        elif sample.startswith("<?xml"):
            extension = ".xml"
        elif sample.startswith(("{", "[")):
            try:
                json.loads(text)
                extension = ".json"
            except ValueError:
                raise ConversionError("unsupported_format") from None
        else:
            # 无扩展名/Content-Type 的普通文本不能可靠区分 TXT/CSV，不盲猜。
            raise ConversionError("unsupported_format")
    if extension in IMAGE_FORMATS:
        return extension, None
    if extension not in TEXT_FORMATS:
        raise ConversionError("unsupported_format")
    text = decode_text(data, charset)
    return extension, text
