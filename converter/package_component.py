"""准备固定的 OCR 数据，并打包已通过烟雾测试的原生组件。"""
import hashlib
from pathlib import Path
import sys
import tarfile
from urllib.request import urlopen

MODEL_ROOT = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/"
MODELS = {
    "eng.traineddata": "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
    "chi_sim.traineddata": "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730",
    "LICENSE": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
}


def download_verified(url, sha256, limit=8 * 1024 * 1024):
    with urlopen(url, timeout=30) as response:
        content = response.read(limit + 1)
    if len(content) > limit or hashlib.sha256(content).hexdigest() != sha256:
        raise RuntimeError(f"OCR 构建资源校验失败：{url}")
    return content


def prepare_models(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name, sha256 in MODELS.items():
        path = directory / name
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == sha256:
            continue
        path.write_bytes(download_verified(MODEL_ROOT + name, sha256))


def package(directory, archive):
    def filter_entry(entry):
        if not (entry.isfile() or entry.isdir() or entry.issym()):
            raise ValueError(f"不支持的组件归档条目：{entry.name}")
        entry.uid = entry.gid = 0
        entry.uname = entry.gname = ""
        return entry

    with tarfile.open(archive, "w:gz", compresslevel=6) as output:
        for path in sorted(directory.iterdir()):
            output.add(path, arcname=path.name, filter=filter_entry)
    print(f"已打包 {archive.name}（{archive.stat().st_size / 1024 / 1024:.1f} MiB）")


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    if command == "models":
        prepare_models(Path(args[0]))
    elif command == "package":
        package(*map(Path, args))
    else:
        raise ValueError(f"未知命令：{command}")
