use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub font_size: u8,
    pub font_family: String,          // 编辑器正文字体（系统字体名）
    pub markdown_font_family: String, // Markdown 视图（阅读模式）字体（'inherit' 表示跟随编辑器）
    pub markdown_font_size: u8,       // Markdown 视图字号（0 表示跟随编辑器字号）
    pub auto_save: bool,
    pub auto_save_interval: u64,
    pub line_height: String,
    pub editor_width: String,
    pub show_markers: bool,
    pub auto_bracket: bool,
    pub spell_check_enabled: bool,
    pub show_line_numbers: bool,
    pub show_minimap: bool,
    pub minimap_side: String,
    pub editor_mode: String,
    pub corner_radius: u8,
    pub button_radius: u8,
    pub toolbar_floating: bool,
    pub toolbar_position: String,
    pub language: String,
    pub focus_mode: bool,
    pub update_channel: String,  // "latest" or "dev"
    pub auto_check_update: bool, // auto-check for updates on startup
    // ── Window close behavior ──
    pub close_action: String,    // "ask" | "minimize" | "close"
    pub skip_close_prompt: bool, // user checked "don't ask again"
    // AI assistant
    pub ai_enabled: bool,
    pub ai_provider: String,
    pub ai_endpoint: String,
    pub ai_api_key: String,
    pub ai_model: String,
    pub ai_target_language: String,
    pub ai_temperature: f32,
    pub ai_markdown_prompt: String,
    // Image upload
    pub image_upload_mode: String,
    pub smms_token: String,
    pub smms_upload_url: String,
    pub custom_image_upload_url: String,
    pub custom_image_upload_token: String,
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub webdav_public_url: String,
    // ── Experimental features ──
    pub mermaid: bool, // Mermaid diagram rendering
    pub vim: bool,     // Vim editor mode
    // ── Custom keyboard shortcuts: command id -> combo string ──
    #[serde(default)]
    pub keymap: HashMap<String, String>,
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
            spell_check_enabled: true,
            show_line_numbers: false,
            show_minimap: false,
            minimap_side: "right".to_string(),
            editor_mode: "live".to_string(),
            corner_radius: 6,
            button_radius: 4,
            toolbar_floating: true,
            toolbar_position: "top".to_string(),
            language: "zh-CN".to_string(),
            focus_mode: false,
            update_channel: option_env!("UPDATE_CHANNEL")
                .unwrap_or("latest")
                .to_string(),
            auto_check_update: true,
            // ── Window close behavior defaults ──
            close_action: "ask".to_string(),
            skip_close_prompt: false,
            // AI assistant defaults
            ai_enabled: false,
            ai_provider: "local".to_string(),
            ai_endpoint: "http://localhost:11434/v1/chat/completions".to_string(),
            ai_api_key: String::new(),
            ai_model: "llama3.1".to_string(),
            ai_target_language: "English".to_string(),
            ai_temperature: 0.3,
            ai_markdown_prompt: "You are an AI assistant for Markdown writing. Help the user reason, edit, and organize content while preserving Markdown structure. Respond in the user's language unless asked otherwise.".to_string(),
            // Image upload defaults
            image_upload_mode: "local".to_string(),
            smms_token: String::new(),
            smms_upload_url: "https://sm.ms/api/v2/upload".to_string(),
            custom_image_upload_url: String::new(),
            custom_image_upload_token: String::new(),
            webdav_url: String::new(),
            webdav_username: String::new(),
            webdav_password: String::new(),
            webdav_public_url: String::new(),
            // ── Experimental features defaults ──
            mermaid: false,
            vim: false,
            // ── Custom keyboard shortcuts (empty -> frontend fills defaults) ──
            keymap: HashMap::new(),
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
        let content = fs::read_to_string(settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

/// 保存设置到文件系统
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let settings_path = get_app_data_dir().join("settings.json");
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(settings_path, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

    #[test]
    fn old_settings_default_toolbar_position_to_top() {
        let settings: AppSettings = serde_json::from_str(r#"{"toolbarFloating":false}"#).unwrap();

        assert!(!settings.toolbar_floating);
        assert_eq!(settings.toolbar_position, "top");
    }

    #[test]
    fn old_settings_enable_spell_check() {
        let settings: AppSettings = serde_json::from_str(r#"{"toolbarFloating":false}"#).unwrap();

        assert!(settings.spell_check_enabled);
    }

    #[test]
    fn old_settings_default_ai_fields() {
        let settings: AppSettings = serde_json::from_str(r#"{"toolbarFloating":false}"#).unwrap();

        assert!(!settings.ai_enabled);
        assert_eq!(settings.ai_provider, "local");
        assert_eq!(
            settings.ai_endpoint,
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(settings.ai_api_key, "");
        assert_eq!(settings.ai_model, "llama3.1");
        assert_eq!(settings.ai_target_language, "English");
        assert!((settings.ai_temperature - 0.3).abs() < f32::EPSILON);
        assert!(settings.ai_markdown_prompt.contains("Markdown writing"));
    }

    #[test]
    fn old_settings_default_image_upload_fields() {
        let settings: AppSettings = serde_json::from_str(r#"{"toolbarFloating":false}"#).unwrap();

        assert_eq!(settings.image_upload_mode, "local");
        assert_eq!(settings.smms_token, "");
        assert_eq!(settings.smms_upload_url, "https://sm.ms/api/v2/upload");
        assert_eq!(settings.custom_image_upload_url, "");
        assert_eq!(settings.custom_image_upload_token, "");
        assert_eq!(settings.webdav_url, "");
        assert_eq!(settings.webdav_username, "");
        assert_eq!(settings.webdav_password, "");
        assert_eq!(settings.webdav_public_url, "");
    }
}
