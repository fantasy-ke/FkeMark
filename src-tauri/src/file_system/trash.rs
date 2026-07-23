use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

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
