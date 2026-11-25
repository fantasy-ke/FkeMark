"""生成小型真实格式样本，源码测试和冻结测试共用，不下载外部文件。"""
import io
from pathlib import Path
import zipfile


def zip_bytes(entries):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return stream.getvalue()


def pdf_bytes():
    content = b"BT /F1 18 Tf 72 720 Td (Converter smoke sample) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
    ]
    result = b"%PDF-1.4\n"
    offsets = [0]
    for index, item in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{index} 0 obj\n".encode() + item + b"\nendobj\n"
    xref = len(result)
    result += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        result += f"{offset:010d} 00000 n \n".encode()
    return result + f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()


def docx_bytes():
    return zip_bytes({
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Converter smoke sample 中文</w:t></w:r></w:p></w:body></w:document>',
    })


def epub_bytes():
    return zip_bytes({
        "mimetype": "application/epub+zip",
        "META-INF/container.xml": '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        "OEBPS/content.opf": '<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><metadata><dc:title>样本书籍</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
        "OEBPS/chapter.xhtml": '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Converter smoke sample</h1><p>中文书籍</p></body></html>',
    })


def image_bytes(image_format):
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (780, 150), "white")
    ImageDraw.Draw(image).text((40, 45), "Converter  smoke  sample", fill="black", font_size=48)
    stream = io.BytesIO()
    image.save(stream, format=image_format)
    return stream.getvalue()


def generate_samples(directory):
    from openpyxl import Workbook
    from pptx import Presentation
    import xlwt

    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    samples = {
        ".pdf": pdf_bytes(), ".docx": docx_bytes(), ".epub": epub_bytes(),
        ".html": '<html><head><title>样本标题</title></head><body><h1>Converter smoke sample</h1><a href="../target">目标</a><img src="../image.png" alt="图片"/></body></html>'.encode(),
        ".htm": b"<html><body><p>Converter smoke sample</p></body></html>",
        ".txt": "Converter smoke sample 中文\n\n**保持原文**".encode(),
        ".csv": "name,value\nConverter smoke sample,中文".encode(),
        ".json": '{"sample":"Converter smoke sample","value":"中文"}'.encode(),
        ".xml": '<?xml version="1.0"?><sample>Converter smoke sample 中文</sample>'.encode(),
        ".png": image_bytes("PNG"), ".jpg": image_bytes("JPEG"),
        ".jpeg": image_bytes("JPEG"), ".webp": image_bytes("WEBP"),
    }
    for extension, data in samples.items():
        (directory / ("sample" + extension)).write_bytes(data)
    workbook = Workbook()
    workbook.active.append(["name", "value"])
    workbook.active.append(["Converter smoke sample", "中文"])
    workbook.save(directory / "sample.xlsx")
    workbook.close()
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[1])
    slide.shapes.title.text = "Converter smoke sample"
    slide.placeholders[1].text = "中文幻灯片"
    presentation.save(directory / "sample.pptx")
    legacy = xlwt.Workbook()
    sheet = legacy.add_sheet("样本")
    sheet.write(0, 0, "name")
    sheet.write(1, 0, "Converter smoke sample")
    legacy.save(str(directory / "sample.xls"))
    return {path.suffix: path for path in directory.iterdir()}
