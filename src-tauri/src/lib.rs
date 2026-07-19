// FkeMark 应用模块声明
mod file_system;
mod settings;
mod markdown;
mod updater;

use settings::AppSettings;

use std::io::{Read, Write};
use tauri::Emitter;

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

// ── 图片上传（分块复制 + 进度事件）──
// 将磁盘源文件复制到文档同级 assets/ 目录，分块读取并实时 emit 上传进度。
#[tauri::command]
async fn upload_asset(
    app: tauri::AppHandle,
    src: String,
    doc_dir: String,
    id: String,
) -> Result<String, String> {
    use std::path::{Path, PathBuf};
    let src_path = Path::new(&src);
    let file_name = src_path
        .file_name()
        .ok_or_else(|| "无效的源文件路径".to_string())?
        .to_string_lossy()
        .to_string();
    let assets_dir = Path::new(&doc_dir).join("assets");
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    // 重名处理：存在则追加 _1 / _2 ...
    let mut dest: PathBuf = assets_dir.join(&file_name);
    if dest.exists() {
        let stem = Path::new(&file_name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "image".to_string());
        let ext = Path::new(&file_name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let mut i = 1u32;
        loop {
            let candidate = assets_dir.join(format!("{}_{}{}", stem, i, ext));
            if !candidate.exists() {
                dest = candidate;
                break;
            }
            i += 1;
        }
    }

    let total = std::fs::metadata(&src_path).map_err(|e| e.to_string())?.len();
    let mut reader = std::fs::File::open(&src_path).map_err(|e| e.to_string())?;
    let mut writer = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 65536];
    let mut loaded: u64 = 0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        writer.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        loaded += n as u64;
        let _ = app.emit(
            "asset://upload-progress",
            serde_json::json!({ "id": id, "loaded": loaded, "total": total, "status": "uploading" }),
        );
    }

    let rel = format!(
        "./assets/{}",
        dest.file_name().unwrap().to_string_lossy()
    );
    let _ = app.emit(
        "asset://upload-progress",
        serde_json::json!({ "id": id, "loaded": total, "total": total, "status": "done", "src": rel }),
    );
    Ok(rel)
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
// ⚠️ 必须为 async 命令：Tauri v2 在 Windows 上，同步命令中调用
// WebviewWindowBuilder::new().build() 会死锁 WebView2，导致新窗口白屏冻结、
// 无法关闭（官方 Issue #13092）。改为 async 后窗口在独立线程创建，避免死锁。
#[tauri::command]
async fn new_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    let idx = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let label = format!("main-{}", idx);
    // URL 携带 win=secondary 参数，前端据此跳过更新检查等主窗口专属逻辑，
    // 避免新窗口重复发起网络请求与全局副作用，减少初始化负担
    WebviewWindowBuilder::new(
        &app_handle,
        &label,
        tauri::WebviewUrl::App("index.html?win=secondary".into()),
    )
    .title("FkeMark")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .decorations(false)
    // 与主窗口配置保持一致：transparent
    .transparent(true)
    .center()
    // 窗口创建时不可见，前端渲染完成后由前端调用 show() 显示，
    // 避免 index.html 的 splash 启动画面在新窗口中短暂可见造成闪烁
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── 使用配置文件新建窗口 ──
// 接受一个 JSON 配置文件路径，读取后作为新窗口的初始化参数。
// 配置结构（可选字段）：
//   { "width": 1200, "height": 800, "title": "FkeMark", "fullscreen": false }
// ⚠️ 同 new_window：必须为 async 命令，否则 Windows 上会死锁
#[tauri::command]
async fn new_window_with_config(app_handle: tauri::AppHandle, config_path: String) -> Result<(), String> {
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
        tauri::WebviewUrl::App("index.html?win=secondary".into()),
    )
    .title(&title)
    .inner_size(width, height)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .center()
    // 窗口创建时不可见，前端渲染完成后由前端调用 show() 显示，避免 splash 闪烁
    .visible(false);
    if fullscreen {
        builder = builder.fullscreen(true);
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

// ── 打开开发者工具（等同浏览器 F12）──
// 接收当前调用窗口，确保新窗口（label != "main"）也能打开自己的 DevTools
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    window.open_devtools();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 已有实例在运行：恢复并聚焦窗口，避免出现多个进程/托盘
            // 优先恢复 main 窗口（可能被隐藏到托盘）；若不存在则聚焦任意可见窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            } else {
                for (_, w) in app.webview_windows() {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                    break;
                }
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
            // 注意：tauri.conf.json 的 app.trayIcon 配置会自动创建一个无菜单/无事件的托盘实例，
            // 与此处代码创建的托盘叠加会出现"两个托盘图标"（Tauri 官方 Issue #8982）。
            // 因此已移除配置中的 trayIcon，统一在代码中创建唯一托盘并显式设置图标。
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("FkeMark")
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
            upload_asset,
            hide_to_tray,
            show_window,
            new_window,
            new_window_with_config,
            open_devtools,
            // ── 应用内更新 ──
            updater::get_download_state,
            updater::download_update,
            updater::cancel_download,
            updater::verify_update_package,
            updater::install_update,
            updater::finalize_update,
            updater::rollback_update,
        ])
        .run(tauri::generate_context!())
        .expect("启动 FkeMark 时出错");
}
