"""只运行已冻结的可执行文件，真实格式样本位于独立临时目录。"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from sample_documents import generate_samples, heading_pdf_bytes


def smoke_test(executable):
    executable = Path(executable).resolve()
    with tempfile.TemporaryDirectory(prefix="fkemark-frozen-smoke-") as temporary:
        samples = generate_samples(Path(temporary) / "samples")
        samples[".pdf"].write_bytes(heading_pdf_bytes())
        for extension, sample in sorted(samples.items()):
            before = hashlib.sha256(sample.read_bytes()).digest()
            request = {"protocolVersion": 1, "path": str(sample), "extension": extension}
            if extension in (".html", ".htm"):
                request.update(url="https://example.org/final/page", contentType="text/html; charset=utf-8")
                request["extension"] = ""
            completed = subprocess.run([str(executable)], input=json.dumps(request).encode("utf-8"), capture_output=True, timeout=45, check=True, cwd=temporary)
            result = json.loads(completed.stdout.decode("utf-8"))
            if completed.stderr or "error" in result or "Converter smoke sample" not in " ".join(result.get("markdown", "").split()):
                raise RuntimeError(f"冻结格式烟雾测试失败：{extension}，协议={result.get('error')}")
            if before != hashlib.sha256(sample.read_bytes()).digest():
                raise RuntimeError("转换器修改了输入快照")
            if extension == ".html" and "https://example.org/target" not in result["markdown"]:
                raise RuntimeError("冻结转换器没有使用最终 URL 解析相对链接")
            if extension == ".pdf" and [line for line in result["markdown"].splitlines() if line.startswith("#")] != ["# Converter smoke sample", "## Background"]:
                raise RuntimeError("冻结转换器没有保留 PDF 标题层级")
            print(f"冻结转换器烟雾测试通过：{extension}")
        completed = subprocess.run([str(executable)], input=b"{}", capture_output=True, timeout=30, check=True, cwd=temporary)
        if completed.stderr or json.loads(completed.stdout) != {"protocolVersion": 1, "error": "invalid_input"}:
            raise RuntimeError("冻结转换器错误协议不正确")


if __name__ == "__main__":
    smoke_test(sys.argv[1])
