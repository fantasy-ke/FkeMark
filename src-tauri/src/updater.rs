//! FkeMark 应用内更新模块
//!
//! 提供完整的"下载 → 校验 → 安装 → 回滚"闭环，特点：
//! - **断点续传**：使用 HTTP Range 请求，中断后可从已下载字节继续；下载状态持久化到
//!   缓存目录，即使重启应用也能续传。
//! - **完整性校验**：下载完成后校验文件大小 + SHA-256（清单提供时）。
//! - **进度上报**：通过窗口事件 `update://download-progress` 实时上报进度/速度。
//! - **原子性（失败回滚）**：下载写入临时 `.partial` 文件，校验通过后才 rename 成正式安装包；
//!   任一环节失败都不会破坏当前已安装版本 —— 这是最核心的数据安全保证。
//! - **安装后自愈**：安装前写 `pending-update.json` 标记；下次启动时 `finalize_update`
//!   比对版本判断安装是否成功，失败则保留旧版本并通知前端。
//! - **手动回滚**：成功更新后保留上一版本安装包，`rollback_update` 可静默重装回退。
//!
//! 采用自写命令而非官方 `tauri-plugin-updater`，因为官方插件不支持断点续传与版本回滚。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// 取消下载的全局标志（用户点击"取消"时置 true）
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

// ── 数据结构 ──

/// 下载进度事件负载（emit 给前端）
#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub version: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub speed: f64, // 字节/秒
}

/// 持久化的下载状态（用于续传，存于 updates/download-state.json）
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadState {
    pub version: String,
    pub url: String,
    pub file_name: String,
    pub expected_size: u64,
    #[serde(default)]
    pub expected_sha256: String,
    /// 已下载字节数（查询时按 .partial 实际大小返回）
    #[serde(default)]
    pub downloaded: u64,
}

/// 安装前写入的待处理标记（用于安装后自愈 / 回滚判断）
#[derive(Clone, Serialize, Deserialize)]
pub struct PendingUpdate {
    pub prev_version: String,
    pub new_version: String,
    pub new_installer: String,
    /// 当前版本对应的安装包路径（若存在，可作回滚目标）
    #[serde(default)]
    pub prev_installer: String,
}

/// 回滚信息（成功更新后写入，供 rollback_update 使用）
#[derive(Clone, Serialize, Deserialize)]
pub struct RollbackInfo {
    pub good_version: String,
    pub prev_version: String,
    pub prev_installer: String,
}

/// finalize_update 返回给前端的结果
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeResult {
    /// "success" | "failed" | "none"
    pub status: String,
    pub prev_version: String,
    pub new_version: String,
    /// 是否有可用的回滚安装包
    pub rollback_available: bool,
}

// ── 路径辅助 ──

/// 更新缓存目录：<app_cache>/updates/
fn updates_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("获取缓存目录失败: {}", e))?;
    let dir = base.join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建更新目录失败: {}", e))?;
    Ok(dir)
}

fn state_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(updates_dir(app)?.join("download-state.json"))
}

fn pending_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(updates_dir(app)?.join("pending-update.json"))
}

fn rollback_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(updates_dir(app)?.join("rollback.json"))
}

/// 正式安装包命名：<version>__<file_name>（版本前缀避免不同版本互相覆盖）
fn installer_path(app: &tauri::AppHandle, version: &str, file_name: &str) -> Result<PathBuf, String> {
    let safe_ver = version.replace(['/', '\\', ':'], "_");
    let safe_name = file_name.replace(['/', '\\', ':'], "_");
    if safe_name.trim().is_empty() || safe_name == "." || safe_name == ".." {
        return Err("invalid installer file name".into());
    }
    Ok(updates_dir(app)?.join(format!("{}__{}", safe_ver, safe_name)))
}


fn canonical_update_installer(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf, String> {
    let updates = updates_dir(app)?
        .canonicalize()
        .map_err(|e| format!("failed to read update directory: {}", e))?;
    let installer = path
        .canonicalize()
        .map_err(|e| format!("failed to read installer: {}", e))?;
    if !installer.starts_with(&updates) {
        return Err("installer must be inside the app updates directory".into());
    }
    Ok(installer)
}

fn is_supported_installer(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase();
    #[cfg(target_os = "windows")]
    { return lower.ends_with(".msi") || lower.ends_with(".exe"); }
    #[cfg(target_os = "macos")]
    { return lower.ends_with(".dmg"); }
    #[cfg(all(unix, not(target_os = "macos")))]
    { return lower.ends_with(".appimage") || lower.ends_with(".deb"); }
    #[allow(unreachable_code)]
    false
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| format!("写入状态文件失败: {}", e))
}

// ── 命令 ──

/// 查询指定版本的续传状态：返回已下载字节数与是否已存在完整安装包。
#[tauri::command]
pub fn get_download_state(
    app: tauri::AppHandle,
    version: String,
    file_name: String,
) -> Result<Option<DownloadState>, String> {
    // 已有完整安装包 → 视为已完成
    let final_path = installer_path(&app, &version, &file_name)?;
    if final_path.exists() {
        let size = std::fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
        return Ok(Some(DownloadState {
            version,
            url: String::new(),
            file_name,
            expected_size: size,
            expected_sha256: String::new(),
            downloaded: size,
        }));
    }
    // 读取持久化状态并回填 .partial 实际大小
    let sf = state_file(&app)?;
    if let Some(mut st) = read_json::<DownloadState>(&sf) {
        if st.version == version {
            let partial = final_path.with_extension("partial");
            st.downloaded = std::fs::metadata(&partial).map(|m| m.len()).unwrap_or(0);
            return Ok(Some(st));
        }
    }
    Ok(None)
}

/// 取消正在进行的下载。
#[tauri::command]
pub fn cancel_download() {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
}

/// 校验安装包完整性（大小 + 可选 SHA-256）。
#[tauri::command]
pub async fn verify_update_package(
    path: String,
    expected_size: u64,
    expected_sha256: String,
) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("安装包不存在".into());
    }
    let meta = tokio::fs::metadata(&p)
        .await
        .map_err(|e| format!("读取安装包信息失败: {}", e))?;
    if expected_size > 0 && meta.len() != expected_size {
        return Err(format!(
            "文件大小校验失败：期望 {} 字节，实际 {} 字节",
            expected_size,
            meta.len()
        ));
    }
    if expected_sha256.trim().is_empty() {
        return Err("missing SHA-256 checksum".into());
    }
    let actual = sha256_file(&p).await?;
    if !actual.eq_ignore_ascii_case(expected_sha256.trim()) {
        return Err(format!(
            "SHA-256 verification failed: expected {}, actual {}",
            expected_sha256, actual
        ));
    }
    Ok(true)
}

/// 下载更新包（支持断点续传 + 进度上报 + 完整性校验）。
///
/// 返回校验通过的正式安装包路径。任一步骤失败都不会破坏当前安装（原子性）。
#[tauri::command]
pub async fn download_update(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    url: String,
    version: String,
    file_name: String,
    expected_size: u64,
    expected_sha256: String,
) -> Result<String, String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);

    let final_path = installer_path(&app, &version, &file_name)?;
    let partial_path = final_path.with_extension("partial");

    // 已有完整且校验通过的安装包 → 直接复用，避免重复下载
    if final_path.exists() {
        if verify_update_package(
            final_path.to_string_lossy().to_string(),
            expected_size,
            expected_sha256.clone(),
        )
        .await
        .is_ok()
        {
            emit_progress(&window, &version, expected_size.max(1), expected_size.max(1), 0.0);
            return Ok(final_path.to_string_lossy().to_string());
        }
        // 校验不过 → 删除重下
        let _ = tokio::fs::remove_file(&final_path).await;
    }

    // 持久化下载状态（用于跨重启续传）
    write_json(
        &state_file(&app)?,
        &DownloadState {
            version: version.clone(),
            url: url.clone(),
            file_name: file_name.clone(),
            expected_size,
            expected_sha256: expected_sha256.clone(),
            downloaded: 0,
        },
    )?;

    // 已下载的字节数（续传起点）
    let mut existing: u64 = tokio::fs::metadata(&partial_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    // 若本地已多于期望大小（异常残留）→ 丢弃重下
    if expected_size > 0 && existing > expected_size {
        let _ = tokio::fs::remove_file(&partial_path).await;
        existing = 0;
    }

    let client = reqwest::Client::builder()
        .user_agent("FkeMark-Updater")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let mut req = client.get(&url);
    if existing > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={}-", existing));
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("发起下载请求失败: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("下载失败，服务器返回状态码 {}", status.as_u16()));
    }

    // 判断服务器是否接受 Range：206 表示续传成功；否则从头覆盖
    let resume = existing > 0 && status.as_u16() == 206;
    if !resume {
        existing = 0;
    }

    // 计算总大小
    let total = if expected_size > 0 {
        expected_size
    } else {
        resp.content_length().map(|c| c + existing).unwrap_or(0)
    };

    // 打开文件（续传 → append；否则 truncate 覆盖）
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resume)
        .truncate(!resume)
        .open(&partial_path)
        .await
        .map_err(|e| format!("打开下载文件失败: {}", e))?;

    let mut downloaded = existing;
    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;

    let start = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = downloaded;

    while let Some(chunk) = stream.next().await {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            // 取消：保留 .partial 以便后续续传，仅刷新缓冲
            let _ = file.flush().await;
            return Err("__CANCELLED__".into());
        }
        let bytes = chunk.map_err(|e| format!("下载数据流出错: {}", e))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += bytes.len() as u64;

        // 限流：每 200ms 上报一次进度
        if last_emit.elapsed().as_millis() >= 200 {
            let dt = last_emit.elapsed().as_secs_f64().max(0.001);
            let speed = (downloaded - last_bytes) as f64 / dt;
            emit_progress(&window, &version, downloaded, total, speed);
            last_emit = std::time::Instant::now();
            last_bytes = downloaded;
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // 平均速度用于最后一帧
    let avg = downloaded as f64 / start.elapsed().as_secs_f64().max(0.001);
    emit_progress(&window, &version, downloaded, total.max(downloaded), avg);

    // ── 完整性校验（失败则删除，保证不留下损坏包）──
    if expected_size > 0 && downloaded != expected_size {
        let _ = tokio::fs::remove_file(&partial_path).await;
        return Err(format!(
            "下载不完整：期望 {} 字节，实际 {} 字节",
            expected_size, downloaded
        ));
    }
    if expected_sha256.trim().is_empty() {
        let _ = tokio::fs::remove_file(&partial_path).await;
        return Err("missing SHA-256 checksum; automatic installer download was rejected".into());
    }
    let actual = sha256_file(&partial_path).await?;
    if !actual.eq_ignore_ascii_case(expected_sha256.trim()) {
        let _ = tokio::fs::remove_file(&partial_path).await;
        return Err(format!(
            "SHA-256 verification failed: expected {}, actual {}",
            expected_sha256, actual
        ));
    }

    // 校验通过：原子 rename 为正式安装包，并清理下载状态
    tokio::fs::rename(&partial_path, &final_path)
        .await
        .map_err(|e| format!("重命名安装包失败: {}", e))?;
    let _ = std::fs::remove_file(state_file(&app)?);

    Ok(final_path.to_string_lossy().to_string())
}

/// 执行安装：记录待处理标记 → 启动安装程序 → 退出应用（让安装器替换文件）。
///
/// ⚠️ 前端必须在调用本命令前保存所有未保存的文档，保证数据一致性。
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    installer_path: String,
    new_version: String,
) -> Result<(), String> {
    let path = canonical_update_installer(&app, Path::new(&installer_path))?;
    if !is_supported_installer(&path) {
        return Err("unsupported installer type".into());
    }

    let current_version = app.package_info().version.to_string();

    // 查找当前版本已缓存的安装包（若有）作为回滚目标
    let prev_installer = find_installer_for_version(&app, &current_version).unwrap_or_default();

    // 写入待处理标记（用于安装后自愈判断）
    write_json(
        &pending_file(&app)?,
        &PendingUpdate {
            prev_version: current_version,
            new_version: new_version.clone(),
            new_installer: path.to_string_lossy().to_string(),
            prev_installer,
        },
    )?;

    // 启动安装程序
    spawn_installer(&path)?;

    // 稍作延迟确保安装器已拉起，再退出应用释放文件占用
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    app.exit(0);
    Ok(())
}

/// 启动时调用：判断上一次安装是否成功，做自愈并返回结果给前端。
#[tauri::command]
pub fn finalize_update(app: tauri::AppHandle) -> Result<FinalizeResult, String> {
    let pf = pending_file(&app)?;
    let pending: Option<PendingUpdate> = read_json(&pf);
    let Some(pending) = pending else {
        return Ok(FinalizeResult {
            status: "none".into(),
            prev_version: String::new(),
            new_version: String::new(),
            rollback_available: rollback_available(&app),
        });
    };

    let current = app.package_info().version.to_string();
    // 待处理标记已消费
    let _ = std::fs::remove_file(&pf);

    if version_matches(&current, &pending.new_version) {
        // 安装成功：记录回滚信息（可回退到上一版本）
        if !pending.prev_installer.is_empty() && Path::new(&pending.prev_installer).exists() {
            let _ = write_json(
                &rollback_file(&app)?,
                &RollbackInfo {
                    good_version: current.clone(),
                    prev_version: pending.prev_version.clone(),
                    prev_installer: pending.prev_installer.clone(),
                },
            );
        }
        // 清理其它历史安装包，仅保留当前版本包（供未来回滚）
        cleanup_installers(&app, &pending.new_version);
        Ok(FinalizeResult {
            status: "success".into(),
            prev_version: pending.prev_version,
            new_version: pending.new_version,
            rollback_available: rollback_available(&app),
        })
    } else {
        // 仍是旧版本：安装未生效（失败/被取消），旧版本完好即等效回滚
        Ok(FinalizeResult {
            status: "failed".into(),
            prev_version: pending.prev_version,
            new_version: pending.new_version,
            rollback_available: rollback_available(&app),
        })
    }
}

/// 手动回滚到上一个版本（使用保留的旧版本安装包静默重装）。
#[tauri::command]
pub async fn rollback_update(app: tauri::AppHandle) -> Result<(), String> {
    let info: RollbackInfo = read_json(&rollback_file(&app)?)
        .ok_or_else(|| "没有可回滚的版本".to_string())?;
    let path = PathBuf::from(&info.prev_installer);
    if !path.exists() {
        return Err("上一版本安装包已不存在，无法回滚".into());
    }
    // 回滚同样写 pending 标记（目标为旧版本）
    let current = app.package_info().version.to_string();
    write_json(
        &pending_file(&app)?,
        &PendingUpdate {
            prev_version: current,
            new_version: info.prev_version.clone(),
            new_installer: info.prev_installer.clone(),
            prev_installer: String::new(),
        },
    )?;
    spawn_installer(&path)?;
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    app.exit(0);
    Ok(())
}

// ── 内部辅助 ──

fn emit_progress(window: &tauri::WebviewWindow, version: &str, downloaded: u64, total: u64, speed: f64) {
    let percent = if total > 0 {
        (downloaded as f64 / total as f64 * 100.0).min(100.0)
    } else {
        0.0
    };
    let _ = window.emit(
        "update://download-progress",
        DownloadProgress {
            version: version.to_string(),
            downloaded,
            total,
            percent,
            speed,
        },
    );
}

/// 计算文件 SHA-256（十六进制小写）
async fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("打开文件校验失败: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 256];
    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("读取文件校验失败: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 启动系统安装程序（平台相关）
fn spawn_installer(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        let lower = path_str.to_lowercase();
        let mut cmd;
        if lower.ends_with(".msi") {
            // MSI：/passive 显示进度条无需交互；去掉 /norestart 以允许安装完成后自动重启应用
            cmd = std::process::Command::new("msiexec");
            cmd.args(["/i", &path_str, "/passive"]);
        } else {
            // NSIS -setup.exe：不传 /S，安装器显示正常 UI，用户可勾选"启动 FkeMark"
            cmd = std::process::Command::new(&path_str);
        }
        // 仅 DETACHED_PROCESS（不混用 CREATE_NO_WINDOW），确保安装器窗口正常显示
        cmd.creation_flags(DETACHED_PROCESS);
        cmd.spawn().map_err(|e| format!("启动安装程序失败: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // dmg：用 open 打开挂载，用户手动拖拽（macOS 无静默安装惯例）
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("打开安装包失败: {}", e))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Linux：AppImage 直接执行；deb 交给系统处理器
        let lower = path_str.to_lowercase();
        if lower.ends_with(".appimage") {
            let _ = std::process::Command::new("chmod").args(["+x", &path_str]).status();
            std::process::Command::new(&path_str)
                .spawn()
                .map_err(|e| format!("启动 AppImage 失败: {}", e))?;
        } else {
            std::process::Command::new("xdg-open")
                .arg(&path_str)
                .spawn()
                .map_err(|e| format!("打开安装包失败: {}", e))?;
        }
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

/// 在 updates 目录中查找指定版本的安装包（命名前缀 <version>__）
fn find_installer_for_version(app: &tauri::AppHandle, version: &str) -> Option<String> {
    let dir = updates_dir(app).ok()?;
    let prefix = format!("{}__", version.replace(['/', '\\', ':'], "_"));
    let entries = std::fs::read_dir(&dir).ok()?;
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with(&prefix) && !name.ends_with(".partial") {
            return Some(e.path().to_string_lossy().to_string());
        }
    }
    None
}

/// 是否存在可用回滚包
fn rollback_available(app: &tauri::AppHandle) -> bool {
    if let Ok(rf) = rollback_file(app) {
        if let Some(info) = read_json::<RollbackInfo>(&rf) {
            return Path::new(&info.prev_installer).exists();
        }
    }
    false
}

/// 清理除 keep_version 之外的历史安装包与残留 .partial
fn cleanup_installers(app: &tauri::AppHandle, keep_version: &str) {
    let Ok(dir) = updates_dir(app) else { return };
    let keep_prefix = format!("{}__", keep_version.replace(['/', '\\', ':'], "_"));
    // 回滚包路径（需保留）
    let keep_rollback = rollback_file(app)
        .ok()
        .and_then(|rf| read_json::<RollbackInfo>(&rf))
        .map(|i| i.prev_installer)
        .unwrap_or_default();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let path = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                continue;
            }
            let full = path.to_string_lossy().to_string();
            if name.starts_with(&keep_prefix) || full == keep_rollback {
                continue;
            }
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// 宽松版本比较：忽略前缀 v 与末尾 .0（MSI 版本可能为 x.y.z.0）
fn version_matches(a: &str, b: &str) -> bool {
    let norm = |s: &str| {
        s.trim_start_matches('v')
            .split('-')
            .next()
            .unwrap_or("")
            .trim_end_matches(".0")
            .to_string()
    };
    a == b || norm(a) == norm(b)
}
