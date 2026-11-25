"""使用组件内的 Tesseract 模型离线识别单张图片。"""
import io
from pathlib import Path
import sys

from input_policy import ConversionError


def recognize_image(data, image_format):
    from PIL import Image, ImageOps
    from tesserocr import OEM, PSM, PyTessBaseAPI

    with Image.open(io.BytesIO(data), formats=[image_format]) as image:
        if max(image.size) > 8192 or image.width * image.height > 20_000_000:
            raise ConversionError("input_too_large")
        if getattr(image, "is_animated", False):
            raise ConversionError("unsupported_format")
        image = ImageOps.exif_transpose(image)
        if "A" in image.getbands() or "transparency" in image.info:
            rgba = image.convert("RGBA")
            gray = Image.new("L", rgba.size, "white")
            gray.paste(rgba, mask=rgba.getchannel("A"))
        else:
            gray = image.convert("L")

    resources = Path(getattr(sys, "_MEIPASS", Path(__file__).parent / ".build"))
    pixels = gray.tobytes()
    with PyTessBaseAPI(path=str(resources / "tessdata"), lang="chi_sim+eng", oem=OEM.LSTM_ONLY, psm=PSM.AUTO) as engine:
        engine.SetImageBytes(pixels, gray.width, gray.height, 1, gray.width)
        engine.SetSourceResolution(300)
        return engine.GetUTF8Text().strip()
