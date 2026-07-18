// FkeMark 应用模块声明
mod file_system;
mod settings;
mod markdown;

use settings::AppSettings;

// Manager trait 提供 get_webview_window / emit 等方法
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

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
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── 显示主窗口（从托盘恢复）──
#[tauri::command]
fn show_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── 新建一个独立窗口（与主窗口共用同一前端）──
#[tauri::command]
fn new_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    let idx = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let label = format!("main-{}", idx);
    WebviewWindowBuilder::new(
        &app_handle,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("FkeMark")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .decorations(false)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── 使用配置文件新建窗口 ──
// 接受一个 JSON 配置文件路径，读取后作为新窗口的初始化参数。
// 配置结构（可选字段）：
//   { "width": 1200, "height": 800, "title": "FkeMark", "fullscreen": false }
#[tauri::command]
fn new_window_with_config(app_handle: tauri::AppHandle, config_path: String) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    let cfg: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;

    let width = cfg.get("width").and_then(|v| v.as_f64()).unwrap_or(1200.0);
    let height = cfg.get("height").and_then(|v| v.as_f64()).unwrap_or(800.0);
    let title = cfg.get("title").and_then(|v| v.as_str()).unwrap_or("FkeMark").to_string();
    let fullscreen = cfg.get("fullscreen").and_then(|v| v.as_bool()).unwrap_or(false);

    let idx = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let label = format!("main-cfg-{}", idx);
    let mut builder = WebviewWindowBuilder::new(
        &app_handle,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(&title)
    .inner_size(width, height)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .decorations(false)
    .center();
    if fullscreen {
        builder = builder.fullscreen(true);
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

// ── 打开开发者工具（等同浏览器 F12）──
#[tauri::command]
fn open_devtools(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.open_devtools();
        Ok(())
    } else {
        Err("未找到主窗口".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 已有实例在运行：聚焦主窗口（若隐藏则显示），避免出现多个托盘图标
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            println!("FkeMark 启动成功");

            // ── 构建系统托盘菜单 ──
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&separator)
                .item(&quit_item)
                .build()?;

            // ── 构建托盘图标 ──
            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

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
            new_window,
            new_window_with_config,
            open_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("启动 FkeMark 时出错");
}
