use super::{ConversionRequest, ImportedDocument, MAX_MARKDOWN_BYTES, PROTOCOL_VERSION};
use serde::Deserialize;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

#[cfg(all(windows, target_arch = "x86_64"))]
use std::os::windows::io::{FromRawHandle, OwnedHandle};
#[cfg(all(windows, target_arch = "x86_64"))]
use windows::Win32::{
    Foundation::HANDLE,
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_BASIC_LIMIT_INFORMATION,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
};

const MAX_STDOUT_BYTES: usize = 32 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConverterResponse {
    protocol_version: u32,
    markdown: Option<String>,
    title: Option<String>,
    error: Option<String>,
}

async fn read_bounded<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        let size = reader
            .read(&mut buffer)
            .await
            .map_err(|_| "conversion_failed".to_string())?;
        if size == 0 {
            return Ok(result);
        }
        if result.len() + size > limit {
            return Err("output_too_large".into());
        }
        result.extend_from_slice(&buffer[..size]);
    }
}

pub(super) fn parse_response(
    output: &[u8],
    success: bool,
    filename: &str,
) -> Result<ImportedDocument, String> {
    let response: ConverterResponse =
        serde_json::from_slice(output).map_err(|_| "conversion_failed".to_string())?;
    if response.protocol_version != PROTOCOL_VERSION {
        return Err("conversion_failed".into());
    }
    if let Some(error) = response.error {
        return Err(match error.as_str() {
            "invalid_input" | "unsupported_format" | "file_read_failed" | "input_too_large"
            | "output_too_large" | "empty_result" | "conversion_failed" | "converter_missing"
            | "timeout" | "wechat_ocr_failed" => error,
            _ => "conversion_failed".into(),
        });
    }
    if !success {
        return Err("conversion_failed".into());
    }
    let markdown = response.markdown.ok_or("conversion_failed")?;
    if markdown.len() > MAX_MARKDOWN_BYTES {
        return Err("output_too_large".into());
    }
    if markdown.trim().is_empty() {
        return Err("empty_result".into());
    }
    if response
        .title
        .as_ref()
        .is_some_and(|title| title.len() > 4096)
    {
        return Err("conversion_failed".into());
    }
    Ok(ImportedDocument {
        markdown,
        title: response.title,
        file_name: filename.to_string(),
    })
}

#[cfg(all(windows, target_arch = "x86_64"))]
fn own_process_tree(child: &tokio::process::Child) -> windows::core::Result<OwnedHandle> {
    let limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION {
            LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            ..Default::default()
        },
        ..Default::default()
    };
    // 桥接进程收到标准输入后才启动引擎；先加入作业对象，超时或退出时能一并回收引擎。
    unsafe {
        let job = CreateJobObjectW(None, None)?;
        let owned = OwnedHandle::from_raw_handle(job.0);
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of_val(&limits) as u32,
        )?;
        let process = child
            .raw_handle()
            .ok_or_else(windows::core::Error::from_win32)?;
        AssignProcessToJobObject(job, HANDLE(process))?;
        Ok(owned)
    }
}

#[cfg(all(windows, target_arch = "x86_64"))]
pub(super) async fn execute_ocr(
    executable: &Path,
    payload: &[u8],
) -> Result<(ExitStatus, Vec<u8>), String> {
    execute_inner(executable, payload, Duration::from_secs(25), true).await
}

async fn execute(
    executable: &Path,
    payload: &[u8],
    duration: Duration,
) -> Result<(ExitStatus, Vec<u8>), String> {
    execute_inner(executable, payload, duration, false).await
}

async fn execute_inner(
    executable: &Path,
    payload: &[u8],
    duration: Duration,
    _isolate_tree: bool,
) -> Result<(ExitStatus, Vec<u8>), String> {
    let mut command = Command::new(executable);
    command
        .current_dir(executable.parent().ok_or("converter_missing")?)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONSTARTUP")
        .env_remove("PYTHONINSPECT");
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|_| "converter_missing".to_string())?;
    #[cfg(all(windows, target_arch = "x86_64"))]
    let _job = _isolate_tree
        .then(|| own_process_tree(&child))
        .transpose()
        .map_err(|_| "wechat_ocr_failed".to_string())?;
    let mut stdin = child.stdin.take().ok_or("conversion_failed")?;
    let stdout = child.stdout.take().ok_or("conversion_failed")?;
    let stderr = child.stderr.take().ok_or("conversion_failed")?;
    let outcome = tokio::time::timeout(duration, async {
        // 三个管道同时消费，避免第三方输出填满 stderr 后卡死进程。
        let send_request = async {
            stdin
                .write_all(payload)
                .await
                .map_err(|_| "conversion_failed".to_string())?;
            stdin
                .shutdown()
                .await
                .map_err(|_| "conversion_failed".to_string())?;
            drop(stdin);
            Ok::<(), String>(())
        };
        let (_, output, _) = tokio::try_join!(
            send_request,
            read_bounded(stdout, MAX_STDOUT_BYTES),
            read_bounded(stderr, MAX_STDERR_BYTES),
        )?;
        let status = child
            .wait()
            .await
            .map_err(|_| "conversion_failed".to_string())?;
        Ok::<_, String>((status, output))
    })
    .await;
    match outcome {
        Ok(Ok(result)) => Ok(result),
        failed => {
            // 出错和超时路径必须回收进程后才允许清理临时输入。
            let _ = child.kill().await;
            let _ = child.wait().await;
            match failed {
                Ok(Err(error)) => Err(error),
                _ => Err("timeout".into()),
            }
        }
    }
}

pub(super) async fn convert(
    executable: &Path,
    request: &ConversionRequest,
) -> Result<ImportedDocument, String> {
    let payload = serde_json::to_vec(request).map_err(|_| "invalid_input".to_string())?;
    let (status, output) = execute(executable, &payload, Duration::from_secs(90)).await?;
    parse_response(&output, status.success(), &request.filename)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::OnceLock;

    fn fixture_executable() -> &'static Path {
        static FIXTURE: OnceLock<(tempfile::TempDir, PathBuf)> = OnceLock::new();
        &FIXTURE
            .get_or_init(|| {
                let directory = tempfile::tempdir().unwrap();
                let executable = directory.path().join(if cfg!(windows) {
                    "fixture.exe"
                } else {
                    "fixture"
                });
                let source = Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/document_converter.rs");
                let output = std::process::Command::new("rustc")
                    .arg("--edition=2021")
                    .arg(source)
                    .arg("-o")
                    .arg(&executable)
                    .output()
                    .expect("编译进程测试夹具失败");
                assert!(
                    output.status.success(),
                    "{}",
                    String::from_utf8_lossy(&output.stderr)
                );
                (directory, executable)
            })
            .1
    }

    #[tokio::test]
    async fn 独立进程按管道协议转换并回收() {
        let (status, output) = execute(fixture_executable(), b"success", Duration::from_secs(5))
            .await
            .unwrap();
        let result = parse_response(&output, status.success(), "fixture.txt").unwrap();
        assert_eq!(result.markdown, "# fixture");
    }

    #[tokio::test]
    async fn 超时进程被终止且后续任务仍能执行() {
        let error = execute(fixture_executable(), b"timeout", Duration::from_millis(100))
            .await
            .unwrap_err();
        assert_eq!(error, "timeout");
        assert!(
            execute(fixture_executable(), b"success", Duration::from_secs(5))
                .await
                .unwrap()
                .0
                .success()
        );
    }

    #[tokio::test]
    async fn 进程输出超限时两类管道均不会卡住() {
        for payload in [b"stderr_limit".as_slice(), b"stdout_limit"] {
            assert_eq!(
                execute(fixture_executable(), payload, Duration::from_secs(5))
                    .await
                    .unwrap_err(),
                "output_too_large"
            );
        }
    }

    #[tokio::test]
    async fn 进程失败和噪声不会作为成功内容展示() {
        for payload in [b"failure".as_slice(), b"noisy"] {
            let (status, output) = execute(fixture_executable(), payload, Duration::from_secs(5))
                .await
                .unwrap();
            assert!(parse_response(&output, status.success(), "fixture.txt").is_err());
        }
    }

    #[test]
    fn 成功协议保留原始内容和标题() {
        let result = parse_response(
            br##"{"protocolVersion":1,"markdown":"# title\n","title":"title"}"##,
            true,
            "source.html",
        )
        .unwrap();
        assert_eq!(result.markdown, "# title\n");
        assert_eq!(result.title.as_deref(), Some("title"));
        assert_eq!(result.file_name, "source.html");
    }

    #[test]
    fn 协议拒绝噪声缺字段不兼容版本和异常退出() {
        for output in [
            b"log\n{}".as_slice(),
            br#"{"protocolVersion":1}"#,
            br#"{"protocolVersion":2,"markdown":"text"}"#,
            br#"{"protocolVersion":1,"markdown":"text","unexpected":1}"#,
            &[0xff],
        ] {
            assert!(parse_response(output, true, "file").is_err());
        }
        assert!(
            parse_response(br#"{"protocolVersion":1,"markdown":"text"}"#, false, "file").is_err()
        );
    }

    #[test]
    fn 错误码不泄漏第三方异常文本() {
        assert_eq!(
            parse_response(
                br#"{"protocolVersion":1,"error":"unsupported_format"}"#,
                false,
                "file"
            )
            .err()
            .as_deref(),
            Some("unsupported_format")
        );
        assert_eq!(
            parse_response(
                br#"{"protocolVersion":1,"error":"internal trace"}"#,
                false,
                "file"
            )
            .err()
            .as_deref(),
            Some("conversion_failed")
        );
        assert_eq!(
            parse_response(br#"{"protocolVersion":1,"markdown":" \n"}"#, true, "file")
                .err()
                .as_deref(),
            Some("empty_result")
        );
    }

    #[tokio::test]
    async fn 输出流到达上限时立即停止() {
        assert_eq!(
            read_bounded(&b"12345"[..], 4).await.unwrap_err(),
            "output_too_large"
        );
        assert_eq!(read_bounded(&b"1234"[..], 4).await.unwrap(), b"1234");
    }

    #[test]
    fn 拒绝超大转换结果() {
        let output = serde_json::to_vec(&serde_json::json!({ "protocolVersion": 1, "markdown": "a".repeat(MAX_MARKDOWN_BYTES + 1) })).unwrap();
        assert_eq!(
            parse_response(&output, true, "file").err().as_deref(),
            Some("output_too_large")
        );
    }
}
