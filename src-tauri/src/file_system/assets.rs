use std::fs;
use std::path::{Path, PathBuf};

fn checked_file_name(file_name: &str) -> Result<&std::ffi::OsStr, String> {
    let path = Path::new(file_name);
    if file_name.trim().is_empty()
        || path.components().count() != 1
        || path.file_name() != Some(path.as_os_str())
    {
        return Err("文件名无效".to_string());
    }
    Ok(path.as_os_str())
}

fn unique_destination(directory: &Path, file_name: &str) -> Result<PathBuf, String> {
    let checked_name = checked_file_name(file_name)?;
    let mut destination = directory.join(checked_name);
    if !destination.exists() {
        return Ok(destination);
    }

    let name_path = Path::new(file_name);
    let stem = name_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = name_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();

    let mut index = 1u32;
    loop {
        destination = directory.join(format!("{stem}_{index}{extension}"));
        if !destination.exists() {
            return Ok(destination);
        }
        index += 1;
    }
}

/// 重命名本地图片，仅允许修改同目录文件名并保持扩展名不变。
pub fn rename_image_asset(source_path: &str, new_name: &str) -> Result<String, String> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err(format!("图片文件不存在: {}", source.display()));
    }
    checked_file_name(new_name)?;

    let old_extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let new_extension = Path::new(new_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !old_extension.eq_ignore_ascii_case(new_extension) {
        return Err("重命名图片时不能修改文件扩展名".to_string());
    }

    let parent = source
        .parent()
        .ok_or_else(|| "无法获取图片目录".to_string())?;
    let destination = parent.join(new_name);
    if destination.exists() {
        return Err(format!("目标文件已存在: {}", destination.display()));
    }

    fs::rename(source, &destination).map_err(|e| format!("重命名图片失败: {e}"))?;
    Ok(destination.to_string_lossy().to_string())
}

/// 将本地图片复制到导出目录，重名时自动追加序号。
pub fn export_image_asset(
    source_path: &str,
    destination_dir: &str,
    file_name: &str,
) -> Result<String, String> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err(format!("图片文件不存在: {}", source.display()));
    }
    let directory = Path::new(destination_dir);
    if !directory.is_dir() {
        return Err(format!("导出目录不存在: {}", directory.display()));
    }

    let destination = unique_destination(directory, file_name)?;
    fs::copy(source, &destination).map_err(|e| format!("导出图片失败: {e}"))?;
    Ok(destination.to_string_lossy().to_string())
}

/// 将网络或内嵌图片数据写入导出目录，重名时自动追加序号。
pub fn write_exported_image(
    destination_dir: &str,
    file_name: &str,
    data: Vec<u8>,
) -> Result<String, String> {
    let directory = Path::new(destination_dir);
    if !directory.is_dir() {
        return Err(format!("导出目录不存在: {}", directory.display()));
    }

    let destination = unique_destination(directory, file_name)?;
    fs::write(&destination, data).map_err(|e| format!("导出图片失败: {e}"))?;
    Ok(destination.to_string_lossy().to_string())
}
/// 读取二进制文件（用于将桌面拖入图片交给所选上传方式）
pub fn read_binary_file(file_path: &str) -> Result<Vec<u8>, String> {
    fs::read(file_path).map_err(|e| format!("Failed to read binary file: {e}"))
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

#[cfg(test)]
mod image_asset_tests {
    use super::{export_image_asset, read_binary_file, rename_image_asset};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "fkemark-image-manager-{}-{unique}-{name}",
            std::process::id()
        ))
    }

    #[test]
    fn reads_binary_file_for_image_upload() {
        let directory = temp_dir("read");
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("cover.png");
        fs::write(&source, [1u8, 2, 3]).unwrap();

        assert_eq!(
            read_binary_file(source.to_str().unwrap()).unwrap(),
            [1, 2, 3]
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn 重命名图片保持目录和扩展名() {
        let directory = temp_dir("rename");
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("cover.png");
        fs::write(&source, b"image").unwrap();

        let renamed = rename_image_asset(source.to_str().unwrap(), "hero.png").unwrap();

        assert_eq!(
            std::path::PathBuf::from(renamed),
            directory.join("hero.png")
        );
        assert!(!source.exists());
        assert!(directory.join("hero.png").exists());
        assert!(rename_image_asset(
            directory.join("hero.png").to_str().unwrap(),
            "../outside.png"
        )
        .is_err());
        assert!(
            rename_image_asset(directory.join("hero.png").to_str().unwrap(), "hero.jpg").is_err()
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn 批量导出遇到重名自动追加序号() {
        let directory = temp_dir("export");
        let source_dir = directory.join("source");
        let export_dir = directory.join("export");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&export_dir).unwrap();
        let source = source_dir.join("cover.png");
        fs::write(&source, b"image").unwrap();
        fs::write(export_dir.join("cover.png"), b"existing").unwrap();

        let exported = export_image_asset(
            source.to_str().unwrap(),
            export_dir.to_str().unwrap(),
            "cover.png",
        )
        .unwrap();

        assert_eq!(
            std::path::PathBuf::from(exported),
            export_dir.join("cover_1.png")
        );
        assert_eq!(fs::read(export_dir.join("cover.png")).unwrap(), b"existing");

        fs::remove_dir_all(directory).unwrap();
    }
}
