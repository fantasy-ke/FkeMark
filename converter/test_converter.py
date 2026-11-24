"""公开 JSON 协议、真实格式、离线边界及资源上限的回归测试。"""
import codecs
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from stage_official import stage_official
from sample_documents import generate_samples, zip_bytes

stage_official()
from document_converter import convert_request
import input_policy

ROOT = Path(__file__).resolve().parent


class ConverterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="fkemark-converter-tests-")
        cls.directory = Path(cls.temporary.name)
        cls.samples = generate_samples(cls.directory)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def request(self, extension=".txt", **metadata):
        return {"protocolVersion": 1, "path": str(self.samples[extension]), "extension": extension, **metadata}

    def custom(self, data, extension=".txt", **metadata):
        path = self.directory / "custom.snapshot"
        path.write_bytes(data)
        return {"protocolVersion": 1, "path": str(path), "extension": extension, **metadata}

    def assert_error(self, request, code):
        self.assertEqual(convert_request(request), {"protocolVersion": 1, "error": code})

    def test_all_real_formats_without_network(self):
        with patch("socket.socket.connect", side_effect=AssertionError("禁止网络")):
            for extension in input_policy.SUPPORTED:
                with self.subTest(extension=extension):
                    request = self.request(extension)
                    before = hashlib.sha256(Path(request["path"]).read_bytes()).digest()
                    result = convert_request(request)
                    self.assertNotIn("error", result, result)
                    self.assertIn("Converter smoke sample", result["markdown"])
                    self.assertEqual(before, hashlib.sha256(Path(request["path"]).read_bytes()).digest())
        self.assertNotIn("markitdown", sys.modules)
        self.assertNotIn("magika", sys.modules)
        self.assertNotIn("onnxruntime", sys.modules)

    def test_url_stream_context_and_relative_assets(self):
        result = convert_request(self.request(".html", url="https://example.org/final/page.html", contentType="text/html; charset=UTF-8", filename="original.html"))
        self.assertEqual(result["title"], "样本标题")
        self.assertIn("https://example.org/target", result["markdown"])
        self.assertIn("https://example.org/image.png", result["markdown"])

    def test_html_safe_images_and_unsafe_links(self):
        body = b'<html><body><a href="javascript:alert(1)">danger</a><a href="file:///secret">local</a><img src="data:image/png;base64,aGVsbG8="/><img src="blob:https://example.org/id"/><img src="https://example.org/image.png"/><img src="javascript:alert(1)"/></body></html>'
        result = convert_request(self.custom(body, ".html", url="https://example.org/page"))
        markdown = result["markdown"]
        self.assertIn("data:image/png;base64,aGVsbG8=", markdown)
        self.assertIn("blob:https://example.org/id", markdown)
        self.assertNotIn("javascript:", markdown)
        self.assertNotIn("file:///", markdown)

    def test_remote_unknown_extension_uses_signatures(self):
        for extension in (".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".epub", ".html", ".json", ".xml"):
            with self.subTest(extension=extension):
                request = self.request(extension, url="https://example.org/download")
                request["extension"] = ""
                self.assertNotIn("error", convert_request(request))

    def test_remote_unknown_extension_uses_content_type(self):
        for extension, content_type in ((".txt", "text/plain"), (".csv", "text/csv")):
            request = self.request(extension, url="https://example.org/download", contentType=content_type)
            request["extension"] = ""
            self.assertNotIn("error", convert_request(request))

    def test_content_type_does_not_override_file_signature(self):
        request = self.request(".pdf", contentType="text/plain")
        request["extension"] = ""
        self.assertIn("Converter smoke sample", convert_request(request)["markdown"])

    def test_invalid_input(self):
        cases = [None, [], {}, {**self.request(), "protocolVersion": True}, {**self.request(), "protocolVersion": 2}, {**self.request(), "path": "relative.txt"}, {**self.request(), "extension": None}, {**self.request(), "filename": "bad\nname"}]
        for request in cases:
            self.assert_error(request, "invalid_input")

    def test_unsupported_extensions(self):
        for extension in (".zip", ".exe", ".docm", ".mp3", ".png", ".md"):
            self.assert_error({**self.request(), "extension": extension}, "unsupported_format")

    def test_invalid_urls(self):
        for url in ("javascript:alert(1)", "file:///tmp/file", "https://user:password@example.org/", "https://", "https://example.org:invalid/"):
            self.assert_error(self.request(url=url), "invalid_url")

    def test_read_failure(self):
        self.assert_error({**self.request(), "path": str(self.directory / "missing")}, "file_read_failed")
        self.assert_error({**self.request(), "path": str(self.directory)}, "file_read_failed")

    def test_corrupt_binary_no_text_fallback(self):
        for extension in (".pdf", ".docx", ".pptx", ".xlsx", ".epub", ".xls", ".txt", ""):
            self.assert_error(self.custom(b"\xff\x00\x01garbage", extension), "conversion_failed")
        self.assert_error(self.custom(b"%PDF-1.4\ninvalid", ""), "conversion_failed")

    def test_format_mismatch(self):
        self.assert_error({**self.request(".pdf"), "extension": ".txt"}, "conversion_failed")

    def test_plain_unknown_file_not_blindly_guessed(self):
        self.assert_error(self.custom(b"arbitrary words", ""), "unsupported_format")

    def test_text_preserved_without_markdown_roundtrip(self):
        text = "**中文**\n\n\n```txt\n[[链接]]  两个空格  \n```\n"
        self.assertEqual(convert_request(self.custom(text.encode()))["markdown"], text)

    def test_text_pk_prefix_is_not_a_zip_signature(self):
        self.assertEqual(convert_request(self.custom(b"PK is a text prefix"))["markdown"], "PK is a text prefix")

    def test_bom_and_declared_charset(self):
        self.assertEqual(convert_request(self.custom(codecs.BOM_UTF16_LE + "中文".encode("utf-16-le")))["markdown"], "中文")
        self.assertEqual(convert_request(self.custom("中文".encode("gb18030"), contentType="text/plain; charset=gb18030"))["markdown"], "中文")
        self.assert_error(self.custom(b"text", contentType="text/plain; charset=does-not-exist"), "conversion_failed")

    def test_empty_result(self):
        self.assert_error(self.custom(b"  \n\t"), "empty_result")
        self.assert_error(self.custom(b"<html><body></body></html>", ".html"), "empty_result")

    def test_input_and_output_limits(self):
        with patch.object(input_policy, "MAX_INPUT_BYTES", 2):
            self.assert_error(self.request(), "input_too_large")
        with patch("document_converter.MAX_OUTPUT_BYTES", 3):
            self.assert_error(self.custom("中文".encode()), "output_too_large")

    def test_zip_limits_and_arbitrary_archive(self):
        archive = zip_bytes({"one.txt": "text", "two.txt": "text"})
        self.assert_error(self.custom(archive, ""), "unsupported_format")
        with patch.object(input_policy, "MAX_ZIP_ENTRIES", 1):
            self.assert_error(self.custom(archive, ""), "input_too_large")
        with patch.object(input_policy, "MAX_ZIP_BYTES", 3):
            self.assert_error(self.custom(archive, ""), "input_too_large")

    def test_zip_traversal_macros_and_entities_rejected(self):
        for entries, code in (({"../one.txt": "x"}, "conversion_failed"), ({"word/vbaProject.bin": "x"}, "unsupported_format"), ({"word/document.xml": '<!DOCTYPE x [<!ENTITY bad "x">]><x/>'}, "unsupported_format")):
            self.assert_error(self.custom(zip_bytes(entries), ""), code)

    def test_utf16_entities_rejected_in_office_archive(self):
        xml = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE x [<!ENTITY bad "x">]><x/>'
        self.assert_error(self.custom(zip_bytes({"word/document.xml": xml.encode("utf-16")}), ""), "unsupported_format")

    def test_epub_xhtml_doctype_is_not_a_macro_or_xml_entity(self):
        from sample_documents import epub_bytes
        import zipfile
        with zipfile.ZipFile(io.BytesIO(epub_bytes())) as archive:
            entries = {name: archive.read(name) for name in archive.namelist()}
        entries["OEBPS/chapter.xhtml"] = b'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">' + entries["OEBPS/chapter.xhtml"]
        result = convert_request(self.custom(zip_bytes(entries), ".epub"))
        self.assertIn("Converter smoke sample", result["markdown"])

    def test_single_utf8_json_cli_no_logs(self):
        request = self.request(".html", url="https://example.org/private?token=not-logged")
        completed = subprocess.run([sys.executable, str(ROOT / "document_converter.py")], input=json.dumps(request).encode(), capture_output=True, check=True, timeout=30)
        result = json.loads(completed.stdout.decode("utf-8"))
        self.assertEqual(result["title"], "样本标题")
        self.assertEqual(completed.stderr, b"")
        failed = subprocess.run([sys.executable, str(ROOT / "document_converter.py")], input=b"{}\n{}", capture_output=True, check=True, timeout=30)
        self.assertEqual(json.loads(failed.stdout), {"protocolVersion": 1, "error": "invalid_input"})
        self.assertEqual(failed.stderr, b"")

    def test_macho_minimum_version_parser(self):
        import struct
        from verify_bundle import macho_versions
        binary = self.directory / "minimum-version.dylib"
        header = struct.pack("<IIIIIIII", 0xFEEDFACF, 0x01000007, 3, 6, 1, 24, 0, 0)
        command = struct.pack("<IIIIII", 0x32, 24, 1, (10 << 16) | (15 << 8), 0, 0)
        binary.write_bytes(header + command)
        self.assertEqual(macho_versions(binary), [(0x01000007, (10, 15, 0))])

    def test_request_byte_limit(self):
        completed = subprocess.run([sys.executable, str(ROOT / "document_converter.py")], input=b" " * (input_policy.MAX_REQUEST_BYTES + 1), capture_output=True, check=True, timeout=30)
        self.assertEqual(json.loads(completed.stdout), {"protocolVersion": 1, "error": "invalid_input"})


if __name__ == "__main__":
    unittest.main()
