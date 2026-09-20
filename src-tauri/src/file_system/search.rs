use super::replacement_writer::{restore_replaced_file, write_replaced_file};
use super::search_index::{collect_files, invalidate_index, with_index, IndexedFile, SearchIndex};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 单个文件最多返回的匹配数，避免个别文件产生海量结果拖垮界面。
const MAX_MATCHES_PER_FILE: usize = 50;
/// 单次搜索最多返回的匹配总数，用于限制跨进程传输的结果体积。
const MAX_TOTAL_MATCHES: usize = 500;
/// 并行扫描允许使用的最大线程数，避免在超大核心数机器上过度切分。
const MAX_WORKERS: usize = 8;

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

struct PendingReplacement {
    result: ReplaceFileResult,
    original: String,
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
    // 走内容索引：重复搜索只需一次目录遍历和 stat，不必重读整仓库。
    Ok(with_index(&root, |index| scan_index(index, &re)))
}

/// 在索引内容上并行执行匹配。
///
/// 文件先按路径排序再分片，并按分片顺序合并结果，因此并行扫描的输出顺序与
/// 原来的单线程遍历完全一致，调用方看到的匹配排列不会随线程调度变化。
fn scan_index(index: &SearchIndex, re: &Regex) -> SearchResult {
    let mut entries: Vec<(&PathBuf, &IndexedFile)> = index.files().iter().collect();
    entries.sort_unstable_by(|left, right| left.0.cmp(right.0));

    let total_files_searched = entries.len() as u32;
    if entries.is_empty() {
        return SearchResult {
            matches: vec![],
            total_files_searched,
            total_matches: 0,
        };
    }

    let worker_count = worker_count();
    let chunk_size = entries.len().div_ceil(worker_count).max(1);
    let chunks: Vec<&[(&PathBuf, &IndexedFile)]> = entries.chunks(chunk_size).collect();

    let per_chunk: Vec<Vec<SearchMatch>> = std::thread::scope(|scope| {
        let handles: Vec<_> = chunks
            .iter()
            .map(|chunk| scope.spawn(move || scan_chunk(chunk, re)))
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().unwrap_or_default())
            .collect()
    });

    let mut matches = Vec::new();
    for chunk_matches in per_chunk {
        matches.extend(chunk_matches);
    }
    if matches.len() > MAX_TOTAL_MATCHES {
        matches.truncate(MAX_TOTAL_MATCHES);
    }

    SearchResult {
        total_matches: matches.len() as u32,
        matches,
        total_files_searched,
    }
}

/// 扫描一个分片；分片内保持文件顺序。
fn scan_chunk(entries: &[(&PathBuf, &IndexedFile)], re: &Regex) -> Vec<SearchMatch> {
    let mut matches = Vec::new();
    for (path, file) in entries {
        append_file_matches(path, &file.content, re, &mut matches);
    }
    matches
}

/// 可用并行度，取 CPU 核心数并受上限约束。
fn worker_count() -> usize {
    std::thread::available_parallelism()
        .map_or(1, |value| value.get())
        .clamp(1, MAX_WORKERS)
}

pub fn replace_in_files(
    dir_path: &str,
    query: &str,
    replacement: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
    snapshot_limit: usize,
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
        pending.push(PendingReplacement {
            result: ReplaceFileResult {
                file_path: path.to_string_lossy().into_owned(),
                content: updated,
                replacements,
            },
            original: content,
        });
    }

    let total_replacements = pending.iter().map(|file| file.result.replacements).sum();
    let _write_guard = super::lock_file_writes()?;
    // 先为每个 markdown 文件创建替换前快照，快照失败则中止本次替换，
    // 保证替换成功时一定存在可回退的版本记录。
    for file in &pending {
        if !is_markdown_path(Path::new(&file.result.file_path)) {
            continue;
        }
        super::version_history::create_snapshot_unlocked(
            &file.result.file_path,
            &file.original,
            Some(snapshot_limit),
        )
        .map_err(|error| format!("批量替换前保存版本快照失败: {error}"))?;
    }
    write_pending_files(&pending, write_replaced_file, restore_replaced_file)?;
    // 磁盘内容已改变，清空索引避免后续搜索读到替换前的缓存内容。
    invalidate_index();
    let files = pending
        .into_iter()
        .map(|file| file.result)
        .collect::<Vec<_>>();

    Ok(ReplaceResult {
        total_files_changed: files.len() as u32,
        total_replacements,
        files,
    })
}

fn write_pending_files<F, R>(
    pending: &[PendingReplacement],
    mut write: F,
    mut restore: R,
) -> Result<(), String>
where
    F: FnMut(&Path, &str, &str) -> Result<(), String>,
    R: FnMut(&Path, &str, &str) -> Result<(), String>,
{
    for (failed_index, file) in pending.iter().enumerate() {
        if let Err(error) = write(
            Path::new(&file.result.file_path),
            &file.result.content,
            &file.original,
        ) {
            let mut rollback_errors = Vec::new();
            // 只回滚已确认写入成功的文件；当前失败的文件本身未被修改。
            for written in pending[..failed_index].iter().rev() {
                if let Err(rollback_error) = restore(
                    Path::new(&written.result.file_path),
                    &written.original,
                    &written.result.content,
                ) {
                    rollback_errors.push(format!("{}: {rollback_error}", written.result.file_path));
                }
            }
            if rollback_errors.is_empty() {
                return Err(format!("批量替换写入失败: {error}；已回滚本次批量替换"));
            }
            return Err(format!(
                "批量替换写入失败: {error}；回滚失败: {}",
                rollback_errors.join("；")
            ));
        }
    }
    Ok(())
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        })
}

fn validate_root(dir_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(dir_path);
    let metadata = fs::symlink_metadata(&root)
        .map_err(|error| format!("无法访问目录 {}: {error}", root.display()))?;
    // 目录内部的符号链接不会被递归，根路径同样拒绝符号链接，避免搜索越出预期范围。
    if metadata.file_type().is_symlink() {
        return Err(format!("不支持通过符号链接搜索目录: {}", root.display()));
    }
    if !metadata.file_type().is_dir() {
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
    let flags = if case_sensitive { "mR" } else { "imR" };
    Regex::new(&format!("(?{flags}){pattern}"))
        .map_err(|error| format!("无效的正则表达式: {error}"))
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

    // 搜索和替换都基于完整文件内容，跨行匹配时结果展示起始行的可见部分。
    let mut added = 0usize;
    for mat in re.find_iter(content) {
        // 单个文件的结果数量封顶，避免重复度高的文件淹没其它文件的结果。
        if added >= MAX_MATCHES_PER_FILE {
            break;
        }
        let (line_start, line_end, line_number) = line_bounds(content, mat.start());
        let display_start = mat.start().max(line_start).min(line_end);
        let display_end = mat.end().max(display_start).min(line_end);
        let line_text = &content[line_start..line_end];
        let match_start = utf16_index(&content[line_start..display_start]);
        let match_end = utf16_index(&content[line_start..display_end]);
        matches.push(SearchMatch {
            file_path: file_path.clone(),
            file_name: file_name.clone(),
            line_number,
            column: match_start + 1,
            line_text: line_text.to_string(),
            match_start,
            match_end,
            is_file_name_match: false,
        });
        added += 1;
    }
}

fn line_bounds(content: &str, offset: usize) -> (usize, usize, u32) {
    let offset = offset.min(content.len());
    let line_start = content[..offset].rfind('\n').map_or(0, |index| index + 1);
    let raw_line_end = content[offset..]
        .find('\n')
        .map_or(content.len(), |index| offset + index);
    let line_end = if raw_line_end > line_start && content.as_bytes()[raw_line_end - 1] == b'\r' {
        raw_line_end - 1
    } else {
        raw_line_end
    };
    let line_number = (content[..line_start]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1) as u32;
    (line_start, line_end, line_number)
}

fn utf16_index(text: &str) -> u32 {
    text.encode_utf16().count() as u32
}

#[cfg(test)]
mod tests {
    use super::{
        replace_in_files, search_in_files, write_pending_files, PendingReplacement,
        ReplaceFileResult,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../Temp/tests")
            .join(format!("fkemark-search-{stamp}"));
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
            replace_in_files(dir.to_str().unwrap(), "one", "two", true, false, false, 1).unwrap();
        assert_eq!(result.total_files_changed, 1);
        assert_eq!(result.total_replacements, 2);
        assert_eq!(result.files[0].content, "two two");
        assert_eq!(fs::read_to_string(path).unwrap(), "two two");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 非_markdown文本文件也可以替换() {
        let dir = temp_dir();
        let path = dir.join("plain.txt");
        fs::write(&path, "one one").unwrap();
        let result =
            replace_in_files(dir.to_str().unwrap(), "one", "two", true, false, false, 1).unwrap();
        assert_eq!(result.total_files_changed, 1);
        assert_eq!(result.files[0].content, "two two");
        assert_eq!(fs::read_to_string(&path).unwrap(), "two two");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 写入失败时批量替换会恢复原内容() {
        let dir = temp_dir();
        let first_path = dir.join("a.txt");
        let second_path = dir.join("b.txt");
        fs::write(&first_path, "旧一").unwrap();
        fs::write(&second_path, "旧二").unwrap();
        let pending = vec![
            PendingReplacement {
                result: ReplaceFileResult {
                    file_path: first_path.to_string_lossy().into_owned(),
                    content: "新一".to_string(),
                    replacements: 1,
                },
                original: "旧一".to_string(),
            },
            PendingReplacement {
                result: ReplaceFileResult {
                    file_path: second_path.to_string_lossy().into_owned(),
                    content: "新二".to_string(),
                    replacements: 1,
                },
                original: "旧二".to_string(),
            },
        ];
        let mut writes = 0;
        let mut write = |path: &std::path::Path, content: &str, _original: &str| {
            writes += 1;
            if writes == 2 {
                return Err("注入写入失败".to_string());
            }
            fs::write(path, content).map_err(|error| error.to_string())
        };
        let mut restore = |path: &std::path::Path, content: &str, _expected: &str| {
            fs::write(path, content).map_err(|error| error.to_string())
        };
        let error = write_pending_files(&pending, &mut write, &mut restore).unwrap_err();
        assert!(error.contains("批量替换写入失败"));
        assert!(error.contains("已回滚本次批量替换"));
        assert_eq!(fs::read_to_string(&first_path).unwrap(), "旧一");
        assert_eq!(fs::read_to_string(&second_path).unwrap(), "旧二");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 替换写入失败时仍会保留替换前快照并回滚已写入文件() {
        let dir = temp_dir();
        let nested = dir.join("sub");
        fs::create_dir(&nested).unwrap();
        let first_path = dir.join("a.md");
        let second_path = nested.join("b.md");
        fs::write(&first_path, "旧一").unwrap();
        fs::write(&second_path, "旧二").unwrap();
        // 制造第二次写入失败：类 Unix 只读目录无法创建替换临时文件，Windows 只读文件无法打开写入。
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&nested, fs::Permissions::from_mode(0o555)).unwrap();
        }
        #[cfg(windows)]
        {
            let mut permissions = fs::metadata(&second_path).unwrap().permissions();
            permissions.set_readonly(true);
            fs::set_permissions(&second_path, permissions).unwrap();
        }

        let result = replace_in_files(dir.to_str().unwrap(), "旧", "新", true, false, false, 1);

        // 先解除只读限制，避免影响后续断言与目录清理。
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&nested, fs::Permissions::from_mode(0o755)).unwrap();
        }
        #[cfg(windows)]
        {
            let mut permissions = fs::metadata(&second_path).unwrap().permissions();
            permissions.set_readonly(false);
            fs::set_permissions(&second_path, permissions).unwrap();
        }

        // 某些权限模型（例如以 root 运行）不受只读限制，此时无法制造该失败。
        if let Err(error) = result {
            assert!(error.contains("批量替换写入失败"));
            assert!(!error.contains("回滚失败"));
            assert_eq!(fs::read_to_string(&first_path).unwrap(), "旧一");
            assert_eq!(fs::read_to_string(&second_path).unwrap(), "旧二");

            // 快照在写入之前创建，因此替换失败时同样能回退到替换前内容。
            for (path, original) in [(&first_path, "旧一"), (&second_path, "旧二")] {
                let path = path.to_str().unwrap();
                let snapshots = super::super::version_history::list_snapshots(path).unwrap();
                assert_eq!(snapshots.len(), 1);
                assert_eq!(
                    super::super::version_history::read_snapshot(path, &snapshots[0].id).unwrap(),
                    original
                );
            }
        }

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 符号链接目录不会被递归搜索() {
        let dir = temp_dir();
        let nested = dir.join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(dir.join("root.txt"), "目标").unwrap();
        fs::write(nested.join("inside.txt"), "目标").unwrap();
        let link = dir.join("linked");
        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_dir(&nested, &link);
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(&nested, &link);
        if link_result.is_err() {
            fs::remove_dir_all(dir).unwrap();
            return;
        }
        let result = search_in_files(dir.to_str().unwrap(), "目标", true, false, false).unwrap();
        assert_eq!(result.total_files_searched, 2);
        assert_eq!(result.total_matches, 2);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 正则锚点在搜索和替换中保持多行及_crlf语义一致() {
        let dir = temp_dir();
        let path = dir.join("anchors.txt");
        fs::write(&path, "one\r\ntwo\r\n").unwrap();
        let search = search_in_files(dir.to_str().unwrap(), "^two$", true, true, false).unwrap();
        assert_eq!(search.total_matches, 1);
        let result = replace_in_files(
            dir.to_str().unwrap(),
            r"^(.+)$",
            "$1!",
            true,
            true,
            false,
            1,
        )
        .unwrap();
        assert_eq!(result.total_replacements, 2);
        assert_eq!(fs::read_to_string(&path).unwrap(), "one!\r\ntwo!\r\n");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 跨行正则搜索返回起始行的可展示范围() {
        let dir = temp_dir();
        let path = dir.join("multi-line.txt");
        fs::write(&path, "first\nsecond\n").unwrap();

        let result =
            search_in_files(dir.to_str().unwrap(), r"first\s+second", true, true, false).unwrap();

        assert_eq!(result.total_matches, 1);
        let matched = &result.matches[0];
        assert_eq!(matched.line_number, 1);
        assert_eq!(matched.line_text, "first");
        assert_eq!(matched.match_start, 0);
        assert_eq!(matched.match_end, 5);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 单个文件的匹配数量会被封顶() {
        let dir = temp_dir();
        // 单个文件写入 120 处匹配，超过单文件上限
        let content = (0..120).map(|_| "目标").collect::<Vec<_>>().join("\n");
        fs::write(dir.join("many.txt"), content).unwrap();

        let result = search_in_files(dir.to_str().unwrap(), "目标", true, false, false).unwrap();

        assert_eq!(result.total_matches, 50);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 匹配总数会被封顶() {
        let dir = temp_dir();
        // 12 个文件各命中 50 次，总数 600 超过全局上限
        let content = (0..50).map(|_| "目标").collect::<Vec<_>>().join("\n");
        for index in 0..12 {
            fs::write(dir.join(format!("f{index:02}.txt")), &content).unwrap();
        }

        let result = search_in_files(dir.to_str().unwrap(), "目标", true, false, false).unwrap();

        assert_eq!(result.total_matches, 500);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 并行扫描的结果顺序按文件路径稳定() {
        let dir = temp_dir();
        for name in ["c.txt", "a.txt", "b.txt"] {
            fs::write(dir.join(name), "目标").unwrap();
        }

        let result = search_in_files(dir.to_str().unwrap(), "目标", true, false, false).unwrap();

        // 分片并行后仍按路径排序合并，结果顺序不随线程调度变化
        let names = result
            .matches
            .iter()
            .map(|matched| matched.file_name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["a.txt", "b.txt", "c.txt"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 二进制文件不参与搜索() {
        let dir = temp_dir();
        fs::write(dir.join("a.txt"), "目标").unwrap();
        fs::write(dir.join("b.png"), [0x89u8, 0x50, 0x00, 0x4e, 0x47]).unwrap();

        let result = search_in_files(dir.to_str().unwrap(), "目标", true, false, false).unwrap();

        assert_eq!(result.total_files_searched, 1);
        assert_eq!(result.total_matches, 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn 硬链接替换保留链接关系和权限() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};

        let dir = temp_dir();
        let path = dir.join("source.txt");
        let link = dir
            .parent()
            .unwrap()
            .join(format!("fkemark-search-link-{}", std::process::id()));
        fs::write(&path, "one").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        fs::hard_link(&path, &link).unwrap();
        let inode = fs::metadata(&path).unwrap().ino();

        let result =
            replace_in_files(dir.to_str().unwrap(), "one", "two", true, false, false, 1).unwrap();

        assert_eq!(result.total_replacements, 1);
        assert_eq!(fs::read_to_string(&path).unwrap(), "two");
        assert_eq!(fs::read_to_string(&link).unwrap(), "two");
        assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        fs::remove_file(link).unwrap();
        fs::remove_dir_all(dir).unwrap();
    }
}
