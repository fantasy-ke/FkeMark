"""为 macOS Intel 构建支持 10.15 的 OCR 原生库，避免 wheel 内的 macOS 12 动态库。"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

from package_component import download_verified

LEPTONICA = (
    "https://codeload.github.com/DanBloomberg/leptonica/tar.gz/refs/tags/1.84.1",
    "ecd7a868403b3963c4e33623595d77f2c87667e2cfdd9b370f87729192061bef",
)
TESSERACT = (
    "https://codeload.github.com/tesseract-ocr/tesseract/tar.gz/refs/tags/5.3.4",
    "141afc12b34a14bb691a939b4b122db0d51bd38feda7f41696822bacea7710c7",
)
TESSEROCR = (
    "https://files.pythonhosted.org/packages/1c/26/21e95383b4316773dab9db892885e2eae74da05f14d520de7b66e5f9ddbb/tesserocr-2.7.1.tar.gz",
    "3744c5c8bbabf18172849c7731be00dc2e5e44f8c556d37c850e788794ae0af4",
)


def unpack(directory, name, source):
    archive_path = directory / f"{name}.tar.gz"
    archive_path.write_bytes(download_verified(*source, limit=16 * 1024 * 1024))
    with tarfile.open(archive_path) as archive:
        archive.extractall(directory, filter="data")
    return directory / name


def build(licenses):
    with tempfile.TemporaryDirectory(prefix="fkemark-ocr-") as temporary:
        root = Path(temporary)
        prefix = root / "install"
        pkgconfig = prefix / "lib" / "pkgconfig"
        env = dict(os.environ, MACOSX_DEPLOYMENT_TARGET="10.15", PKG_CONFIG_LIBDIR=str(pkgconfig))
        env.pop("PKG_CONFIG_PATH", None)

        def run(*args):
            subprocess.run(args, check=True, env=env)

        def install(source, *options):
            build_dir = root / f"build-{source.name}"
            run("cmake", "-S", source, "-B", build_dir, "-DCMAKE_BUILD_TYPE=Release",
                f"-DCMAKE_INSTALL_PREFIX={prefix}", "-DCMAKE_INSTALL_LIBDIR=lib",
                "-DCMAKE_OSX_DEPLOYMENT_TARGET=10.15", "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",
                "-DBUILD_SHARED_LIBS=OFF", "-DCMAKE_POSITION_INDEPENDENT_CODE=ON", *options)
            run("cmake", "--build", build_dir, "--config", "Release", "--parallel", "4")
            run("cmake", "--install", build_dir, "--config", "Release")

        leptonica = unpack(root, "leptonica-1.84.1", LEPTONICA)
        tesseract = unpack(root, "tesseract-5.3.4", TESSERACT)
        # Pillow 解码图片，仅传入像素；不链接最低版本不受控的 Homebrew 编解码库。
        install(leptonica, *(f"-DENABLE_{codec}=OFF" for codec in (
            "ZLIB", "PNG", "GIF", "JPEG", "TIFF", "WEBP", "OPENJPEG")))
        shutil.copyfile(pkgconfig / "lept_Release.pc", pkgconfig / "lept.pc")
        # 调试图像的内置字体依赖 TIFF，纯文本识别不需要这些字体。
        install(tesseract, f"-DLeptonica_DIR={prefix / 'lib/cmake/leptonica'}", "-DBUILD_TRAINING_TOOLS=OFF",
                "-DCMAKE_CXX_FLAGS=-DTESSERACT_DISABLE_DEBUG_FONTS", "-DDISABLE_CURL=ON",
                "-DDISABLE_TIFF=ON", "-DDISABLE_ARCHIVE=ON", "-DINSTALL_CONFIGS=OFF")
        binding = root / "tesserocr-2.7.1.tar.gz"
        binding.write_bytes(download_verified(*TESSEROCR))
        pip = (sys.executable, "-I", "-m", "pip", "install", "--disable-pip-version-check")
        run(*pip, "--only-binary=:all:", "Cython==3.0.12")
        run(*pip, "--no-deps", "--no-build-isolation", "--force-reinstall", binding)
        shutil.copyfile(tesseract / "LICENSE", licenses / "Tesseract-LICENSE")
        shutil.copyfile(leptonica / "leptonica-license.txt", licenses / "Leptonica-LICENSE")


if __name__ == "__main__":
    build(Path(sys.argv[1]))
