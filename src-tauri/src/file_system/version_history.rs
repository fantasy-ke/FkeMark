use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_SNAPSHOTS_PER_FILE: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSnapshot {
    pub id: String,
    pub created_at: i64,
    pub size: u64,
}

fn history_root() -> Result<PathBuf, String> {
    let root = crate::settings::get_app_data_dir().join("version-history");
    fs::create_dir_all(&root).map_err(|e| format!("无法创建版本历史目录: {e}"))?;
    Ok(root)
}

fn hash_hex(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}

fn normalized_document_path(path: &str) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
    let normalized = resolved.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn document_history_dir(root: &Path, path: &str) -> PathBuf {
    root.join(hash_hex(normalized_document_path(path).as_bytes()))
}

fn snapshot_from_entry(entry: fs::DirEntry) -> Option<VersionSnapshot> {
    let path = entry.path();
    if path.extension().and_then(|value| value.to_str()) != Some("md") {
        return None;
    }
    let id = path.file_stem()?.to_str()?.to_string();
    if !is_valid_snapshot_id(&id) {
        return None;
    }
    let created_at = id.split_once('-')?.0.parse().ok()?;
    let size = entry.metadata().ok()?.len();
    Some(VersionSnapshot {
        id,
        created_at,
        size,
    })
}

fn list_snapshots_in(root: &Path, path: &str) -> Result<Vec<VersionSnapshot>, String> {
    let dir = document_history_dir(root, path);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut snapshots = fs::read_dir(&dir)
        .map_err(|e| format!("无法读取版本历史: {e}"))?
        .filter_map(Result::ok)
        .filter_map(snapshot_from_entry)
        .collect::<Vec<_>>();
    snapshots.sort_by(|left, right| right.id.cmp(&left.id));
    Ok(snapshots)
}

fn is_valid_snapshot_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn create_snapshot_in(root: &Path, path: &str, content: &str) -> Result<VersionSnapshot, String> {
    let dir = document_history_dir(root, path);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建文档历史目录: {e}"))?;

    let content_hash = hash_hex(content.as_bytes());
    if let Some(latest) = list_snapshots_in(root, path)?.first() {
        if latest.id.ends_with(&content_hash) {
            return Ok(latest.clone());
        }
    }

    let created_at = Utc::now().timestamp_millis();
    let id = format!("{created_at}-{content_hash}");
    let target = dir.join(format!("{id}.md"));
    let temporary = dir.join(format!("{id}.tmp"));
    fs::write(&temporary, content.as_bytes()).map_err(|e| format!("无法写入版本快照: {e}"))?;
    fs::rename(&temporary, &target).map_err(|e| format!("无法保存版本快照: {e}"))?;

    let snapshots = list_snapshots_in(root, path)?;
    for snapshot in snapshots.iter().skip(MAX_SNAPSHOTS_PER_FILE) {
        let _ = fs::remove_file(dir.join(format!("{}.md", snapshot.id)));
    }

    Ok(VersionSnapshot {
        id,
        created_at,
        size: content.len() as u64,
    })
}

fn read_snapshot_in(root: &Path, path: &str, snapshot_id: &str) -> Result<String, String> {
    if !is_valid_snapshot_id(snapshot_id) {
        return Err("无效的版本快照标识".to_string());
    }
    let snapshot_path = document_history_dir(root, path).join(format!("{snapshot_id}.md"));
    fs::read_to_string(snapshot_path).map_err(|e| format!("无法读取版本快照: {e}"))
}

fn is_markdown_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        })
}

fn write_file_with_snapshot_in(root: &Path, path: &str, content: &[u8]) -> Result<(), String> {
    if is_markdown_path(path) && Path::new(path).is_file() {
        if let Ok(previous) = fs::read(path) {
            if previous != content {
                if let Ok(previous) = String::from_utf8(previous) {
                    if let Err(error) = create_snapshot_in(root, path, &previous) {
                        eprintln!("保存文档前创建版本快照失败: {error}");
                    }
                }
            }
        }
    }
    super::write_file(path, content)
}

pub fn create_snapshot(path: &str, content: &str) -> Result<VersionSnapshot, String> {
    create_snapshot_in(&history_root()?, path, content)
}

pub fn list_snapshots(path: &str) -> Result<Vec<VersionSnapshot>, String> {
    list_snapshots_in(&history_root()?, path)
}

pub fn read_snapshot(path: &str, snapshot_id: &str) -> Result<String, String> {
    read_snapshot_in(&history_root()?, path, snapshot_id)
}

pub fn write_file_with_snapshot(path: &str, content: &[u8]) -> Result<(), String> {
    match history_root() {
        Ok(root) => write_file_with_snapshot_in(&root, path, content),
        Err(error) => {
            eprintln!("初始化版本历史失败，继续保存文档: {error}");
            super::write_file(path, content)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "fkemark-version-history-{}-{unique}-{name}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn 保存前记录旧内容且不重复记录相同版本() {
        let root = temp_dir("save");
        let document = root.join("note.md");
        fs::write(&document, "旧内容").unwrap();

        write_file_with_snapshot_in(&root, document.to_str().unwrap(), "新内容".as_bytes())
            .unwrap();
        write_file_with_snapshot_in(&root, document.to_str().unwrap(), "新内容".as_bytes())
            .unwrap();

        let snapshots = list_snapshots_in(&root, document.to_str().unwrap()).unwrap();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(
            read_snapshot_in(&root, document.to_str().unwrap(), &snapshots[0].id).unwrap(),
            "旧内容"
        );
        assert_eq!(fs::read_to_string(&document).unwrap(), "新内容");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn 手动快照支持读取去重并拒绝路径穿越() {
        let root = temp_dir("manual");
        let document = root.join("note.markdown");
        fs::write(&document, "当前内容").unwrap();

        let first = create_snapshot_in(&root, document.to_str().unwrap(), "当前内容").unwrap();
        let duplicate = create_snapshot_in(&root, document.to_str().unwrap(), "当前内容").unwrap();

        assert_eq!(first.id, duplicate.id);
        assert_eq!(
            list_snapshots_in(&root, document.to_str().unwrap())
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            read_snapshot_in(&root, document.to_str().unwrap(), &first.id).unwrap(),
            "当前内容"
        );
        assert!(read_snapshot_in(&root, document.to_str().unwrap(), "../invalid").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn 每个文档最多保留五十个版本() {
        let root = temp_dir("prune");
        let document = root.join("note.md");
        fs::write(&document, "当前内容").unwrap();

        for index in 0..55 {
            create_snapshot_in(&root, document.to_str().unwrap(), &format!("版本 {index}"))
                .unwrap();
        }

        assert_eq!(
            list_snapshots_in(&root, document.to_str().unwrap())
                .unwrap()
                .len(),
            MAX_SNAPSHOTS_PER_FILE
        );
        let _ = fs::remove_dir_all(root);
    }
}
