use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub font_size: u8,
    pub auto_save: bool,
    pub auto_save_interval: u64,
    pub line_height: String,
    pub editor_width: String,
    pub show_markers: bool,
    pub auto_bracket: bool,
    pub show_line_numbers: bool,
    pub mini_sidebar: bool,
    pub show_minimap: bool,
    pub minimap_side: String,
    pub editor_mode: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 16,
            auto_save: true,
            auto_save_interval: 300,
            line_height: "normal".to_string(),
            editor_width: "medium".to_string(),
            show_markers: true,
            auto_bracket: true,
            show_line_numbers: false,
            mini_sidebar: false,
            show_minimap: false,
            minimap_side: "right".to_string(),
            editor_mode: "live".to_string(),
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
