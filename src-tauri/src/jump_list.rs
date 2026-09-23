use crate::settings;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

const OPEN_FOLDER_FLAG: &str = "--open-folder";
const APP_USER_MODEL_ID: &str = "com.fkemark.app";
const MAX_RECENT_FOLDERS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecentFolder {
    pub path: String,
    pub name: String,
}

pub fn folder_from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let arg = arg.as_ref();
        if let Some(path) = arg.strip_prefix("--open-folder=") {
            let path = path.trim().trim_matches('"');
            if !path.is_empty() {
                return Some(path.to_string());
            }
        }
        if arg == OPEN_FOLDER_FLAG {
            let path = args.next()?;
            let path = path.as_ref().trim().trim_matches('"');
            if !path.is_empty() {
                return Some(path.to_string());
            }
        }
    }
    None
}

fn recent_folders_path() -> std::path::PathBuf {
    settings::get_app_data_dir().join("recent-folders.json")
}

pub fn load_recent_folders() -> Vec<RecentFolder> {
    let Ok(content) = std::fs::read_to_string(recent_folders_path()) else {
        return Vec::new();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_recent_folders(folders: Vec<RecentFolder>) -> Result<(), String> {
    let folders = normalize_folders(folders);
    let content = serde_json::to_string_pretty(&folders).map_err(|error| error.to_string())?;
    std::fs::write(recent_folders_path(), content).map_err(|error| error.to_string())?;
    refresh_taskbar_jump_list(&folders);
    Ok(())
}

fn normalize_folders(folders: Vec<RecentFolder>) -> Vec<RecentFolder> {
    let mut seen = std::collections::HashSet::new();
    folders
        .into_iter()
        .filter(|folder| {
            let path = folder.path.trim();
            !path.is_empty() && Path::new(path).is_dir() && seen.insert(path.to_string())
        })
        .take(MAX_RECENT_FOLDERS)
        .map(|folder| RecentFolder {
            name: if folder.name.trim().is_empty() {
                Path::new(folder.path.trim())
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or(folder.path.trim())
                    .to_string()
            } else {
                folder.name
            },
            path: folder.path.trim().to_string(),
        })
        .collect()
}

pub fn startup_open_folder() -> Option<String> {
    folder_from_args(std::env::args()).filter(|path| Path::new(path).is_dir())
}

pub fn request_folder_window(app: &AppHandle, folder: String) {
    if !Path::new(&folder).is_dir() {
        log::warn!("最近文件夹不存在，取消打开新窗口: {folder}");
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = create_folder_window(&app, &folder) {
            log::error!("打开最近文件夹窗口失败: {error}");
        }
    });
}

fn create_folder_window(app: &AppHandle, folder: &str) -> Result<(), String> {
    let idx = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let label = format!("main-folder-{idx}");
    let url = format!("index.html?win=secondary&folder={}", query_escape(folder));
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("FkeMark")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .center()
        .visible(false)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn query_escape(value: &str) -> String {
    let mut escaped = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                escaped.push(byte as char);
            }
            _ => escaped.push_str(&format!("%{byte:02X}")),
        }
    }
    escaped
}

fn refresh_taskbar_jump_list(folders: &[RecentFolder]) {
    #[cfg(windows)]
    {
        if let Err(error) = set_windows_jump_list(folders) {
            log::warn!("更新任务栏最近文件夹失败: {error}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = folders;
    }
}

#[cfg(windows)]
fn set_windows_jump_list(folders: &[RecentFolder]) -> Result<(), String> {
    use windows::core::{Interface, PCWSTR, GUID};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
        SetCurrentProcessExplicitAppUserModelID,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let app_id = wide(APP_USER_MODEL_ID);
        let _ = SetCurrentProcessExplicitAppUserModelID(PCWSTR(app_id.as_ptr()));

        let list: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| error.to_string())?;
        list.SetAppID(PCWSTR(app_id.as_ptr())).map_err(|error| error.to_string())?;
        if folders.is_empty() {
            let _ = list.DeleteList(PCWSTR(app_id.as_ptr()));
            return Ok(());
        }

        let mut slots = 0u32;
        let _removed: IObjectArray = list.BeginList(&mut slots).map_err(|error| error.to_string())?;
        let collection: IObjectCollection = CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| error.to_string())?;
        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let exe_wide = wide(&exe.to_string_lossy());
        let title_key = PROPERTYKEY {
            fmtid: GUID::from_u128(0xF29F85E0_4FF9_1068_AB91_08002B27B3D9),
            pid: 2,
        };

        for folder in folders {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| error.to_string())?;
            let arguments = wide(&format!("{OPEN_FOLDER_FLAG} \"{}\"", folder.path.replace('"', "")));
            let description = wide(&folder.path);
            link.SetPath(PCWSTR(exe_wide.as_ptr())).map_err(|error| error.to_string())?;
            link.SetArguments(PCWSTR(arguments.as_ptr())).map_err(|error| error.to_string())?;
            link.SetDescription(PCWSTR(description.as_ptr())).map_err(|error| error.to_string())?;
            link.SetIconLocation(PCWSTR(exe_wide.as_ptr()), 0).map_err(|error| error.to_string())?;
            let store: IPropertyStore = link.cast().map_err(|error| error.to_string())?;
            let title = wide(&folder.name);
            let variant = string_variant(&title);
            store.SetValue(&title_key, &variant).map_err(|error| error.to_string())?;
            store.Commit().map_err(|error| error.to_string())?;
            collection.AddObject(&link).map_err(|error| error.to_string())?;
        }

        let items: IObjectArray = collection.cast().map_err(|error| error.to_string())?;
        let category = wide("最近文件夹");
        list.AppendCategory(PCWSTR(category.as_ptr()), &items)
            .map_err(|error| error.to_string())?;
        list.CommitList().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
fn string_variant(value: &[u16]) -> windows::Win32::System::Com::StructuredStorage::PROPVARIANT {
    use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
    use windows::Win32::System::Variant::VT_LPWSTR;
    let mut owned = value.to_vec();
    if owned.last() != Some(&0) {
        owned.push(0);
    }
    let ptr = owned.as_mut_ptr();
    std::mem::forget(owned);
    PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_LPWSTR,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 { pwszVal: windows::core::PWSTR(ptr) },
            }),
        },
    }
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::folder_from_args;

    #[test]
    fn reads_open_folder_argument() {
        let args = ["FkeMark.exe", "--open-folder", r"D:\notes"];
        assert_eq!(folder_from_args(args), Some(r"D:\notes".to_string()));
    }

    #[test]
    fn reads_equals_form_and_ignores_other_flags() {
        let args = ["app", "--other", "--open-folder=D:\\vault"];
        assert_eq!(folder_from_args(args), Some(r"D:\vault".to_string()));
    }
}
