#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// 直接声明模块，不通过lib.rs
mod file_system;
mod settings;
mod markdown;

use settings::AppSettings;

// 读取文件
#[tauri::command]
fn read_file_command(path: String) -> Result<String, String> {
    file_system::read_file(&path)
}

// 写入文件
#[tauri::command]
fn write_file_command(path: String, content: String) -> Result<(), String> {
    file_system::write_file(&path, content.as_bytes())
}

// 获取文件信息
#[tauri::command]
fn get_file_info(path: String) -> Result<file_system::FileMetadata, String> {
    file_system::get_file_info(&path)
}

// 列出目录
#[tauri::command]
fn list_directory(path: String) -> Result<Vec<file_system::FileEntry>, String> {
    file_system::list_directory(&path)
}

// 递归扫描目录（返回文件树，只含 .md 文件）
#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<file_system::FileTreeNode>, String> {
    file_system::scan_directory(&path)
}

// 复制图片资源到文档同级 assets 目录
#[tauri::command]
fn copy_asset_to_assets(src: String, doc_dir: String) -> Result<String, String> {
    file_system::copy_asset_to_assets(&src, &doc_dir)
}

// 获取设置
#[tauri::command]
fn get_settings() -> Result<AppSettings, String> {
    settings::load_settings()
}

// 保存设置
#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    settings::save_settings(&settings)
}

// 枚举本机已安装字体家族（用于字体切换）
#[tauri::command]
fn get_system_fonts() -> Result<Vec<String>, String> {
    font_kit::source::SystemSource::new()
        .all_families()
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            println!("FkeMark 启动成功");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_command,
            write_file_command,
            get_file_info,
            list_directory,
            scan_directory,
            copy_asset_to_assets,
            get_settings,
            save_settings,
            get_system_fonts,
        ])
        .run(tauri::generate_context!())
        .expect("启动 FkeMark 时出错");
}
