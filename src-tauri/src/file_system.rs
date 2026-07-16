use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use chrono::{DateTime, Utc};

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

pub fn read_file<P: AsRef<Path>>(path: P) -> Result<String, String> {
    let path = path.as_ref();
    
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    
    fs::read_to_string(path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

pub fn write_file<P: AsRef<Path>, C: AsRef<[u8]>>(path: P, content: C) -> Result<(), String> {
    let path = path.as_ref();
    
    // 确保目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    
    fs::write(path, content)
        .map_err(|e| format!("写入文件失败: {}", e))
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
    
    let metadata = fs::metadata(path)
        .map_err(|e| format!("获取文件信息失败: {}", e))?;
    
    let modified = metadata.modified()
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
    
    for entry in fs::read_dir(dir_path)
        .map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata()
            .map_err(|e| format!("获取文件信息失败: {}", e))?;
        
        let modified = metadata.modified()
            .map(|t| DateTime::from(t))
            .unwrap_or_else(|_| Utc::now());
            
        entries.push(FileEntry {
            name: path.file_name()
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
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
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

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let path = entry.path();
        let name = path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 跳过隐藏文件/目录（以 . 开头）
        if name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata()
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
    nodes.sort_by(|a, b| {
        match (a.node_type.as_str(), b.node_type.as_str()) {
            ("folder", "file") => std::cmp::Ordering::Less,
            ("file", "folder") => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
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
        fs::create_dir_all(&assets_dir)
            .map_err(|e| format!("创建 assets 目录失败: {}", e))?;
    }

    // 目标文件路径（处理重名）
    let mut dest_path = assets_dir.join(&file_name);
    if dest_path.exists() {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let new_name = format!("{}_{}", timestamp, file_name);
        dest_path = assets_dir.join(new_name);
    }

    // 复制文件
    fs::copy(src_path, &dest_path)
        .map_err(|e| format!("复制文件失败: {}", e))?;

    // 返回相对路径 ./assets/filename
    let final_name = dest_path
        .file_name()
        .ok_or_else(|| "无法获取目标文件名".to_string())?
        .to_string_lossy()
        .to_string();
    Ok(format!("./assets/{}", final_name))
}