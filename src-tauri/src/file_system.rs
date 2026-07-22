use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// ── 回收站数据结构 ──

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub name: String,
    pub original_path: String,
    pub trash_path: String,
    pub deleted_at: DateTime<Utc>,
    pub size: u64,
}

/// 获取回收站目录路径（app data 目录下的 .trash）
fn get_trash_dir() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_dir().ok_or_else(|| "无法获取应用数据目录".to_string())?;
    let trash_dir = data_dir.join("com.fkemark.app").join("trash");
    if !trash_dir.exists() {
        fs::create_dir_all(&trash_dir).map_err(|e| format!("创建回收站目录失败: {}", e))?;
    }
    Ok(trash_dir)
}

fn canonical_trash_path(path: &Path) -> Result<std::path::PathBuf, String> {
    let trash_dir = get_trash_dir()?
        .canonicalize()
        .map_err(|e| format!("failed to read trash directory: {}", e))?;
    let target = path
        .canonicalize()
        .map_err(|e| format!("failed to read trash item: {}", e))?;
    if !target.starts_with(&trash_dir) {
        return Err("trash path must be inside the app trash directory".to_string());
    }
    Ok(target)
}

/// 将文件软删除到回收站
///
/// 策略：将文件移动到 app data 目录下的 trash/ 文件夹，
/// 同时记录原始路径到元数据文件，用于后续恢复。
pub fn move_to_trash(file_path: &str) -> Result<(), String> {
    let src = Path::new(file_path);
    if !src.exists() {
        return Err(format!("文件不存在: {}", src.display()));
    }

    let trash_dir = get_trash_dir()?;
    let file_name = src
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();

    // 生成唯一文件名：时间戳_原文件名
    let timestamp = chrono::Utc::now().timestamp_millis();
    let trash_file_name = format!("{}_{}", timestamp, file_name);
    let trash_file_path = trash_dir.join(&trash_file_name);

    // 移动文件到回收站
    fs::rename(src, &trash_file_path).or_else(|_| {
        // 跨盘符 rename 可能失败，用 copy + remove 兜底
        fs::copy(src, &trash_file_path).map_err(|e| format!("复制到回收站失败: {}", e))?;
        fs::remove_file(src).map_err(|e| format!("删除原文件失败: {}", e))?;
        Ok::<(), String>(())
    })?;

    // 写入元数据 JSON（记录原始路径）
    let meta = serde_json::json!({
        "originalPath": file_path,
        "deletedAt": chrono::Utc::now(),
    });
    let meta_path = trash_dir.join(format!("{}.meta.json", trash_file_name));
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("写入元数据失败: {}", e))?;

    Ok(())
}

/// 列出回收站中的所有文件
pub fn list_trash() -> Result<Vec<TrashItem>, String> {
    let trash_dir = get_trash_dir()?;
    let mut items = Vec::new();

    let entries = fs::read_dir(&trash_dir).map_err(|e| format!("读取回收站失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历回收站失败: {}", e))?;
        let path = entry.path();

        // 跳过 .meta.json 文件
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        if name.ends_with(".meta.json") {
            continue;
        }

        if !path.is_file() {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        // 尝试读取元数据获取原始路径
        let meta_path = trash_dir.join(format!("{}.meta.json", name));
        let original_path = if meta_path.exists() {
            fs::read_to_string(&meta_path)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| {
                    v.get("originalPath")
                        .and_then(|p| p.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| name.clone())
        } else {
            name.clone()
        };

        // 从文件名中去掉时间戳前缀，恢复原始文件名
        let display_name = if let Some(rest) = name.splitn(2, '_').nth(1) {
            rest.to_string()
        } else {
            name.clone()
        };

        let deleted_at = if meta_path.exists() {
            fs::read_to_string(&meta_path)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| {
                    v.get("deletedAt")
                        .and_then(|p| p.as_str())
                        .map(|s| s.to_string())
                })
                .and_then(|s| s.parse::<DateTime<Utc>>().ok())
                .unwrap_or_else(|| Utc::now())
        } else {
            // 用文件修改时间兜底
            metadata
                .modified()
                .map(|t| DateTime::from(t))
                .unwrap_or_else(|_| Utc::now())
        };

        items.push(TrashItem {
            name: display_name,
            original_path,
            trash_path: path.to_string_lossy().to_string(),
            deleted_at,
            size: metadata.len(),
        });
    }

    // 按删除时间倒序排列
    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));

    Ok(items)
}

/// 从回收站恢复文件
pub fn restore_from_trash(trash_path: &str, restore_path: &str) -> Result<(), String> {
    let src = canonical_trash_path(Path::new(trash_path))?;

    let dest = Path::new(restore_path);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }
    }

    // 如果目标已存在同名文件，追加时间戳
    let final_dest = if dest.exists() {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let file_name = dest
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let stem = Path::new(&file_name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = Path::new(&file_name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let new_name = format!("{}_{}{}", stem, timestamp, ext);
        dest.with_file_name(new_name)
    } else {
        dest.to_path_buf()
    };

    fs::rename(&src, &final_dest).or_else(|_| {
        fs::copy(&src, &final_dest).map_err(|e| format!("恢复文件失败: {}", e))?;
        fs::remove_file(&src).map_err(|e| format!("删除回收站文件失败: {}", e))?;
        Ok::<(), String>(())
    })?;

    // 删除元数据文件
    let trash_file_name = src
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let trash_dir = get_trash_dir()?;
    let meta_path = trash_dir.join(format!("{}.meta.json", trash_file_name));
    if meta_path.exists() {
        let _ = fs::remove_file(&meta_path);
    }

    Ok(())
}

/// 永久删除回收站中的文件
pub fn purge_from_trash(trash_path: &str) -> Result<(), String> {
    let src = canonical_trash_path(Path::new(trash_path))?;

    fs::remove_file(&src).map_err(|e| format!("永久删除失败: {}", e))?;

    // 删除元数据文件
    let trash_file_name = src
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let trash_dir = get_trash_dir()?;
    let meta_path = trash_dir.join(format!("{}.meta.json", trash_file_name));
    if meta_path.exists() {
        let _ = fs::remove_file(&meta_path);
    }

    Ok(())
}

/// 清空回收站
pub fn empty_trash() -> Result<(), String> {
    let trash_dir = get_trash_dir()?;
    let entries = fs::read_dir(&trash_dir).map_err(|e| format!("读取回收站失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历回收站失败: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))?;
        }
    }

    Ok(())
}

/// 将二进制数据写入文件（用于粘贴截图自动保存）
pub fn write_binary_file(file_path: &str, data: Vec<u8>) -> Result<(), String> {
    let path = Path::new(file_path);

    // 确保目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }

    fs::write(path, &data).map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(())
}

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

fn existing_file_path(file_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("目标不是文件: {}", path.display()));
    }
    Ok(path)
}

/// 使用系统文件管理器显示指定文件。
pub fn reveal_in_file_manager(file_path: &str) -> Result<(), String> {
    let path = existing_file_path(file_path)?;

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

// ── 全文搜索 ──

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub file_path: String,
    pub file_name: String,
    pub line_number: u32,         // 1-based
    pub column: u32,              // 1-based
    pub line_text: String,        // 完整行内容
    pub match_start: u32,         // 匹配起始列 (0-based)
    pub match_end: u32,           // 匹配结束列 (0-based)
    pub is_file_name_match: bool, // 是否文件名匹配
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub total_files_searched: u32,
    pub total_matches: u32,
}

/// 在指定目录中全文搜索 .md/.markdown 文件
///
/// # 参数
/// - `dir_path`: 要搜索的目录路径
/// - `query`: 搜索关键词
/// - `case_sensitive`: 是否区分大小写
/// - `use_regex`: 是否使用正则表达式
/// - `whole_word`: 是否全词匹配
pub fn search_in_files(
    dir_path: &str,
    query: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Result<SearchResult, String> {
    let root = Path::new(dir_path);
    if !root.exists() {
        return Err(format!("目录不存在: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("路径不是目录: {}", root.display()));
    }
    if query.is_empty() {
        return Ok(SearchResult {
            matches: vec![],
            total_files_searched: 0,
            total_matches: 0,
        });
    }

    // 构建正则表达式
    let pattern = if use_regex {
        query.to_string()
    } else if whole_word {
        format!(r"\b{}\b", regex::escape(query))
    } else {
        regex::escape(query)
    };

    let flags = if case_sensitive { "" } else { "(?i)" };
    let full_pattern = format!("{}{}", flags, pattern);
    let re = Regex::new(&full_pattern).map_err(|e| format!("无效的正则表达式: {}", e))?;

    let mut matches = Vec::new();
    let mut files_searched = 0u32;

    search_dir_recursive(root, root, &re, &mut matches, &mut files_searched);

    let total_matches = matches.len() as u32;

    Ok(SearchResult {
        matches,
        total_files_searched: files_searched,
        total_matches,
    })
}

fn search_dir_recursive(
    dir: &Path,
    _root: &Path,
    re: &Regex,
    matches: &mut Vec<SearchMatch>,
    files_searched: &mut u32,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 跳过隐藏文件/目录
        if name.starts_with('.') {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            search_dir_recursive(&path, _root, re, matches, files_searched);
        } else if metadata.is_file() {
            let lower = name.to_lowercase();
            if !(lower.ends_with(".md") || lower.ends_with(".markdown")) {
                continue;
            }

            *files_searched += 1;

            // 检查文件名是否匹配
            if re.is_match(&name) {
                matches.push(SearchMatch {
                    file_path: path.to_string_lossy().to_string(),
                    file_name: name.clone(),
                    line_number: 0,
                    column: 0,
                    line_text: String::new(),
                    match_start: 0,
                    match_end: 0,
                    is_file_name_match: true,
                });
            }

            // 读取文件内容并搜索
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            for (line_idx, line) in content.lines().enumerate() {
                for mat in re.find_iter(line) {
                    matches.push(SearchMatch {
                        file_path: path.to_string_lossy().to_string(),
                        file_name: name.clone(),
                        line_number: (line_idx + 1) as u32,
                        column: (mat.start() + 1) as u32,
                        line_text: line.to_string(),
                        match_start: mat.start() as u32,
                        match_end: mat.end() as u32,
                        is_file_name_match: false,
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod reveal_file_tests {
    use super::existing_file_path;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "fkemark-reveal-file-{}-{unique}-{name}",
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
    fn 拒绝目录和不存在的路径() {
        let directory = temp_path("folder");
        fs::create_dir_all(&directory).unwrap();
        let missing = directory.join("missing.md");

        assert!(existing_file_path(directory.to_str().unwrap()).is_err());
        assert!(existing_file_path(missing.to_str().unwrap()).is_err());

        fs::remove_dir_all(directory).unwrap();
    }
}
