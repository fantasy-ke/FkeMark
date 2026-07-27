use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_file: bool,
    pub is_dir: bool,
    pub size: u64,
    pub modified: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String, // "file" or "folder"
    pub children: Option<Vec<FileTreeNode>>,
    pub expanded: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size: u64,
    pub modified: DateTime<Utc>,
    pub is_file: bool,
    pub is_dir: bool,
}

fn existing_path(file_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    Ok(path)
}

#[cfg(test)]
fn existing_file_path(file_path: &str) -> Result<PathBuf, String> {
    let path = existing_path(file_path)?;
    if !path.is_file() {
        return Err(format!("目标不是文件: {}", path.display()));
    }
    Ok(path)
}

fn validate_file_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("名称不能包含路径分隔符".to_string());
    }
    Ok(name)
}

/// 使用系统文件管理器显示指定文件或文件夹。
pub fn reveal_in_file_manager(file_path: &str) -> Result<(), String> {
    let path = existing_path(file_path)?;

    #[cfg(target_os = "windows")]
    {
        return Command::new("explorer.exe")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("打开文件所在位置失败: {}", e));
    }

    #[cfg(target_os = "macos")]
    {
        return Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("打开文件所在位置失败: {}", e));
    }

    #[cfg(target_os = "linux")]
    {
        let directory = path
            .parent()
            .ok_or_else(|| "无法获取文件所在目录".to_string())?;
        return Command::new("xdg-open")
            .arg(directory)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("打开文件所在位置失败: {}", e));
    }

    #[allow(unreachable_code)]
    Err("当前系统不支持打开文件所在位置".to_string())
}

pub fn read_file<P: AsRef<Path>>(path: P) -> Result<String, String> {
    let path = path.as_ref();

    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }

    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

pub fn write_file<P: AsRef<Path>, C: AsRef<[u8]>>(path: P, content: C) -> Result<(), String> {
    let path = path.as_ref();

    // 确保目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }

    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

pub fn rename_path(path: &str, new_name: &str) -> Result<String, String> {
    let src = existing_path(path)?;
    let parent = src.parent().ok_or_else(|| "无法获取父目录".to_string())?;
    let dest = parent.join(validate_file_name(new_name)?);

    if dest.exists() {
        return Err(format!("目标已存在: {}", dest.display()));
    }

    fs::rename(&src, &dest).map_err(|e| format!("重命名失败: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

pub fn duplicate_path(path: &str) -> Result<String, String> {
    let src = existing_path(path)?;
    let dest = next_duplicate_path(&src)?;

    if src.is_dir() {
        copy_dir_recursive(&src, &dest)?;
    } else {
        fs::copy(&src, &dest).map_err(|e| format!("复制文件失败: {}", e))?;
    }

    Ok(dest.to_string_lossy().to_string())
}

fn next_duplicate_path(src: &Path) -> Result<PathBuf, String> {
    for index in 1..1000 {
        let candidate = duplicate_candidate_path(src, index)?;
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("无法生成可用的复制名称".to_string())
}

fn duplicate_candidate_path(src: &Path, index: usize) -> Result<PathBuf, String> {
    let parent = src.parent().ok_or_else(|| "无法获取父目录".to_string())?;
    let name = src
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy();
    let suffix = if index == 1 {
        " - copy".to_string()
    } else {
        format!(" - copy {}", index)
    };

    if src.is_file() {
        let stem = src
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| name.to_string());
        let ext = src
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        return Ok(parent.join(format!("{}{}{}", stem, suffix, ext)));
    }

    Ok(parent.join(format!("{}{}", name, suffix)))
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("创建目标目录失败: {}", e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败: {}", e))?;

        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if file_type.is_file() {
            fs::copy(&src_path, &dest_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }

    Ok(())
}

#[allow(dead_code)]
pub fn file_exists<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref().exists()
}

pub fn get_file_info<P: AsRef<Path>>(path: P) -> Result<FileMetadata, String> {
    let path = path.as_ref();

    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }

    let metadata = fs::metadata(path).map_err(|e| format!("获取文件信息失败: {}", e))?;

    let modified = metadata
        .modified()
        .map(|t| DateTime::from(t))
        .unwrap_or_else(|_| Utc::now());

    Ok(FileMetadata {
        size: metadata.len(),
        modified,
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
    })
}

pub fn list_directory<P: AsRef<Path>>(path: P) -> Result<Vec<FileEntry>, String> {
    let dir_path = path.as_ref();

    if !dir_path.exists() {
        return Err(format!("目录不存在: {}", dir_path.display()));
    }

    if !dir_path.is_dir() {
        return Err(format!("路径不是目录: {}", dir_path.display()));
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(dir_path).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("获取文件信息失败: {}", e))?;

        let modified = metadata
            .modified()
            .map(|t| DateTime::from(t))
            .unwrap_or_else(|_| Utc::now());

        entries.push(FileEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            path: path.to_string_lossy().to_string(),
            is_file: metadata.is_file(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
        });
    }

    // 排序：目录在前，文件在后
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

/// 递归扫描目录，返回文件树（只包含 .md/.markdown 文件和包含它们的文件夹）
pub fn scan_directory<P: AsRef<Path>>(path: P) -> Result<Vec<FileTreeNode>, String> {
    let dir_path = path.as_ref();

    if !dir_path.exists() {
        return Err(format!("目录不存在: {}", dir_path.display()));
    }

    if !dir_path.is_dir() {
        return Err(format!("路径不是目录: {}", dir_path.display()));
    }

    scan_dir_recursive(dir_path)
}

fn scan_dir_recursive(dir_path: &Path) -> Result<Vec<FileTreeNode>, String> {
    let mut nodes = Vec::new();

    let entries = fs::read_dir(dir_path).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 跳过隐藏文件/目录（以 . 开头）
        if name.starts_with('.') {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("获取文件信息失败: {}", e))?;

        if metadata.is_dir() {
            // 递归扫描子目录
            if let Ok(children) = scan_dir_recursive(&path) {
                // 只包含有 .md 文件的子目录
                if !children.is_empty() {
                    nodes.push(FileTreeNode {
                        name,
                        path: path.to_string_lossy().to_string(),
                        node_type: "folder".to_string(),
                        children: Some(children),
                        expanded: Some(false),
                    });
                }
            }
        } else if metadata.is_file() {
            // 只包含 .md/.markdown 文件
            let lower = name.to_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                nodes.push(FileTreeNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    node_type: "file".to_string(),
                    children: None,
                    expanded: None,
                });
            }
        }
    }

    // 排序：文件夹在前，文件在后，按名称排序
    nodes.sort_by(|a, b| match (a.node_type.as_str(), b.node_type.as_str()) {
        ("folder", "file") => std::cmp::Ordering::Less,
        ("file", "folder") => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(nodes)
}

/// 复制图片资源到文档同级 assets 目录，返回相对路径（如 ./assets/image.png）
///
/// 若同名文件已存在，在文件名前追加时间戳避免覆盖。
pub fn copy_asset_to_assets<P: AsRef<Path>>(src: P, doc_dir: P) -> Result<String, String> {
    let src_path = src.as_ref();
    let doc_dir_path = doc_dir.as_ref();

    if !src_path.exists() {
        return Err(format!("源文件不存在: {}", src_path.display()));
    }

    let file_name = src_path
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();

    // 目标 assets 目录
    let assets_dir = doc_dir_path.join("assets");
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 assets 目录失败: {}", e))?;
    }

    // 目标文件路径（处理重名）
    let mut dest_path = assets_dir.join(&file_name);
    if dest_path.exists() {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let new_name = format!("{}_{}", timestamp, file_name);
        dest_path = assets_dir.join(new_name);
    }

    // 复制文件
    fs::copy(src_path, &dest_path).map_err(|e| format!("复制文件失败: {}", e))?;

    // 返回相对路径 ./assets/filename
    let final_name = dest_path
        .file_name()
        .ok_or_else(|| "无法获取目标文件名".to_string())?
        .to_string_lossy()
        .to_string();
    Ok(format!("./assets/{}", final_name))
}

#[cfg(test)]
mod reveal_file_tests {
    use super::{duplicate_path, existing_file_path, existing_path, rename_path};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "fkemark-file-action-{}-{unique}-{name}",
            std::process::id()
        ))
    }

    #[test]
    fn 接受存在的文件路径() {
        let file = temp_path("note.md");
        fs::write(&file, "# test").unwrap();

        assert_eq!(existing_file_path(file.to_str().unwrap()).unwrap(), file);

        fs::remove_file(file).unwrap();
    }

    #[test]
    fn 显示所在位置支持文件和目录路径() {
        let directory = temp_path("folder");
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("note.md");
        fs::write(&file, "# test").unwrap();
        let missing = directory.join("missing.md");

        assert_eq!(
            existing_path(directory.to_str().unwrap()).unwrap(),
            directory
        );
        assert_eq!(existing_path(file.to_str().unwrap()).unwrap(), file);
        assert!(existing_path(missing.to_str().unwrap()).is_err());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn 重命名文件返回新路径并拒绝路径分隔符() {
        let file = temp_path("old.md");
        fs::write(&file, "# test").unwrap();

        assert!(rename_path(file.to_str().unwrap(), "bad/name.md").is_err());
        let renamed = rename_path(file.to_str().unwrap(), "new.md").unwrap();
        assert!(std::path::Path::new(&renamed).exists());
        assert!(renamed.ends_with("new.md"));

        fs::remove_file(renamed).unwrap();
    }

    #[test]
    fn 复制文件和文件夹生成相邻副本() {
        let file = temp_path("note.md");
        fs::write(&file, "# test").unwrap();
        let file_copy = duplicate_path(file.to_str().unwrap()).unwrap();
        assert!(file_copy.ends_with("note - copy.md"));
        assert_eq!(fs::read_to_string(&file_copy).unwrap(), "# test");

        let folder = temp_path("folder");
        fs::create_dir_all(folder.join("child")).unwrap();
        fs::write(folder.join("child").join("a.md"), "a").unwrap();
        let folder_copy = duplicate_path(folder.to_str().unwrap()).unwrap();
        assert!(folder_copy.ends_with("folder - copy"));
        assert_eq!(
            fs::read_to_string(
                std::path::Path::new(&folder_copy)
                    .join("child")
                    .join("a.md")
            )
            .unwrap(),
            "a"
        );

        fs::remove_file(file).unwrap();
        fs::remove_file(file_copy).unwrap();
        fs::remove_dir_all(folder).unwrap();
        fs::remove_dir_all(folder_copy).unwrap();
    }
}
