use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::settings::get_app_data_dir;

const SESSION_FILE_NAME: &str = "session.json";
const MAX_SESSION_TABS: usize = 50;
const SESSION_VERSION: u32 = 1;

/// 启动会话：只保存路径，重启后按路径重新读取文件内容。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionState {
    pub version: u32,
    pub folder_path: Option<String>,
    pub tabs: Vec<String>,
    pub active_tab_path: Option<String>,
}

fn session_file_path() -> PathBuf {
    get_app_data_dir().join(SESSION_FILE_NAME)
}

/// 统一大小写与分隔符，用于去重和匹配当前标签。
fn path_key(path: &str) -> String {
    path.trim()
        .trim_end_matches(|c| c == '\\' || c == '/')
        .replace('\\', "/")
        .to_lowercase()
}

impl SessionState {
    /// 过滤非法/重复路径、截断过多标签，并校验当前标签仍在标签列表中。
    fn normalized(mut self) -> Self {
        let mut seen: Vec<String> = Vec::new();
        let mut tabs = Vec::new();
        for raw in self.tabs {
            let path = raw.trim().to_string();
            if path.is_empty() || path.contains('\0') {
                continue;
            }
            let key = path_key(&path);
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            tabs.push(path);
            if tabs.len() >= MAX_SESSION_TABS {
                break;
            }
        }
        self.tabs = tabs;

        self.folder_path = self
            .folder_path
            .map(|folder| folder.trim().to_string())
            .filter(|folder| !folder.is_empty());

        self.active_tab_path = match self.active_tab_path {
            Some(active)
                if self
                    .tabs
                    .iter()
                    .any(|path| path_key(path) == path_key(&active)) =>
            {
                Some(active)
            }
            _ => None,
        };

        if self.version == 0 {
            self.version = SESSION_VERSION;
        }
        self
    }

    /// 没有任何文件且没有文件夹时不需要写盘。
    fn is_restorable(&self) -> bool {
        !self.tabs.is_empty() || self.folder_path.is_some()
    }
}

/// 读取会话文件；文件缺失或损坏时按“无会话”处理，不阻断启动。
pub fn load_session_state() -> Result<Option<SessionState>, String> {
    let path = session_file_path();
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let session = match serde_json::from_str::<SessionState>(&content) {
        Ok(session) => session.normalized(),
        Err(error) => {
            log::warn!("会话文件解析失败，按无会话处理: {error}");
            return Ok(None);
        }
    };
    Ok(session.is_restorable().then_some(session))
}

/// 原子写入会话文件：先写临时文件再替换，避免异常退出留下半个 JSON。
pub fn save_session_state(session: SessionState) -> Result<(), String> {
    let session = session.normalized();
    if !session.is_restorable() {
        return clear_session_state();
    }
    let path = session_file_path();
    let content = serde_json::to_string_pretty(&session).map_err(|error| error.to_string())?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, &path).map_err(|error| error.to_string())
}

/// 用户手动关闭全部标签且未打开文件夹时删除会话文件。
pub fn clear_session_state() -> Result<(), String> {
    let path = session_file_path();
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{path_key, SessionState, MAX_SESSION_TABS, SESSION_VERSION};

    #[test]
    fn session_uses_camel_case_fields() {
        let json = r#"{
            "version": 1,
            "folderPath": "D:/notes",
            "tabs": ["D:/notes/a.md"],
            "activeTabPath": "D:/notes/a.md"
        }"#;

        let session: SessionState = serde_json::from_str(json).unwrap();
        assert_eq!(session.folder_path.as_deref(), Some("D:/notes"));
        assert_eq!(session.active_tab_path.as_deref(), Some("D:/notes/a.md"));

        let serialized = serde_json::to_string(&session).unwrap();
        assert!(serialized.contains("\"folderPath\""));
        assert!(serialized.contains("\"activeTabPath\""));
    }

    #[test]
    fn missing_fields_use_defaults() {
        let session: SessionState = serde_json::from_str("{}").unwrap();
        assert_eq!(session.version, 0);
        assert!(session.folder_path.is_none());
        assert!(session.tabs.is_empty());
        assert!(session.active_tab_path.is_none());
    }

    #[test]
    fn normalization_drops_invalid_and_duplicate_paths() {
        let session = SessionState {
            version: 0,
            folder_path: Some("  D:/notes  ".to_string()),
            tabs: vec![
                "D:/notes/a.md".to_string(),
                "D:\\notes\\A.md".to_string(),
                String::new(),
                "   ".to_string(),
                "D:/notes/b.md".to_string(),
            ],
            active_tab_path: Some("D:\\notes\\A.MD".to_string()),
        }
        .normalized();

        assert_eq!(session.version, SESSION_VERSION);
        assert_eq!(session.folder_path.as_deref(), Some("D:/notes"));
        assert_eq!(session.tabs, vec!["D:/notes/a.md", "D:/notes/b.md"]);
        assert_eq!(session.active_tab_path.as_deref(), Some("D:\\notes\\A.MD"));
    }

    #[test]
    fn active_tab_must_exist_in_tabs() {
        let session = SessionState {
            version: SESSION_VERSION,
            folder_path: None,
            tabs: vec!["D:/notes/a.md".to_string()],
            active_tab_path: Some("D:/notes/missing.md".to_string()),
        }
        .normalized();

        assert!(session.active_tab_path.is_none());
    }

    #[test]
    fn tabs_are_truncated() {
        let tabs = (0..MAX_SESSION_TABS + 10)
            .map(|index| format!("D:/notes/{index}.md"))
            .collect();
        let session = SessionState {
            version: SESSION_VERSION,
            folder_path: None,
            tabs,
            active_tab_path: None,
        }
        .normalized();

        assert_eq!(session.tabs.len(), MAX_SESSION_TABS);
    }

    #[test]
    fn path_key_normalizes_separator_and_case() {
        assert_eq!(path_key("D:\\Notes\\A.MD "), path_key("d:/notes/a.md"));
        assert_eq!(path_key("D:/notes/"), "d:/notes");
    }
}
