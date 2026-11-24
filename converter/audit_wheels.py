"""查看官方二进制包支持 macOS 10.15 / Python 3.12 的最新稳定 wheel。"""
import json
import urllib.request
from packaging.version import Version
from packaging.utils import parse_wheel_filename

for name in ("pandas", "numpy", "Pillow", "cryptography", "pypdfium2", "lxml", "cffi", "charset-normalizer"):
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/json", timeout=30) as response:
        data = json.load(response)
    for version in sorted(data["releases"], key=Version, reverse=True):
        if Version(version).is_prerelease:
            continue
        candidates = []
        for item in data["releases"][version]:
            filename = item["filename"]
            if not filename.endswith(".whl") or item["yanked"]:
                continue
            tags = parse_wheel_filename(filename)[3]
            for tag in tags:
                parts = tag.platform.split("_")
                if len(parts) < 4 or parts[0] != "macosx":
                    continue
                if tuple(map(int, parts[1:3])) > (10, 15):
                    continue
                if tag.platform.endswith("arm64"):
                    continue
                if tag.interpreter in ("py3", "cp312") or (tag.abi == "abi3" and tag.interpreter.startswith("cp3") and int(tag.interpreter[3:]) <= 12):
                    candidates.append(filename)
                    break
        if candidates:
            print(name, version, ", ".join(candidates))
            break
