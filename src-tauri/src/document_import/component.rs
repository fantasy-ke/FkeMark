use flate2::read::GzDecoder;
use futures_util::StreamExt;
use reqwest::{redirect, Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tokio::{io::AsyncWriteExt, sync::Semaphore};

const REPO: &str = "fantasy-ke/FkeMark";
const MAX_DOWNLOAD: u64 = 256 * 1024 * 1024;
const MAX_UNPACKED: u64 = 512 * 1024 * 1024;
const MAX_ENTRIES: usize = 16_384;
const EXECUTABLE: &str = if cfg!(windows) {
    "document-converter.exe"
} else {
    "document-converter"
};
const FAILED: &str = "component_install_failed";
const NETWORK: &str = "component_network_failed";
const UNAVAILABLE: &str = "component_unavailable";
const INTEGRITY: &str = "component_integrity_failed";
static INSTALL_PERMIT: Semaphore = Semaphore::const_new(1);

fn target() -> Result<&'static str, &'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Ok("x86_64-pc-windows-msvc"),
        ("linux", "x86_64") => Ok("x86_64-unknown-linux-gnu"),
        ("macos", "x86_64") => Ok("x86_64-apple-darwin"),
        ("macos", "aarch64") => Ok("aarch64-apple-darwin"),
        _ => Err(UNAVAILABLE),
    }
}

pub(super) fn asset_name() -> Result<String, &'static str> {
    Ok(format!(
        "FkeMark-converter-p{}-{}.tar.gz",
        super::PROTOCOL_VERSION,
        target()?
    ))
}

fn components_dir(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|_| FAILED)?
        .join("components"))
}

fn version_key(tag: &str) -> Option<[(usize, &str); 3]> {
    let mut parts = tag.strip_prefix("converter-v")?.split('.');
    let components = [parts.next()?, parts.next()?, parts.next()?];
    if parts.next().is_some()
        || components.iter().any(|part| {
            part.is_empty()
                || (part.len() > 1 && part.starts_with('0'))
                || !part.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return None;
    }
    // 无前导零的数字先按长度、再按字典序比较，避免整数溢出。
    Some(components.map(|part| (part.len(), part)))
}

fn installed_version(root: &Path, target: &str) -> Result<Option<(String, PathBuf)>, &'static str> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(FAILED),
    };
    let mut best: Option<(String, PathBuf)> = None;
    for entry in entries {
        let entry = entry.map_err(|_| FAILED)?;
        let Ok(tag) = entry.file_name().into_string() else {
            continue;
        };
        let Some(key) = version_key(&tag) else {
            continue;
        };
        if best
            .as_ref()
            .and_then(|(tag, _)| version_key(tag))
            .is_some_and(|current| key <= current)
        {
            continue;
        }
        let executable = entry.path().join(target).join(EXECUTABLE);
        if executable.is_file() {
            best = Some((tag, executable));
        }
    }
    Ok(best)
}

fn protocol_dir(components: &Path) -> PathBuf {
    components.join(format!("converter-p{}", super::PROTOCOL_VERSION))
}

fn installed_converter(
    components: &Path,
    target: &str,
) -> Result<Option<(String, PathBuf)>, &'static str> {
    if let Some(version) = installed_version(&protocol_dir(components), target)? {
        return Ok(Some(version));
    }
    // 首次按数字版本安装前，已安装的旧组件仍可离线使用。
    if super::PROTOCOL_VERSION == 1 {
        let legacy = components
            .join("converter-v1")
            .join(target)
            .join(EXECUTABLE);
        if legacy.is_file() {
            return Ok(Some(("converter-v1".into(), legacy)));
        }
    }
    Ok(None)
}

pub(super) fn converter_path(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    installed_converter(&components_dir(app)?, target()?)?
        .map(|(_, executable)| executable)
        .ok_or("converter_missing")
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    size: u64,
    digest: Option<String>,
}

fn client() -> Result<Client, &'static str> {
    Client::builder()
        .user_agent(concat!("FkeMark/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(300))
        .redirect(redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() <= 3
                && url.scheme() == "https"
                && url.port_or_known_default() == Some(443)
                && url.username().is_empty()
                && url.password().is_none()
                && matches!(
                    url.host_str(),
                    Some(
                        "github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.follow()
            } else {
                attempt.error("unexpected component redirect")
            }
        }))
        .build()
        .map_err(|_| NETWORK)
}

fn check_response(response: Response) -> Result<Response, &'static str> {
    match response.status() {
        StatusCode::NOT_FOUND => Err(UNAVAILABLE),
        StatusCode::OK => Ok(response),
        _ => Err(NETWORK),
    }
}

fn select_release(releases: Vec<Release>, name: &str) -> Option<(Release, Asset)> {
    releases
        .into_iter()
        .filter_map(|mut release| {
            if release.draft || version_key(&release.tag_name).is_none() {
                return None;
            }
            let index = release.assets.iter().position(|asset| asset.name == name)?;
            let asset = release.assets.swap_remove(index);
            Some((release, asset))
        })
        .max_by(|(left, _), (right, _)| {
            version_key(&left.tag_name).cmp(&version_key(&right.tag_name))
        })
}

async fn release_asset(client: &Client, name: &str) -> Result<(Release, Asset), &'static str> {
    let mut best: Option<(Release, Asset)> = None;
    for page in 1.. {
        let response = check_response(
            client
                .get(format!(
                    "https://api.github.com/repos/{REPO}/releases?per_page=30&page={page}"
                ))
                .header(reqwest::header::ACCEPT, "application/vnd.github+json")
                .send()
                .await
                .map_err(|_| NETWORK)?,
        )?;
        let has_next = response
            .headers()
            .get(reqwest::header::LINK)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| {
                value
                    .split(',')
                    .any(|link| link.trim_end().ends_with("; rel=\"next\""))
            });
        if let Some((release, asset)) = select_release(read_release(response).await?, name) {
            if best.as_ref().is_none_or(|(current, _)| {
                version_key(&release.tag_name) > version_key(&current.tag_name)
            }) {
                best = Some((release, asset));
            }
        }
        if !has_next {
            break;
        }
    }
    best.ok_or(UNAVAILABLE)
}

async fn read_release<T: serde::de::DeserializeOwned>(
    response: Response,
) -> Result<T, &'static str> {
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| NETWORK)?;
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err(INTEGRITY);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| INTEGRITY)
}

async fn requested_release_asset(
    client: &Client,
    name: &str,
    requested_tag: Option<&str>,
) -> Result<(Release, Asset), &'static str> {
    let Some(tag) = requested_tag else {
        return release_asset(client, name).await;
    };
    if version_key(tag).is_none() {
        return Err(UNAVAILABLE);
    }
    let response = check_response(
        client
            .get(format!(
                "https://api.github.com/repos/{REPO}/releases/tags/{tag}"
            ))
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| NETWORK)?,
    )?;
    let release: Release = read_release(response).await?;
    if release.tag_name != tag {
        return Err(UNAVAILABLE);
    }
    select_release(vec![release], name).ok_or(UNAVAILABLE)
}

async fn download(
    client: &Client,
    tag: &str,
    asset: &Asset,
    path: &Path,
) -> Result<(), &'static str> {
    let response = check_response(
        client
            .get(format!(
                "https://github.com/{REPO}/releases/download/{tag}/{}",
                asset.name
            ))
            .send()
            .await
            .map_err(|_| NETWORK)?,
    )?;
    save_download(response, asset, path).await
}

async fn save_download(response: Response, asset: &Asset, path: &Path) -> Result<(), &'static str> {
    let expected = asset
        .digest
        .as_deref()
        .and_then(|value| value.strip_prefix("sha256:"))
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or(INTEGRITY)?;
    if !(1..=MAX_DOWNLOAD).contains(&asset.size) {
        return Err(INTEGRITY);
    }
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(path).await.map_err(|_| FAILED)?;
    let mut hash = Sha256::new();
    let mut bytes = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| NETWORK)?;
        bytes += chunk.len() as u64;
        if bytes > asset.size {
            return Err(INTEGRITY);
        }
        hash.update(&chunk);
        file.write_all(&chunk).await.map_err(|_| FAILED)?;
    }
    file.flush().await.map_err(|_| FAILED)?;
    if bytes != asset.size || !format!("{:x}", hash.finalize()).eq_ignore_ascii_case(expected) {
        return Err(INTEGRITY);
    }
    Ok(())
}

fn invalid_archive() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "invalid component archive")
}

fn archive_path(path: &Path) -> bool {
    let mut parts = path.components().peekable();
    parts.peek().is_some()
        && parts.all(|part| {
            let Component::Normal(name) = part else {
                return false;
            };
            name.to_str().is_some_and(|name| {
                !name.contains(['\\', ':']) && (!cfg!(windows) || !name.ends_with([' ', '.']))
            })
        })
}

#[cfg(unix)]
fn link_stays_inside(path: &Path, target: &Path) -> bool {
    let mut depth = path.components().count().saturating_sub(1);
    !target.as_os_str().is_empty()
        && target.components().all(|part| match part {
            Component::Normal(_) => {
                depth += 1;
                true
            }
            Component::CurDir => true,
            Component::ParentDir if depth > 0 => {
                depth -= 1;
                true
            }
            _ => false,
        })
}

fn extract(archive: &Path, root: &Path) -> io::Result<()> {
    let decoder = GzDecoder::new(File::open(archive)?);
    let mut archive = tar::Archive::new(decoder.take(MAX_UNPACKED));
    #[cfg(unix)]
    let mut links = Vec::new();
    for (index, entry) in archive.entries()?.enumerate() {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        if index >= MAX_ENTRIES || !archive_path(&path) {
            return Err(invalid_archive());
        }
        let output = root.join(&path);
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            fs::create_dir_all(&output)?;
            continue;
        }
        fs::create_dir_all(output.parent().ok_or_else(invalid_archive)?)?;
        if kind.is_file() {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&output)?;
            if io::copy(&mut entry, &mut file)? != entry.size() {
                return Err(invalid_archive());
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                file.set_permissions(fs::Permissions::from_mode(
                    0o600 | (entry.header().mode()? & 0o100),
                ))?;
            }
        } else {
            #[cfg(unix)]
            if kind.is_symlink() {
                let target = entry.link_name()?.ok_or_else(invalid_archive)?.into_owned();
                if !link_stays_inside(&path, &target) {
                    return Err(invalid_archive());
                }
                links.push((output, target));
                continue;
            }
            return Err(invalid_archive());
        }
    }
    let mut remaining = archive.into_inner();
    io::copy(&mut remaining, &mut io::sink())?;
    if remaining.limit() == 0 {
        return Err(invalid_archive());
    }
    #[cfg(unix)]
    {
        // 先写入实体文件，避免经由归档中的链接写入其他路径。
        for (output, target) in &links {
            std::os::unix::fs::symlink(target, output)?;
        }
        let root = root.canonicalize()?;
        for (output, _) in links {
            if !output.canonicalize()?.starts_with(&root) {
                return Err(invalid_archive());
            }
        }
    }
    Ok(())
}

pub(super) fn install_archive(archive: &Path, destination: &Path) -> Result<PathBuf, &'static str> {
    let parent = destination.parent().ok_or(FAILED)?;
    let staging = tempfile::tempdir_in(parent).map_err(|_| FAILED)?;
    let payload = staging.path().join("component");
    fs::create_dir(&payload).map_err(|_| FAILED)?;
    extract(archive, &payload).map_err(|_| FAILED)?;
    if !payload.join(EXECUTABLE).is_file()
        || !payload.join("bundle-manifest.json").is_file()
        || !["eng", "chi_sim"].into_iter().all(|lang| {
            payload
                .join("_internal/tessdata")
                .join(format!("{lang}.traineddata"))
                .is_file()
        })
    {
        return Err(FAILED);
    }
    let executable = destination.join(EXECUTABLE);
    // 下载与解包完成前目标目录不可见；多个进程同时安装时保留先完成的同版本组件。
    if fs::rename(&payload, destination).is_err() && !executable.is_file() {
        return Err(FAILED);
    }
    Ok(executable)
}

#[tauri::command]
pub async fn is_converter_component_installed(app: tauri::AppHandle) -> Result<bool, String> {
    match converter_path(&app) {
        Ok(_) => Ok(true),
        Err("converter_missing") => Ok(false),
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub async fn check_converter_component_update(
    app: tauri::AppHandle,
) -> Result<Option<ComponentUpdate>, String> {
    let Ok(target) = target() else {
        return Ok(None);
    };
    let Some((current, _)) = installed_converter(&components_dir(&app)?, target)? else {
        return Ok(None);
    };
    let (release, _) = tokio::time::timeout(
        Duration::from_secs(20),
        release_asset(&client()?, &asset_name()?),
    )
    .await
    .map_err(|_| NETWORK)??;
    Ok(Some(component_update(current, release)))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentUpdate {
    current_version: String,
    latest_version: String,
    tag_name: String,
    release_notes: String,
    release_date: String,
    is_newer: bool,
}

fn component_update(current: String, release: Release) -> ComponentUpdate {
    let is_newer = version_key(&release.tag_name) > version_key(&current);
    ComponentUpdate {
        current_version: current.trim_start_matches("converter-v").into(),
        latest_version: release.tag_name.trim_start_matches("converter-v").into(),
        tag_name: release.tag_name,
        release_notes: release.body.unwrap_or_default(),
        release_date: release.published_at.unwrap_or_default(),
        is_newer,
    }
}

#[tauri::command]
pub async fn install_converter_component(
    app: tauri::AppHandle,
    tag_name: Option<String>,
) -> Result<bool, String> {
    let _permit = INSTALL_PERMIT
        .try_acquire()
        .map_err(|_| "component_install_busy")?;
    let root = protocol_dir(&components_dir(&app)?);
    let target = target()?;
    let name = asset_name()?;
    let client = client()?;
    let (release, asset) = tokio::time::timeout(
        Duration::from_secs(20),
        requested_release_asset(&client, &name, tag_name.as_deref()),
    )
    .await
    .map_err(|_| NETWORK)??;
    let tag = release.tag_name;
    if installed_version(&root, target)?
        .is_some_and(|(current, _)| version_key(&current) >= version_key(&tag))
    {
        return Ok(false);
    }
    let destination = root.join(&tag).join(target);
    let parent = destination.parent().ok_or(FAILED)?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|_| FAILED)?;
    let staging = tempfile::tempdir_in(parent).map_err(|_| FAILED)?;
    let archive = staging.path().join("download.tar.gz");
    download(&client, &tag, &asset, &archive).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let _staging = staging;
        install_archive(&archive, &destination).map(|_| ())
    })
    .await
    .map_err(|_| FAILED)??;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    use tokio::{io::AsyncReadExt, net::TcpListener};

    #[test]
    fn 优先选择数字版本最高且有当前平台归档的已发布组件() {
        let target = target().unwrap();
        let name = format!("FkeMark-converter-p1-{target}.tar.gz");
        let entries = [
            ("converter-v0.9.0", false, name.as_str()),
            ("v9.0.0", false, name.as_str()),
            ("converter-v0.10.0", false, name.as_str()),
            ("converter-v3.0.0", true, name.as_str()),
            ("converter-v2.0.0", false, "other-target.tar.gz"),
            ("converter-v01.0.0", false, name.as_str()),
            ("converter-v3.0.0-rc.1", false, name.as_str()),
        ];
        let releases: Vec<_> = entries
            .into_iter()
            .map(|(tag, draft, name)| {
                serde_json::json!({
                    "tag_name": tag, "draft": draft, "assets": [{"name": name, "size": 42}]
                })
            })
            .collect();
        let (release, asset) = select_release(
            serde_json::from_value(serde_json::json!(releases)).unwrap(),
            &name,
        )
        .unwrap();
        assert_eq!(release.tag_name, "converter-v0.10.0");
        assert_eq!(asset.size, 42);
        let update = component_update("converter-v0.9.0".into(), release);
        assert_eq!(update.current_version, "0.9.0");
        assert_eq!(update.latest_version, "0.10.0");
        assert!(update.is_newer);
    }

    #[test]
    fn 离线只选择当前平台已完整安装的最高版本() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let target = target().unwrap();
        for tag in ["converter-v0.9.0", "converter-v0.10.0", "converter-v01.0.0"] {
            let path = root.join(tag).join(target);
            fs::create_dir_all(&path).unwrap();
            fs::write(path.join(EXECUTABLE), b"converter").unwrap();
        }
        fs::create_dir_all(root.join("converter-v8.0.0").join(target)).unwrap();
        let (tag, path) = installed_version(root, target).unwrap().unwrap();
        assert_eq!(tag, "converter-v0.10.0");
        assert_eq!(
            path,
            root.join("converter-v0.10.0").join(target).join(EXECUTABLE)
        );
    }

    fn archive(model_files: bool) -> Vec<u8> {
        let mut archive = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
        for (path, contents) in [
            (EXECUTABLE, b"converter".as_slice()),
            ("bundle-manifest.json", b"{}"),
            ("_internal/tessdata/eng.traineddata", b"english"),
            ("_internal/tessdata/chi_sim.traineddata", b"chinese"),
        ]
        .into_iter()
        .take(if model_files { 4 } else { 2 })
        {
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o755);
            header.set_size(contents.len() as u64);
            archive.append_data(&mut header, path, contents).unwrap();
        }
        archive.into_inner().unwrap().finish().unwrap()
    }

    async fn serve(contents: Vec<u8>) -> Response {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                request.push(socket.read_u8().await.unwrap());
            }
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        contents.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            socket.write_all(&contents).await.unwrap();
        });
        Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(url)
            .send()
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn 下载校验失败不安装且正确组件可再次安装() {
        let directory = tempfile::tempdir().unwrap();
        let download_path = directory.path().join("download.tar.gz");
        let destination = directory.path().join("converter");
        let contents = archive(true);
        let asset = Asset {
            name: asset_name().unwrap(),
            size: contents.len() as u64,
            digest: Some(format!("sha256:{:x}", Sha256::digest(&contents))),
        };
        let mut damaged = contents.clone();
        damaged[0] ^= 1;
        assert_eq!(
            save_download(serve(damaged).await, &asset, &download_path).await,
            Err(INTEGRITY)
        );
        assert!(!destination.exists());
        save_download(serve(contents).await, &asset, &download_path)
            .await
            .unwrap();
        let executable = install_archive(&download_path, &destination).unwrap();
        assert_eq!(fs::read(executable).unwrap(), b"converter");
        assert_eq!(
            fs::read(destination.join("_internal/tessdata/chi_sim.traineddata")).unwrap(),
            b"chinese"
        );
    }

    #[test]
    fn 不完整的组件不会暴露给导入功能() {
        let directory = tempfile::tempdir().unwrap();
        let download_path = directory.path().join("download.tar.gz");
        let destination = directory.path().join("converter");
        for contents in [archive(false), {
            let mut bytes = archive(true);
            bytes.truncate(bytes.len() - 8);
            bytes
        }] {
            fs::write(&download_path, contents).unwrap();
            assert_eq!(install_archive(&download_path, &destination), Err(FAILED));
            assert!(!destination.exists());
        }
    }
}
