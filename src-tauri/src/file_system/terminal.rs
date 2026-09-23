use std::path::{Path, PathBuf};
use std::process::Command;

/// 优先使用当前打开的目录；目录不存在时退回用户主目录，再退回进程工作目录。
pub fn resolve_terminal_directory(requested: Option<&str>, home: Option<&Path>, cwd: &Path) -> PathBuf {
    if let Some(path) = requested.map(str::trim).filter(|value| !value.is_empty()) {
        let candidate = PathBuf::from(path);
        if candidate.is_dir() {
            return candidate;
        }
        if let Some(parent) = candidate.parent() {
            if parent.is_dir() {
                return parent.to_path_buf();
            }
        }
    }
    if let Some(home) = home {
        if home.is_dir() {
            return home.to_path_buf();
        }
    }
    if cwd.is_dir() {
        return cwd.to_path_buf();
    }
    PathBuf::from(".")
}

fn home_directory() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

pub fn open_system_terminal(directory: Option<&str>) -> Result<(), String> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let dir = resolve_terminal_directory(directory, home_directory().as_deref(), &cwd);
    spawn_terminal(&dir)
}

fn spawn_terminal(dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return spawn_windows_terminal(dir);
    }
    #[cfg(target_os = "macos")]
    {
        return spawn_macos_terminal(dir);
    }
    #[cfg(target_os = "linux")]
    {
        return spawn_linux_terminal(dir);
    }
    #[allow(unreachable_code)]
    Err("当前系统不支持打开终端".to_string())
}

#[cfg(target_os = "windows")]
fn spawn_windows_terminal(dir: &Path) -> Result<(), String> {
    let dir_text = dir.to_string_lossy().to_string();
    if Command::new("wt.exe").args(["-d", &dir_text]).spawn().is_ok() {
        return Ok(());
    }
    // 没有 Windows Terminal 时新开一个 PowerShell 窗口，并停在目标目录。
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    Command::new("powershell.exe")
        .args(["-NoExit", "-NoLogo"])
        .current_dir(dir)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开终端失败: {error}"))
}

#[cfg(target_os = "macos")]
fn spawn_macos_terminal(dir: &Path) -> Result<(), String> {
    let escaped = dir.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "tell application \"Terminal\" to do script \"cd \" & quoted form of \"{escaped}\""
    );
    Command::new("osascript")
        .args(["-e", "tell application \"Terminal\" to activate", "-e", &script])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开终端失败: {error}"))
}

#[cfg(target_os = "linux")]
fn try_linux_terminal(program: &str, flag: &str, directory: &str) -> bool {
    Command::new(program).arg(flag).arg(directory).spawn().is_ok()
}

#[cfg(target_os = "linux")]
fn spawn_linux_terminal(dir: &Path) -> Result<(), String> {
    let directory = dir.to_string_lossy().to_string();
    if try_linux_terminal("gnome-terminal", "--working-directory", &directory)
        || try_linux_terminal("konsole", "--workdir", &directory)
        || try_linux_terminal("xfce4-terminal", "--working-directory", &directory)
        || try_linux_terminal("kitty", "--directory", &directory)
        || try_linux_terminal("alacritty", "--working-directory", &directory)
    {
        return Ok(());
    }
    Command::new("x-terminal-emulator")
        .current_dir(dir)
        .spawn()
        .or_else(|_| Command::new("xterm").current_dir(dir).spawn())
        .map(|_| ())
        .map_err(|error| format!("打开终端失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::resolve_terminal_directory;
    use std::env::temp_dir;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn uses_home_when_requested_directory_is_missing() {
        let home = temp_dir();
        let resolved = resolve_terminal_directory(Some("Z:/definitely-missing/folder"), Some(&home), &home);
        assert_eq!(resolved, home);
    }

    #[test]
    fn uses_parent_when_requested_path_is_a_file() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = temp_dir().join(format!("fkemark-terminal-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("note.md");
        fs::write(&file, "x").unwrap();
        let resolved = resolve_terminal_directory(file.to_str(), None, &temp_dir());
        assert_eq!(resolved, dir);
        let _ = fs::remove_dir_all(&dir);
    }
}
