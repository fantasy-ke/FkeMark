use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub font_size: u8,
    pub font_family: String,           // 编辑器正文字体（系统字体名）
    pub markdown_font_family: String,  // Markdown 视图（阅读模式）字体（'inherit' 表示跟随编辑器）
    pub markdown_font_size: u8,         // Markdown 视图字号（0 表示跟随编辑器字号）
    pub auto_save: bool,
    pub auto_save_interval: u64,
    pub line_height: String,
    pub editor_width: String,
    pub show_markers: bool,
    pub auto_bracket: bool,
    pub show_line_numbers: bool,
    pub show_minimap: bool,
    pub minimap_side: String,
    pub editor_mode: String,
    pub corner_radius: u8,
    pub button_radius: u8,
    pub toolbar_floating: bool,
    pub language: String,
    pub focus_mode: bool,
    pub update_channel: String,   // "latest" or "dev"
    pub auto_check_update: bool, // auto-check for updates on startup
    // ── Window close behavior ──
    pub close_action: String,          // "ask" | "minimize" | "close"
    pub skip_close_prompt: bool,       // user checked "don't ask again"
    // ── Experimental features ──
    pub mermaid: bool,                 // Mermaid diagram rendering
    pub vim: bool,                     // Vim editor mode
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 16,
            font_family: "system-ui".to_string(),
            markdown_font_family: "inherit".to_string(),
            markdown_font_size: 0,
            auto_save: true,
            auto_save_interval: 300,
            line_height: "normal".to_string(),
            editor_width: "medium".to_string(),
            show_markers: true,
            auto_bracket: true,
            show_line_numbers: false,
            show_minimap: false,
            minimap_side: "right".to_string(),
            editor_mode: "live".to_string(),
            corner_radius: 6,
            button_radius: 4,
            toolbar_floating: true,
            language: "zh-CN".to_string(),
            focus_mode: false,
            update_channel: option_env!("UPDATE_CHANNEL").unwrap_or("latest").to_string(),
            auto_check_update: true,
            // ── Window close behavior defaults ──
            close_action: "ask".to_string(),
            skip_close_prompt: false,
            // ── Experimental features defaults ──
            mermaid: false,
            vim: false,
        }
    }
}

/// 获取应用数据目录
pub fn get_app_data_dir() -> PathBuf {
    let mut app_dir = dirs::config_dir().unwrap_or(PathBuf::from("."));
    app_dir.push("FkeMark");

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).unwrap();
    }

    app_dir
}

/// 从文件系统加载设置
pub fn load_settings() -> Result<AppSettings, String> {
    let settings_path = get_app_data_dir().join("settings.json");

    if settings_path.exists() {
        let content = fs::read_to_string(settings_path)
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&content)
            .map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

/// 保存设置到文件系统
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let settings_path = get_app_data_dir().join("settings.json");
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| e.to_string())?;
    fs::write(settings_path, content)
        .map_err(|e| e.to_string())
}
