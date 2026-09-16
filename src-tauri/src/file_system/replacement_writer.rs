use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static REPLACE_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(super) fn write_replaced_file(
    path: &Path,
    content: &str,
    original: &str,
) -> Result<(), String> {
    write_file_atomically(path, content, original)
}

pub(super) fn restore_replaced_file(
    path: &Path,
    original: &str,
    expected: &str,
) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("回滚前检查文件失败: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err(format!("回滚目标不是普通文件: {}", path.display()));
    }
    let current = fs::read(path).map_err(|error| format!("回滚前重新读取文件失败: {error}"))?;
    if current == original.as_bytes() {
        return Ok(());
    }
    if current != expected.as_bytes() {
        return Err(format!("文件已被外部修改，跳过回滚: {}", path.display()));
    }
    write_file_atomically(path, original, expected)
}

fn validate_replacement_target(path: &Path, expected: &str) -> Result<fs::Metadata, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("替换前检查文件失败: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err(format!("替换目标不是普通文件: {}", path.display()));
    }
    let current =
        fs::read_to_string(path).map_err(|error| format!("替换前重新读取文件失败: {error}"))?;
    if current != expected {
        return Err(format!("文件在批量替换期间发生变化: {}", path.display()));
    }
    Ok(metadata)
}

fn should_write_in_place(metadata: &fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        return metadata.nlink() > 1;
    }
    #[cfg(windows)]
    {
        // Windows 稳定版标准库无法读取硬链接数，原位写入可保留链接和权限。
        let _ = metadata;
        return true;
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = metadata;
        false
    }
}

#[cfg(unix)]
fn same_file_identity(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(not(unix))]
fn same_file_identity(_left: &fs::Metadata, _right: &fs::Metadata) -> bool {
    // Windows 稳定版标准库的文件索引接口仍不稳定，只能依赖内容和路径复核。
    true
}

fn ensure_same_file_identity(
    expected: &fs::Metadata,
    current: &fs::Metadata,
    path: &Path,
) -> Result<(), String> {
    if same_file_identity(expected, current) {
        Ok(())
    } else {
        Err(format!("文件在批量替换期间被替换: {}", path.display()))
    }
}

fn open_validated_replacement_target(path: &Path, expected: &str) -> Result<File, String> {
    let path_metadata = validate_replacement_target(path, expected)?;
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("打开替换文件失败: {error}"))?;
    let handle_metadata = file
        .metadata()
        .map_err(|error| format!("读取替换文件信息失败: {error}"))?;
    if !handle_metadata.is_file() {
        return Err(format!("替换目标不是普通文件: {}", path.display()));
    }
    ensure_same_file_identity(&path_metadata, &handle_metadata, path)?;

    let mut current = Vec::new();
    file.read_to_end(&mut current)
        .map_err(|error| format!("替换前读取文件失败: {error}"))?;
    if current != expected.as_bytes() {
        return Err(format!("文件在批量替换期间发生变化: {}", path.display()));
    }

    let current_path_metadata = validate_replacement_target(path, expected)?;
    ensure_same_file_identity(&handle_metadata, &current_path_metadata, path)?;
    Ok(file)
}

fn overwrite_open_file(file: &mut File, content: &[u8]) -> io::Result<()> {
    file.seek(SeekFrom::Start(0))?;
    file.write_all(content)?;
    file.set_len(content.len() as u64)?;
    file.sync_all()
}

fn write_with_recovery<F>(content: &[u8], original: &[u8], mut overwrite: F) -> Result<(), String>
where
    F: FnMut(&[u8]) -> io::Result<()>,
{
    if let Err(write_error) = overwrite(content) {
        return match overwrite(original) {
            Ok(()) => Err(format!("替换文件失败: {write_error}；当前文件已恢复原内容")),
            Err(restore_error) => Err(format!(
                "替换文件失败: {write_error}；恢复当前文件失败: {restore_error}"
            )),
        };
    }
    Ok(())
}

fn write_file_in_place(path: &Path, content: &str, expected: &str) -> Result<(), String> {
    let mut file = open_validated_replacement_target(path, expected)?;
    write_with_recovery(content.as_bytes(), expected.as_bytes(), |bytes| {
        overwrite_open_file(&mut file, bytes)
    })
}

fn replacement_temp_path(path: &Path, sequence: u64) -> PathBuf {
    path.with_extension(format!(
        "fkemark-replace-{}-{sequence}.tmp",
        std::process::id()
    ))
}

fn create_exclusive_temp_file<I>(candidates: I) -> Result<(PathBuf, File), String>
where
    I: IntoIterator<Item = PathBuf>,
{
    for temp_path in candidates {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => return Ok((temp_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建替换临时文件失败: {error}")),
        }
    }
    Err("无法创建独占的替换临时文件".to_string())
}

fn create_replacement_temp_file(path: &Path) -> Result<(PathBuf, File), String> {
    create_exclusive_temp_file((0..64).map(|_| {
        let sequence = REPLACE_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        replacement_temp_path(path, sequence)
    }))
}

fn write_file_atomically(path: &Path, content: &str, expected: &str) -> Result<(), String> {
    let metadata = validate_replacement_target(path, expected)?;

    // 原子替换会生成新 inode；硬链接及 Windows 文件改用原位写入以保留元数据。
    // 扩展属性没有跨平台标准库复制接口，本次不承诺保留 xattr。
    if should_write_in_place(&metadata) {
        return write_file_in_place(path, content, expected);
    }

    let (temp_path, mut temp_file) = create_replacement_temp_file(path)?;
    if let Err(error) = temp_file
        .write_all(content.as_bytes())
        .and_then(|_| temp_file.sync_all())
    {
        drop(temp_file);
        let _ = fs::remove_file(&temp_path);
        return Err(format!("写入替换临时文件失败: {error}"));
    }
    if let Err(error) = fs::set_permissions(&temp_path, metadata.permissions()) {
        drop(temp_file);
        let _ = fs::remove_file(&temp_path);
        return Err(format!("保留替换文件权限失败: {error}"));
    }
    drop(temp_file);

    let current_metadata = match validate_replacement_target(path, expected) {
        Ok(metadata) => metadata,
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }
    };
    if let Err(error) = ensure_same_file_identity(&metadata, &current_metadata, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    if let Err(rename_error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        // 某些平台无法用 rename 覆盖已有文件，只能在再次校验后原位写入。
        return write_file_in_place(path, content, expected).map_err(|write_error| {
            format!("替换临时文件失败: {rename_error}；回退写入失败: {write_error}")
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_exclusive_temp_file, write_with_recovery};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../Temp/tests")
            .join(format!("fkemark-replacement-writer-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn 当前文件部分写入失败后会自行恢复() {
        let mut stored = b"original".to_vec();
        let mut fail_first_write = true;

        let error = write_with_recovery(b"replacement", b"original", |content| {
            stored.clear();
            if fail_first_write {
                fail_first_write = false;
                stored.extend_from_slice(&content[..3]);
                return Err(std::io::Error::other("注入部分写入失败"));
            }
            stored.extend_from_slice(content);
            Ok(())
        })
        .unwrap_err();

        assert!(error.contains("当前文件已恢复原内容"));
        assert_eq!(stored, b"original");
    }

    #[test]
    fn 临时文件冲突时不会覆盖已有文件() {
        let dir = temp_dir();
        let occupied = dir.join("occupied.tmp");
        let available = dir.join("available.tmp");
        fs::write(&occupied, "保留").unwrap();

        let (selected, file) =
            create_exclusive_temp_file([occupied.clone(), available.clone()]).unwrap();
        drop(file);

        assert_eq!(selected, available);
        assert_eq!(fs::read_to_string(&occupied).unwrap(), "保留");
        fs::remove_dir_all(dir).unwrap();
    }
}
