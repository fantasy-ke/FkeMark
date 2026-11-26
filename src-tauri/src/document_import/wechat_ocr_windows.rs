use super::super::{component, process, ConversionRequest, ImportedDocument};
use image::codecs::{jpeg::JpegDecoder, png::PngDecoder, webp::WebPDecoder};
use image::{DynamicImage, ImageDecoder, ImageError, ImageFormat, Limits};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::sync::Semaphore;

const BRIDGE_NAME: &str = "wechat-ocr-bridge.exe";
const BRIDGE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/wechat-ocr-bridge.exe"));
const MOJO_ALIAS: &str = "wco_data/mmmojo.dll";
const INSTALL_FAILED: &str = "wechat_ocr_install_failed";
const NETWORK_FAILED: &str = "wechat_ocr_network_failed";
static INSTALL_PERMIT: Semaphore = Semaphore::const_new(1);

struct Package {
    id: &'static str,
    version: &'static str,
    size: u64,
    sha256: &'static str,
    entries: &'static [&'static str],
}

// STranslate 使用的上游包及 .NET Framework 4.7.2 依赖。锁定长度、哈希及解包白名单。
const PACKAGES: &[Package] = &[
    Package {
        id: "wechatocr",
        version: "1.0.5",
        size: 141_677_472,
        sha256: "21a608b07f3ad8b5a7604dc1905f3af9b443cc23c3b064d9997f599c24117c4f",
        entries: &[
            "lib/net472/WeChatOcr.dll",
            "content/wco_data/mmmojo_64.dll",
            "content/wco_data/Model/FPOCRRecog.xnet",
            "content/wco_data/Model/OCRDetFP32.xnet.nas",
            "content/wco_data/Model/OCRParaDetV1.1.0.26.xnet",
            "content/wco_data/Model/OCRRecogFP32V1.1.0.26.xnet",
            "content/wco_data/Model/RecDict",
            "content/wco_data/Model/sohu_simp.txt",
            "content/wco_data/WeChatOCR.exe",
            "content/wco_data/x64.config",
        ],
    },
    Package {
        id: "google.protobuf",
        version: "3.29.3",
        size: 1_385_514,
        sha256: "a686311602ef57716a22f9d104f76640d2c7b586aa4aa7bcf0d4a3727141c320",
        entries: &["lib/net45/Google.Protobuf.dll"],
    },
    Package {
        id: "newtonsoft.json",
        version: "13.0.3",
        size: 2_441_966,
        sha256: "872fc189e638ab1056555b03aaa38f68bcb54286e221aa646eb1129babf63c77",
        entries: &["lib/net45/Newtonsoft.Json.dll"],
    },
    Package {
        id: "system.memory",
        version: "4.5.3",
        size: 154_054,
        sha256: "0af97b45b45b46ef6a2b37910568dabd492c793da3859054595d523e2a545859",
        entries: &["lib/netstandard2.0/System.Memory.dll"],
    },
    Package {
        id: "system.buffers",
        version: "4.4.0",
        size: 78_363,
        sha256: "293c408586b0146d95e555f58f0de9cf1dc8ad05d1827d53b2f8233e0c406ea0",
        entries: &["lib/netstandard2.0/System.Buffers.dll"],
    },
    Package {
        id: "system.numerics.vectors",
        version: "4.4.0",
        size: 337_043,
        sha256: "6ae5d02b67e52ff2699c1feb11c01c526e2f60c09830432258e0809486aabb65",
        entries: &["lib/net46/System.Numerics.Vectors.dll"],
    },
    Package {
        id: "system.runtime.compilerservices.unsafe",
        version: "4.5.2",
        size: 104_723,
        sha256: "f1e5175c658ed8b2fbb804cc6727b6882a503844e7da309c8d4846e9ca11e4ef",
        entries: &["lib/netstandard2.0/System.Runtime.CompilerServices.Unsafe.dll"],
    },
];

fn installed_name(entry: &str) -> &str {
    entry
        .strip_prefix("content/")
        .unwrap_or_else(|| entry.rsplit('/').next().unwrap())
}

fn required_files() -> impl Iterator<Item = &'static str> {
    std::iter::once(MOJO_ALIAS).chain(
        PACKAGES
            .iter()
            .flat_map(|package| package.entries.iter().map(|entry| installed_name(entry))),
    )
}

fn complete(directory: &Path) -> bool {
    required_files().all(|file| directory.join(file).is_file())
}

fn refresh_bridge(directory: &Path) -> std::io::Result<PathBuf> {
    let bridge = directory.join(BRIDGE_NAME);
    if let Ok(mut file) = File::open(&bridge) {
        let mut existing = [0; BRIDGE.len()];
        if file.metadata()?.len() == BRIDGE.len() as u64
            && file.read_exact(&mut existing).is_ok()
            && existing == BRIDGE
        {
            return Ok(bridge);
        }
    }
    let mut staging = tempfile::NamedTempFile::new_in(directory)?;
    staging.write_all(BRIDGE)?;
    staging.persist(&bridge)?;
    Ok(bridge)
}

fn install_path(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    Ok(component::components_dir(app)?.join("wechat-ocr-1.0.5-p1"))
}

pub(in crate::document_import) fn installed(app: &tauri::AppHandle) -> Option<PathBuf> {
    let directory = install_path(app).ok()?;
    complete(&directory).then_some(directory)
}

pub(super) async fn install(app: &tauri::AppHandle) -> Result<(), &'static str> {
    let _permit = INSTALL_PERMIT
        .try_acquire()
        .map_err(|_| "wechat_ocr_install_busy")?;
    install_to(&install_path(app)?).await
}

async fn install_to(destination: &Path) -> Result<(), &'static str> {
    if complete(destination) {
        return Ok(());
    }
    let parent = destination.parent().ok_or(INSTALL_FAILED)?;
    fs::create_dir_all(parent).map_err(|_| INSTALL_FAILED)?;
    let staging = tempfile::tempdir_in(parent).map_err(|_| INSTALL_FAILED)?;
    let payload = staging.path().join("payload");
    fs::create_dir(&payload).map_err(|_| INSTALL_FAILED)?;
    let bridge = refresh_bridge(&payload).map_err(|_| INSTALL_FAILED)?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("FkeMark/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|_| NETWORK_FAILED)?;
    let archive = staging.path().join("download.nupkg");
    for package in PACKAGES {
        let Package {
            id,
            version,
            size,
            sha256,
            entries,
        } = package;
        let response = client
            .get(format!(
                "https://api.nuget.org/v3-flatcontainer/{id}/{version}/{id}.{version}.nupkg"
            ))
            .send()
            .await
            .map_err(|_| NETWORK_FAILED)?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(NETWORK_FAILED);
        }
        component::save_verified(response, *size, sha256, &archive)
            .await
            .map_err(|error| match error {
                "component_network_failed" => NETWORK_FAILED,
                "component_install_failed" => INSTALL_FAILED,
                _ => error,
            })?;
        let files: Vec<_> = entries
            .iter()
            .map(|entry| (*entry, installed_name(entry)))
            .collect();
        let request = serde_json::to_vec(&serde_json::json!({ "path": archive, "files": files }))
            .map_err(|_| INSTALL_FAILED)?;
        let (status, _) = process::execute_ocr(&bridge, &request)
            .await
            .map_err(|_| INSTALL_FAILED)?;
        if !status.success() {
            return Err(INSTALL_FAILED);
        }
    }
    // .NET Framework 预加载 mmmojo_64.dll，但 P/Invoke 仍以 mmmojo 为名查找。
    fs::copy(
        payload.join("wco_data/mmmojo_64.dll"),
        payload.join(MOJO_ALIAS),
    )
    .map_err(|_| INSTALL_FAILED)?;
    if !complete(&payload) {
        return Err(INSTALL_FAILED);
    }
    // 下载失败不覆盖现有组件；重装时只替换缺失文件的旧目录。
    if complete(destination) {
        return Ok(());
    }
    if destination.exists() {
        fs::rename(destination, staging.path().join("incomplete")).map_err(|_| INSTALL_FAILED)?;
    }
    fs::rename(&payload, destination).map_err(|_| INSTALL_FAILED)?;
    Ok(())
}

pub(in crate::document_import) async fn image_format(
    request: &ConversionRequest,
) -> Option<ImageFormat> {
    Some(match request.extension.as_str() {
        ".png" => ImageFormat::Png,
        ".jpg" | ".jpeg" => ImageFormat::Jpeg,
        ".webp" => ImageFormat::WebP,
        "" => {
            let mime = request.content_type.as_deref()?.split(';').next()?.trim();
            let format = if mime.eq_ignore_ascii_case("image/png") {
                ImageFormat::Png
            } else if mime.eq_ignore_ascii_case("image/jpeg") {
                ImageFormat::Jpeg
            } else if mime.eq_ignore_ascii_case("image/webp") {
                ImageFormat::WebP
            } else {
                return None;
            };
            // 无扩展名时不能只相信 HTTP 类型，否则会抢占转换器的文档签名识别。
            let mut signature = [0; 12];
            tokio::fs::File::open(&request.path)
                .await
                .ok()?
                .read_exact(&mut signature)
                .await
                .ok()?;
            if image::guess_format(&signature).ok()? != format {
                return None;
            }
            format
        }
        _ => return None,
    })
}

fn decode_error(error: ImageError) -> &'static str {
    match error {
        ImageError::Limits(_) => "input_too_large",
        _ => "conversion_failed",
    }
}

fn decode(mut decoder: impl ImageDecoder) -> Result<DynamicImage, &'static str> {
    let (width, height) = decoder.dimensions();
    if width.max(height) > 8192 || u64::from(width) * u64::from(height) > 20_000_000 {
        return Err("input_too_large");
    }
    let orientation = decoder.orientation().map_err(decode_error)?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(decode_error)?;
    image.apply_orientation(orientation);
    Ok(image)
}

fn normalize(source: &Path, target: &Path, format: ImageFormat) -> Result<(), &'static str> {
    let reader = BufReader::new(File::open(source).map_err(|_| "file_read_failed")?);
    let image = match format {
        ImageFormat::Png => {
            let mut limits = Limits::default();
            limits.max_image_width = Some(8192);
            limits.max_image_height = Some(8192);
            let decoder = PngDecoder::with_limits(reader, limits).map_err(decode_error)?;
            if decoder.is_apng().map_err(decode_error)? {
                return Err("unsupported_format");
            }
            decode(decoder)?
        }
        ImageFormat::Jpeg => decode(JpegDecoder::new(reader).map_err(decode_error)?)?,
        ImageFormat::WebP => {
            let decoder = WebPDecoder::new(reader).map_err(decode_error)?;
            if decoder.has_animation() {
                return Err("unsupported_format");
            }
            decode(decoder)?
        }
        _ => return Err("unsupported_format"),
    };
    let image = if image.color().has_alpha() {
        let mut pixels = image.into_rgba8();
        for pixel in pixels.pixels_mut() {
            let alpha = u32::from(pixel[3]);
            for channel in &mut pixel.0[..3] {
                *channel = ((u32::from(*channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
            }
            pixel[3] = 255;
        }
        DynamicImage::ImageRgba8(pixels)
    } else {
        DynamicImage::ImageRgb8(image.into_rgb8())
    };
    let mut output = BufWriter::new(File::create(target).map_err(|_| "file_read_failed")?);
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(decode_error)?;
    output.flush().map_err(|_| "file_read_failed")
}

pub(in crate::document_import) async fn run(
    directory: &Path,
    request: &ConversionRequest,
    format: ImageFormat,
) -> Result<ImportedDocument, String> {
    let snapshot = PathBuf::from(&request.path);
    let normalized = snapshot.with_file_name("ocr.png");
    let data = serde_json::to_vec(&serde_json::json!({ "path": normalized }))
        .map_err(|_| "invalid_input")?;
    let component = directory.to_path_buf();
    let bridge = tokio::task::spawn_blocking(move || {
        normalize(&snapshot, &normalized, format)?;
        refresh_bridge(&component).map_err(|_| "wechat_ocr_failed")
    })
    .await
    .map_err(|_| "conversion_failed")??;
    let (status, output) =
        process::execute_ocr(&bridge, &data)
            .await
            .map_err(|error| match error.as_str() {
                "converter_missing" | "conversion_failed" => "wechat_ocr_failed".into(),
                _ => error,
            })?;
    process::parse_response(&output, status.success(), &request.filename).map_err(|error| {
        if error == "conversion_failed" {
            "wechat_ocr_failed".into()
        } else {
            error
        }
    })
}

#[cfg(test)]
#[path = "wechat_ocr_tests.rs"]
mod tests;
