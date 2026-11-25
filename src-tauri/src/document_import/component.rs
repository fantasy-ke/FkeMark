use flate2::read::GzDecoder;
use futures_util::StreamExt;
use reqwest::{redirect, Client, Response, StatusCode};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tokio::{io::AsyncWriteExt, sync::Semaphore};

const RELEASE_TAG: &str = "converter-v1";
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
    Ok(format!("FkeMark-{RELEASE_TAG}-{}.tar.gz", target()?))
}

fn component_dir(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|_| FAILED)?
        .join("components")
        .join(RELEASE_TAG)
        .join(target()?))
}

pub(super) fn converter_path(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    let executable = component_dir(app)?.join(EXECUTABLE);
    executable
        .is_file()
        .then_some(executable)
        .ok_or("converter_missing")
}

#[derive(Deserialize)]
struct Release {
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

async fn release_asset(client: &Client, name: &str) -> Result<Asset, &'static str> {
    let response = check_response(
        client
            .get(format!(
                "https://api.github.com/repos/{REPO}/releases/tags/{RELEASE_TAG}"
            ))
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| NETWORK)?,
    )?;
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| NETWORK)?;
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err(INTEGRITY);
        }
        bytes.extend_from_slice(&chunk);
    }
    let release: Release = serde_json::from_slice(&bytes).map_err(|_| INTEGRITY)?;
    release
        .assets
        .into_iter()
        .find(|asset| asset.name == name)
        .ok_or(UNAVAILABLE)
}

async fn download(client: &Client, asset: &Asset, path: &Path) -> Result<(), &'static str> {
    let response = check_response(
        client
            .get(format!(
                "https://github.com/{REPO}/releases/download/{RELEASE_TAG}/{}",
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
pub async fn install_converter_component(app: tauri::AppHandle) -> Result<(), String> {
    let _permit = INSTALL_PERMIT
        .try_acquire()
        .map_err(|_| "component_install_busy")?;
    let destination = component_dir(&app)?;
    if destination.join(EXECUTABLE).is_file() {
        return Ok(());
    }
    let name = asset_name()?;
    let client = client()?;
    let asset = tokio::time::timeout(Duration::from_secs(20), release_asset(&client, &name))
        .await
        .map_err(|_| NETWORK)??;
    let parent = destination.parent().ok_or(FAILED)?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|_| FAILED)?;
    let staging = tempfile::tempdir_in(parent).map_err(|_| FAILED)?;
    let archive = staging.path().join("download.tar.gz");
    download(&client, &asset, &archive).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let _staging = staging;
        install_archive(&archive, &destination).map(|_| ())
    })
    .await
    .map_err(|_| FAILED)??;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    use tokio::{io::AsyncReadExt, net::TcpListener};

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
