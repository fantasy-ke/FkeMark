#[cfg(all(windows, target_arch = "x86_64"))]
#[path = "wechat_ocr_windows.rs"]
mod platform;
#[cfg(all(windows, target_arch = "x86_64"))]
pub(super) use platform::{image_format, installed, run};

#[tauri::command]
pub async fn is_wechat_ocr_installed(_app: tauri::AppHandle) -> Option<bool> {
    #[cfg(all(windows, target_arch = "x86_64"))]
    return Some(platform::installed(&_app).is_some());
    #[cfg(not(all(windows, target_arch = "x86_64")))]
    None
}

#[tauri::command]
pub async fn install_wechat_ocr(_app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(all(windows, target_arch = "x86_64"))]
    return platform::install(&_app).await.map_err(Into::into);
    #[cfg(not(all(windows, target_arch = "x86_64")))]
    Err("component_unavailable".into())
}
