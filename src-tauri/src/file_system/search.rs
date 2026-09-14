use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub file_path: String,
    pub file_name: String,
    pub line_number: u32,
    pub column: u32,
    pub line_text: String,
    pub match_start: u32,
    pub match_end: u32,
    pub is_file_name_match: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub total_files_searched: u32,
    pub total_matches: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceFileResult {
    pub file_path: String,
    pub content: String,
    pub replacements: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    pub files: Vec<ReplaceFileResult>,
    pub total_files_changed: u32,
    pub total_replacements: u32,
}

pub fn search_in_files(
    dir_path: &str,
    query: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Result<SearchResult, String> {
    let root = validate_root(dir_path)?;
    if query.is_empty() {
        return Ok(SearchResult {
            matches: vec![],
            total_files_searched: 0,
            total_matches: 0,
        });
    }

    let re = build_regex(query, case_sensitive, use_regex, whole_word)?;
    let mut files = Vec::new();
    collect_files(&root, &mut files);
    files.sort_unstable();

    let mut matches = Vec::new();
    let mut files_searched = 0u32;
    for path in files {
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        files_searched += 1;
        append_file_matches(&path, &content, &re, &mut matches);
    }

    let total_matches = matches.len() as u32;
    Ok(SearchResult {
        matches,
        total_files_searched: files_searched,
        total_matches,
    })
}

pub fn replace_in_files(
    dir_path: &str,
    query: &str,
    replacement: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Result<ReplaceResult, String> {
    let root = validate_root(dir_path)?;
    if query.is_empty() {
        return Ok(ReplaceResult {
            files: vec![],
            total_files_changed: 0,
            total_replacements: 0,
        });
    }

    let re = build_regex(query, case_sensitive, use_regex, whole_word)?;
    let mut paths = Vec::new();
    collect_files(&root, &mut paths);
    paths.sort_unstable();

    let mut pending = Vec::new();
    for path in paths {
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let replacements = re.find_iter(&content).count() as u32;
        if replacements == 0 {
            continue;
        }
        let updated = if use_regex {
            re.replace_all(&content, replacement).into_owned()
        } else {
            re.replace_all(&content, |_: &regex::Captures<'_>| replacement)
                .into_owned()
        };
        pending.push(ReplaceFileResult {
            file_path: path.to_string_lossy().into_owned(),
            content: updated,
            replacements,
        });
    }

    let total_replacements = pending.iter().map(|file| file.replacements).sum();
    for file in &pending {
        write_replaced_file(Path::new(&file.file_path), &file.content)?;
    }

    Ok(ReplaceResult {
        total_files_changed: pending.len() as u32,
        total_replacements,
        files: pending,
    })
}

fn validate_root(dir_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(dir_path);
    if !root.exists() {
        return Err(format!("目录不存在: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("路径不是目录: {}", root.display()));
    }
    Ok(root)
}

fn build_regex(
    query: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Result<Regex, String> {
    let pattern = if use_regex {
        query.to_string()
    } else if whole_word {
        format!(r"\b{}\b", regex::escape(query))
    } else {
        regex::escape(query)
    };
    let flags = if case_sensitive { "" } else { "(?i)" };
    Regex::new(&format!("{flags}{pattern}")).map_err(|error| format!("无效的正则表达式: {error}"))
}

fn collect_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            if matches!(
                name.as_ref(),
                "node_modules" | "target" | "dist" | "release"
            ) {
                continue;
            }
            collect_files(&path, files);
        } else if metadata.is_file() {
            files.push(path);
        }
    }
}

fn append_file_matches(path: &Path, content: &str, re: &Regex, matches: &mut Vec<SearchMatch>) {
    let file_path = path.to_string_lossy().into_owned();
    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    if re.is_match(&file_name) {
        matches.push(SearchMatch {
            file_path: file_path.clone(),
            file_name: file_name.clone(),
            line_number: 0,
            column: 0,
            line_text: String::new(),
            match_start: 0,
            match_end: 0,
            is_file_name_match: true,
        });
    }

    for (line_idx, line) in content.lines().enumerate() {
        for mat in re.find_iter(line) {
            let start = utf16_index(&line[..mat.start()]);
            let end = utf16_index(&line[..mat.end()]);
            matches.push(SearchMatch {
                file_path: file_path.clone(),
                file_name: file_name.clone(),
                line_number: (line_idx + 1) as u32,
                column: start + 1,
                line_text: line.to_string(),
                match_start: start,
                match_end: end,
                is_file_name_match: false,
            });
        }
    }
}

fn utf16_index(text: &str) -> u32 {
    text.encode_utf16().count() as u32
}

fn write_replaced_file(path: &Path, content: &str) -> Result<(), String> {
    let is_markdown = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        });
    if is_markdown {
        let path_string = path.to_string_lossy();
        return super::version_history::write_file_with_snapshot(
            &path_string,
            content.as_bytes(),
            None,
        )
        .map(|_| ());
    }
    let temp_path = path.with_extension(format!("fkemark-replace-{}.tmp", std::process::id()));
    fs::write(&temp_path, content).map_err(|error| format!("写入替换临时文件失败: {error}"))?;
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        fs::write(path, content)
            .map_err(|write_error| format!("替换文件失败: {error}; 回退写入失败: {write_error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{replace_in_files, search_in_files};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("fkemark-search-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    #[test]
    fn 搜索所有文本文件并保留_unicode列位置() {
        let dir = temp_dir();
        fs::write(dir.join("note.md"), "中文目标\n第二行目标").unwrap();
        fs::write(dir.join("plain.txt"), "目标").unwrap();
        fs::write(dir.join(".hidden.md"), "目标").unwrap();
        let result = search_in_files(dir.to_str().unwrap(), "目标", true, false, false).unwrap();
        assert_eq!(result.total_files_searched, 2);
        assert_eq!(result.total_matches, 3);
        assert_eq!(result.matches[0].match_start, 2);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 批量替换会返回修改后的文件内容() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "one one").unwrap();
        let result =
            replace_in_files(dir.to_str().unwrap(), "one", "two", true, false, false).unwrap();
        assert_eq!(result.total_files_changed, 1);
        assert_eq!(result.total_replacements, 2);
        assert_eq!(result.files[0].content, "two two");
        assert_eq!(fs::read_to_string(path).unwrap(), "two two");
        fs::remove_dir_all(dir).unwrap();
    }
}
