mod network;
mod process;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Semaphore;

pub(super) const MAX_INPUT_BYTES: u64 = 50 * 1024 * 1024;
pub(super) const MAX_MARKDOWN_BYTES: usize = 5 * 1024 * 1024;
pub(super) const PROTOCOL_VERSION: u32 = 1;
static IMPORT_PERMIT: Semaphore = Semaphore::const_new(1);

#[derive(Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum DocumentSource {
    File(String),
    Url(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDocument {
    pub markdown: String,
    pub title: Option<String>,
    pub file_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConversionRequest {
    protocol_version: u32,
    path: String,
    extension: String,
    url: Option<String>,
    content_type: Option<String>,
    filename: String,
}

struct InputSnapshot {
    directory: TempDir,
    request: ConversionRequest,
}

pub(super) fn supported_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "pdf"
            | "docx"
            | "pptx"
            | "xlsx"
            | "xls"
            | "html"
            | "htm"
            | "epub"
            | "txt"
            | "csv"
            | "json"
            | "xml"
    )
    .then(|| format!(".{extension}"))
}

fn validate_local_path(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() || value.len() > 32768 || value.contains('\0') {
        return Err("invalid_input".into());
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("invalid_input".into());
    }
    #[cfg(windows)]
    if matches!(
        path.components().next(),
        Some(std::path::Component::Prefix(prefix))
            if matches!(prefix.kind(), std::path::Prefix::UNC(..) | std::path::Prefix::VerbatimUNC(..) | std::path::Prefix::DeviceNS(..))
    ) {
        return Err("invalid_input".into());
    }
    if supported_extension(&path).is_none() {
        return Err("unsupported_format".into());
    }
    Ok(path)
}

fn converter_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/converter")
    } else {
        app.path()
            .resource_dir()
            .map_err(|_| "converter_missing".to_string())?
            .join("resources/converter")
    };
    let executable = base.join(if cfg!(windows) {
        "document-converter.exe"
    } else {
        "document-converter"
    });
    if !executable.is_file() {
        return Err("converter_missing".into());
    }
    Ok(executable)
}

async fn prepare_snapshot(source: DocumentSource) -> Result<InputSnapshot, String> {
    let directory = tempfile::Builder::new()
        .prefix("document-import-")
        .tempdir()
        .map_err(|_| "file_read_failed".to_string())?;
    let snapshot_path = directory.path().join("input");
    let (extension, url, content_type, filename) = match source {
        DocumentSource::File(value) => {
            let path = validate_local_path(&value)?;
            // 先排除目录和特殊文件，避免读取命名管道等来源时阻塞。
            let source_metadata = tokio::fs::metadata(&path)
                .await
                .map_err(|_| "file_read_failed".to_string())?;
            if !source_metadata.is_file() {
                return Err("invalid_input".into());
            }
            if source_metadata.len() > MAX_INPUT_BYTES {
                return Err("input_too_large".into());
            }
            let mut input = tokio::fs::File::open(&path)
                .await
                .map_err(|_| "file_read_failed".to_string())?;
            let metadata = input
                .metadata()
                .await
                .map_err(|_| "file_read_failed".to_string())?;
            if !metadata.is_file() {
                return Err("invalid_input".into());
            }
            if metadata.len() > MAX_INPUT_BYTES {
                return Err("input_too_large".into());
            }
            let mut output = tokio::fs::File::create(&snapshot_path)
                .await
                .map_err(|_| "file_read_failed".to_string())?;
            // 限制实际读取，不能只相信打开文件时的长度。
            let size = tokio::io::copy(&mut (&mut input).take(MAX_INPUT_BYTES + 1), &mut output)
                .await
                .map_err(|_| "file_read_failed".to_string())?;
            if size > MAX_INPUT_BYTES {
                return Err("input_too_large".into());
            }
            output
                .flush()
                .await
                .map_err(|_| "file_read_failed".to_string())?;
            (
                supported_extension(&path).unwrap_or_default(),
                None,
                None,
                path.file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("document")
                    .to_string(),
            )
        }
        DocumentSource::Url(value) => {
            let response = tokio::time::timeout(
                Duration::from_secs(30),
                network::download(&value, &snapshot_path),
            )
            .await
            .map_err(|_| "timeout".to_string())??;
            (
                response.extension,
                Some(response.url),
                response.content_type,
                response.filename,
            )
        }
    };
    Ok(InputSnapshot {
        request: ConversionRequest {
            protocol_version: PROTOCOL_VERSION,
            path: snapshot_path.to_string_lossy().into_owned(),
            extension,
            url,
            content_type,
            filename,
        },
        directory,
    })
}

#[tauri::command]
pub async fn convert_document(
    app: tauri::AppHandle,
    source: DocumentSource,
) -> Result<ImportedDocument, String> {
    let _permit = IMPORT_PERMIT
        .try_acquire()
        .map_err(|_| "busy".to_string())?;
    let executable = converter_path(&app)?;
    // 输入准备最多 30 秒，进程阶段最多 90 秒；避免外层超时绕过进程回收。
    let snapshot = tokio::time::timeout(Duration::from_secs(30), prepare_snapshot(source))
        .await
        .map_err(|_| "timeout".to_string())??;
    let result = process::convert(&executable, &snapshot.request).await;
    // 转换进程先回收，再删除其只读输入所在目录。
    drop(snapshot.directory);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 支持格式不包含任意压缩包和旧文档() {
        assert_eq!(
            supported_extension(Path::new("测试.PDF")),
            Some(".pdf".into())
        );
        for name in ["file.zip", "file.doc", "file.ppt", "file.exe", "file"] {
            assert!(supported_extension(Path::new(name)).is_none());
        }
    }

    #[test]
    fn 输入来源按固定结构反序列化() {
        let source: DocumentSource =
            serde_json::from_str(r#"{"kind":"url","value":"https://example.com"}"#).unwrap();
        assert!(matches!(source, DocumentSource::Url(_)));
        assert!(
            serde_json::from_str::<DocumentSource>(r#"{"kind":"shell","value":"command"}"#)
                .is_err()
        );
    }

    #[test]
    fn 拒绝空值相对路径和设备路径() {
        for value in ["", " ", "notes.pdf", "a\0.pdf"] {
            assert!(validate_local_path(value).is_err());
        }
        #[cfg(windows)]
        for value in [r"\\server\share\file.pdf", r"\\.\pipe\file.pdf"] {
            assert!(validate_local_path(value).is_err());
        }
    }

    #[tokio::test]
    async fn 本地输入使用独立快照且自动清理() {
        let source_dir = tempfile::tempdir().unwrap();
        let source_path = source_dir.path().join("测试.txt");
        tokio::fs::write(&source_path, "原文").await.unwrap();
        let snapshot = prepare_snapshot(DocumentSource::File(
            source_path.to_string_lossy().into_owned(),
        ))
        .await
        .unwrap();
        let copied_path = PathBuf::from(&snapshot.request.path);
        assert_eq!(
            tokio::fs::read_to_string(&copied_path).await.unwrap(),
            "原文"
        );
        assert_ne!(copied_path, source_path);
        drop(snapshot);
        assert!(!copied_path.exists());
        assert!(source_path.exists());
    }

    #[tokio::test]
    #[ignore = "需要先构建当前平台的内置转换器"]
    async fn 冻结转换器通过真实进程完成中文文档导入() {
        let source_dir = tempfile::tempdir().unwrap();
        let source_path = source_dir.path().join("中文文档.html");
        let html = "<html><head><title>导入验证</title></head><body><h1>中文标题</h1><p>文档内容</p><ul><li>列表项</li></ul></body></html>";
        tokio::fs::write(&source_path, html).await.unwrap();
        let snapshot = prepare_snapshot(DocumentSource::File(
            source_path.to_string_lossy().into_owned(),
        ))
        .await
        .unwrap();
        let executable = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/converter")
            .join(if cfg!(windows) {
                "document-converter.exe"
            } else {
                "document-converter"
            });
        let result = process::convert(&executable, &snapshot.request)
            .await
            .unwrap();
        assert!(result.markdown.contains("中文标题"));
        assert!(result.markdown.contains("文档内容"));
        assert!(result.markdown.contains("列表项"));
        assert_eq!(result.file_name, "中文文档.html");
        assert_eq!(tokio::fs::read_to_string(&source_path).await.unwrap(), html);
    }

    #[test]
    fn 并发许可释放后可重新转换() {
        let gate = Semaphore::new(1);
        let permit = gate.try_acquire().unwrap();
        assert!(gate.try_acquire().is_err());
        drop(permit);
        assert!(gate.try_acquire().is_ok());
    }
}
