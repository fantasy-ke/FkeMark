#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// 直接声明模块，不通过lib.rs
mod file_system;
mod settings;
mod markdown;

use settings::AppSettings;

// Manager trait 提供 get_window / emit 等方法
use tauri::Manager;

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

// 获取当前应用版本号（从 Cargo.toml 编译时注入）
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// 全文搜索：在指定目录中搜索 .md/.markdown 文件内容
#[tauri::command]
fn search_in_files(
    dir_path: String,
    query: String,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Result<file_system::SearchResult, String> {
    file_system::search_in_files(&dir_path, &query, case_sensitive, use_regex, whole_word)
}

// ── 回收站（软删除）──
#[tauri::command]
fn move_to_trash(file_path: String) -> Result<(), String> {
    file_system::move_to_trash(&file_path)
}

#[tauri::command]
fn list_trash() -> Result<Vec<file_system::TrashItem>, String> {
    file_system::list_trash()
}

#[tauri::command]
fn restore_from_trash(trash_path: String, restore_path: String) -> Result<(), String> {
    file_system::restore_from_trash(&trash_path, &restore_path)
}

#[tauri::command]
fn purge_from_trash(trash_path: String) -> Result<(), String> {
    file_system::purge_from_trash(&trash_path)
}

#[tauri::command]
fn empty_trash() -> Result<(), String> {
    file_system::empty_trash()
}

// ── 二进制文件写入（粘贴截图自动落盘）──
#[tauri::command]
fn write_binary_file(file_path: String, data: Vec<u8>) -> Result<(), String> {
    file_system::write_binary_file(&file_path, data)
}

// ── 隐藏窗口至系统托盘 ──
#[tauri::command]
fn hide_to_tray(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── 显示主窗口（从托盘恢复）──
#[tauri::command]
fn show_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    // ── 构建系统托盘菜单 ──
    let show_item = tauri::CustomMenuItem::new("show", "显示主窗口");
    let quit_item = tauri::CustomMenuItem::new("quit", "退出");
    let tray_menu = tauri::SystemTrayMenu::new()
        .add_item(show_item)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit_item);

    let system_tray = tauri::SystemTray::new()
        .with_menu(tray_menu);

    tauri::Builder::default()
        .setup(|_app| {
            println!("FkeMark 启动成功");
            Ok(())
        })
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            tauri::SystemTrayEvent::LeftClick { .. } | tauri::SystemTrayEvent::DoubleClick { .. } => {
                // 点击/双击托盘图标：显示主窗口
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            tauri::SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
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
            get_app_version,
            search_in_files,
            move_to_trash,
            list_trash,
            restore_from_trash,
            purge_from_trash,
            empty_trash,
            write_binary_file,
            hide_to_tray,
            show_window,
        ])
        .run(tauri::generate_context!())
        .expect("启动 FkeMark 时出错");
}
