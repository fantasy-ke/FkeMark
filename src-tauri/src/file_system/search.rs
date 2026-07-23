use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub file_path: String,
    pub file_name: String,
    pub line_number: u32,         // 1-based
    pub column: u32,              // 1-based
    pub line_text: String,        // 完整行内容
    pub match_start: u32,         // 匹配起始列 (0-based)
    pub match_end: u32,           // 匹配结束列 (0-based)
    pub is_file_name_match: bool, // 是否文件名匹配
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub total_files_searched: u32,
    pub total_matches: u32,
}

/// 在指定目录中全文搜索 .md/.markdown 文件
///
/// # 参数
/// - `dir_path`: 要搜索的目录路径
/// - `query`: 搜索关键词
/// - `case_sensitive`: 是否区分大小写
/// - `use_regex`: 是否使用正则表达式
/// - `whole_word`: 是否全词匹配
pub fn search_in_files(
    dir_path: &str,
    query: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Result<SearchResult, String> {
    let root = Path::new(dir_path);
    if !root.exists() {
        return Err(format!("目录不存在: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("路径不是目录: {}", root.display()));
    }
    if query.is_empty() {
        return Ok(SearchResult {
            matches: vec![],
            total_files_searched: 0,
            total_matches: 0,
        });
    }

    // 构建正则表达式
    let pattern = if use_regex {
        query.to_string()
    } else if whole_word {
        format!(r"\b{}\b", regex::escape(query))
    } else {
        regex::escape(query)
    };

    let flags = if case_sensitive { "" } else { "(?i)" };
    let full_pattern = format!("{}{}", flags, pattern);
    let re = Regex::new(&full_pattern).map_err(|e| format!("无效的正则表达式: {}", e))?;

    let mut matches = Vec::new();
    let mut files_searched = 0u32;

    search_dir_recursive(root, root, &re, &mut matches, &mut files_searched);

    let total_matches = matches.len() as u32;

    Ok(SearchResult {
        matches,
        total_files_searched: files_searched,
        total_matches,
    })
}

fn search_dir_recursive(
    dir: &Path,
    _root: &Path,
    re: &Regex,
    matches: &mut Vec<SearchMatch>,
    files_searched: &mut u32,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 跳过隐藏文件/目录
        if name.starts_with('.') {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            search_dir_recursive(&path, _root, re, matches, files_searched);
        } else if metadata.is_file() {
            let lower = name.to_lowercase();
            if !(lower.ends_with(".md") || lower.ends_with(".markdown")) {
                continue;
            }

            *files_searched += 1;

            // 检查文件名是否匹配
            if re.is_match(&name) {
                matches.push(SearchMatch {
                    file_path: path.to_string_lossy().to_string(),
                    file_name: name.clone(),
                    line_number: 0,
                    column: 0,
                    line_text: String::new(),
                    match_start: 0,
                    match_end: 0,
                    is_file_name_match: true,
                });
            }

            // 读取文件内容并搜索
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            for (line_idx, line) in content.lines().enumerate() {
                for mat in re.find_iter(line) {
                    matches.push(SearchMatch {
                        file_path: path.to_string_lossy().to_string(),
                        file_name: name.clone(),
                        line_number: (line_idx + 1) as u32,
                        column: (mat.start() + 1) as u32,
                        line_text: line.to_string(),
                        match_start: mat.start() as u32,
                        match_end: mat.end() as u32,
                        is_file_name_match: false,
                    });
                }
            }
        }
    }
}
