"""从 PDF 字形推断标题，仅补充官方转换输出中的独立文本行。"""
from collections import Counter
import re

import pdfplumber


# 不改写公式、列表、已有标题或可能属于表格、代码的行。
PLAIN_START = re.compile(r"^(?:[^\W\d_]|\d+(?:\.\d+)*\s+[^\W\d_])")
MARKDOWN_PUNCTUATION = re.compile(r"([\\`*_\[\]<>#&~])")


def line_key(text):
    return " ".join(text.split())


def add_pdf_headings(stream, markdown):
    lines = markdown.splitlines(keepends=True)
    counts = Counter(line_key(line) for line in lines)
    sizes = Counter()
    candidates = {}
    seen = set()
    stream.seek(0)
    try:
        with pdfplumber.open(stream) as pdf:
            for page in pdf.pages:
                for line in page.extract_text_lines():
                    glyph_sizes = Counter(round(char["size"] * 2) / 2 for char in line["chars"]
                                          if char["upright"] and char["text"].strip())
                    sizes.update(glyph_sizes)
                    key = line_key(line["text"])
                    if counts[key] != 1 or not (2 <= len(key) <= 100) or not PLAIN_START.match(key):
                        continue
                    if key in seen:
                        candidates.pop(key, None)
                        continue
                    seen.add(key)
                    if len(glyph_sizes) == 1 and not key.endswith((".", "。", ";", "；", ",", "，")) and "|" not in key:
                        candidates[key] = next(iter(glyph_sizes))
                page.close()
    except Exception:
        # 官方转换已经成功；无法获取可靠字形时不改写原结果。
        return markdown

    if not candidates or not sizes:
        return markdown
    body_size = min(sizes, key=lambda size: (-sizes[size], size))
    heading_sizes = sorted({size for size in candidates.values() if size >= max(body_size + 2, body_size * 1.2)}, reverse=True)
    levels = {size: min(index, 6) for index, size in enumerate(heading_sizes, start=1)}
    for index, line in enumerate(lines):
        if line.startswith(("    ", "\t")):
            continue
        level = levels.get(candidates.get(line_key(line)))
        if level:
            text = line.rstrip("\r\n\f")
            heading = MARKDOWN_PUNCTUATION.sub(r"\\\1", text.strip())
            lines[index] = f"{'#' * level} {heading}{line[len(text):]}"
    return "".join(lines)
