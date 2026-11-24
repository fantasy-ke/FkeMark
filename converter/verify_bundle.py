"""验证 onedir 的完整性、架构和 macOS 最低版本，输出可审计构建清单。"""
from importlib import metadata
import json
from pathlib import Path
import platform
import shutil
import struct
import sys


def macho_versions(path):
    data = path.read_bytes()
    slices = [(0, len(data))]
    if data[:4] in (b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf"):
        wide = data[:4] == b"\xca\xfe\xba\xbf"
        count = struct.unpack_from(">I", data, 4)[0]
        slices = []
        for index in range(count):
            offset = 8 + index * (32 if wide else 20)
            start, size = struct.unpack_from(">QQ" if wide else ">II", data, offset + 8)
            slices.append((start, size))
    versions = []
    for start, _ in slices:
        magic = data[start:start + 4]
        if magic not in (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xce"):
            continue
        endian = "<" if magic[:1] in (b"\xcf", b"\xce") else ">"
        cpu, _, _, count = struct.unpack_from(endian + "IIII", data, start + 4)
        offset = start + (32 if magic in (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf") else 28)
        for _ in range(count):
            command, size = struct.unpack_from(endian + "II", data, offset)
            if command in (0x24, 0x32):
                version = struct.unpack_from(endian + "I", data, offset + (12 if command == 0x32 else 8))[0]
                versions.append((cpu, (version >> 16, (version >> 8) & 255, version & 255)))
            if size < 8:
                raise RuntimeError("无效的 Mach-O 载入命令")
            offset += size
    return versions


def verify_bundle(directory):
    directory = Path(directory).resolve()
    executable = directory / ("document-converter.exe" if sys.platform == "win32" else "document-converter")
    if not executable.is_file() or not (directory / "_internal").is_dir():
        raise RuntimeError("转换器 onedir 目录不完整")
    files = [path for path in directory.rglob("*") if path.is_file()]
    for path in files:
        relative = path.relative_to(directory).as_posix().lower()
        if any(part in relative for part in ("onnxruntime", "magika", ".onnx")):
            raise RuntimeError("冻结产物不允许包含 ONNX 或 Magika 自动识别资源")
    minimum = None
    if sys.platform == "darwin":
        is_intel = platform.machine() == "x86_64"
        cpu = 0x01000007 if is_intel else 0x0100000C
        allowed = (10, 15, 0) if is_intel else (11, 0, 0)
        minimum = (0, 0, 0)
        for path in files:
            with path.open("rb") as binary:
                magic = binary.read(4)
            if magic not in (b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf", b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xce"):
                continue
            for file_cpu, version in macho_versions(path):
                if file_cpu == cpu:
                    minimum = max(minimum, version)
                    if version > allowed:
                        raise RuntimeError(f"{path.relative_to(directory)} 要求 macOS {version}，不能保留现有最低版本 {allowed}")
    license_dir = directory / "licenses"
    license_dir.mkdir(exist_ok=True)
    runtime = json.loads((Path(__file__).parent / "runtime-distributions.json").read_text(encoding="utf-8"))
    versions = {}
    for name in runtime:
        distribution = metadata.distribution(name)
        versions[name] = distribution.version
        package_license = license_dir / name
        for item in distribution.files or []:
            lowered = str(item).lower()
            if any(word in Path(lowered).name for word in ("license", "copying", "notice", "copyright")):
                source = Path(distribution.locate_file(item))
                if source.is_file():
                    package_license.mkdir(exist_ok=True)
                    shutil.copy2(source, package_license / (str(item).replace("/", "_").replace("\\", "_")))
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if not python_license.exists():
        python_license = Path(sys.base_prefix) / "lib" / "python3.12" / "LICENSE.txt"
    if python_license.exists():
        shutil.copy2(python_license, license_dir / "Python-LICENSE.txt")
    else:
        raise RuntimeError("未找到 Python 运行时许可证，拒绝分发不完整目录")
    manifest = {
        "protocolVersion": 1, "python": platform.python_version(), "platform": sys.platform,
        "architecture": platform.machine(), "minimumMacOS": minimum,
        "packages": versions,
        "bytes": sum(path.stat().st_size for path in directory.rglob("*") if path.is_file()),
    }
    (directory / "bundle-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已验证完整转换器目录，体积 {manifest['bytes'] / 1024 / 1024:.1f} MiB")
    return manifest


if __name__ == "__main__":
    verify_bundle(sys.argv[1])
