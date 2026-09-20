//! 全文搜索的内容索引。
//!
//! 搜索不再每次全量读盘：索引按根目录缓存文本内容，用修改时间与文件大小判断
//! 是否需要重读，重复搜索只需一次目录遍历和 stat。二进制文件与超大文件在建立
//! 索引时就被排除，既不参与搜索也不占用内存。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

/// 单个文件允许进入索引的最大字节数，超过该值的文件不参与搜索。
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
/// 判断二进制文件时检查的内容前缀字节数。
const BINARY_SNIFF_BYTES: usize = 8192;

/// 索引中的一个文本文件。
pub struct IndexedFile {
    pub content: String,
    /// 建立索引时记录的修改时间，用于判断缓存是否仍然有效。
    modified: Option<SystemTime>,
    /// 建立索引时记录的文件大小，修改时间不可用时作为补充依据。
    len: u64,
}

/// 按根目录缓存的文件内容索引。
pub struct SearchIndex {
    root: PathBuf,
    files: HashMap<PathBuf, IndexedFile>,
}

impl SearchIndex {
    fn new(root: PathBuf) -> Self {
        Self {
            root,
            files: HashMap::new(),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn files(&self) -> &HashMap<PathBuf, IndexedFile> {
        &self.files
    }

    fn remove(&mut self, path: &Path) {
        self.files.remove(path);
    }

    /// 遍历目录并同步索引：新增或变更的文件重新读取，已删除的条目移除。
    /// 返回本次真正重读的文件数，便于验证缓存是否生效。
    pub fn refresh(&mut self) -> usize {
        let mut paths = Vec::new();
        collect_files(&self.root, &mut paths);

        let mut reread = 0usize;
        let mut next: HashMap<PathBuf, IndexedFile> = HashMap::with_capacity(paths.len());
        for path in paths {
            let (modified, len) = match file_stamp(&path) {
                Some(stamp) => stamp,
                None => continue,
            };
            if let Some(existing) = self.files.remove(&path) {
                // 修改时间与文件大小都没有变化时复用缓存内容，避免重复读盘。
                if existing.modified == modified && existing.len == len {
                    next.insert(path, existing);
                    continue;
                }
            }
            if let Some(content) = read_text_file(&path, len) {
                reread += 1;
                next.insert(
                    path,
                    IndexedFile {
                        content,
                        modified,
                        len,
                    },
                );
            }
        }
        self.files = next;
        reread
    }
}

/// 进程内的索引缓存。同一时刻只保留一个根目录的索引，切换工作目录时重建。
static INDEX_CACHE: Mutex<Option<SearchIndex>> = Mutex::new(None);

fn lock_index() -> std::sync::MutexGuard<'static, Option<SearchIndex>> {
    // 锁内只保存可重建的缓存数据，毒化后继续取用是安全的；
    // 若按错误处理，一次搜索期间的 panic 会让后续所有搜索永久失败。
    INDEX_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 在索引上执行一次操作：根目录变化时重建，否则增量刷新。
pub fn with_index<T>(root: &Path, action: impl FnOnce(&SearchIndex) -> T) -> T {
    let mut guard = lock_index();
    let rebuild = match guard.as_ref() {
        Some(index) => index.root() != root,
        None => true,
    };
    if rebuild {
        let mut index = SearchIndex::new(root.to_path_buf());
        index.refresh();
        *guard = Some(index);
    } else if let Some(index) = guard.as_mut() {
        index.refresh();
    }
    let result = match guard.as_ref() {
        Some(index) => action(index),
        // 上面必然已填充索引，此分支只为避免 unwrap 造成的 panic 风险。
        None => action(&SearchIndex::new(root.to_path_buf())),
    };
    result
}

/// 清空整个索引缓存；批量替换等大范围改动后调用。
pub fn invalidate_index() {
    let mut guard = lock_index();
    *guard = None;
}

/// 移除单个路径的缓存条目；文件被写入、重命名或删除后调用，
/// 避免修改时间精度不足时读到过期内容。
pub fn invalidate_path(path: &Path) {
    let mut guard = lock_index();
    if let Some(index) = guard.as_mut() {
        index.remove(path);
    }
}

/// 递归收集目录下的候选文件：跳过隐藏项、符号链接和常见构建产物目录。
pub fn collect_files(dir: &Path, files: &mut Vec<PathBuf>) {
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
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if matches!(
                name.as_ref(),
                "node_modules" | "target" | "dist" | "release"
            ) {
                continue;
            }
            collect_files(&path, files);
        } else if file_type.is_file() {
            files.push(path);
        }
    }
}

/// 读取文件的修改时间与大小，二者共同作为缓存失效依据。
fn file_stamp(path: &Path) -> Option<(Option<SystemTime>, u64)> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    Some((metadata.modified().ok(), metadata.len()))
}

/// 读取可搜索的文本内容；超大文件和二进制文件返回 None，不进入索引。
fn read_text_file(path: &Path, len: u64) -> Option<String> {
    if len > MAX_FILE_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    if is_binary(&bytes) {
        return None;
    }
    String::from_utf8(bytes).ok()
}

/// 通过前缀中是否出现 NUL 字节判断二进制内容，避免把图片等文件当文本搜索。
fn is_binary(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .take(BINARY_SNIFF_BYTES)
        .any(|byte| *byte == 0)
}

#[cfg(test)]
mod tests {
    use super::{invalidate_index, invalidate_path, with_index, SearchIndex, MAX_FILE_BYTES};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../Temp/tests")
            .join(format!("fkemark-index-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn 未修改的文件在重复刷新时不会重新读盘() {
        let dir = temp_dir();
        fs::write(dir.join("note.md"), "内容").unwrap();
        let mut index = SearchIndex::new(dir.clone());
        assert_eq!(index.refresh(), 1);
        // 内容与时间戳都没变化，第二次刷新应完全命中缓存。
        assert_eq!(index.refresh(), 0);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 文件内容变化后会重新读取() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "旧内容").unwrap();
        let mut index = SearchIndex::new(dir.clone());
        index.refresh();
        fs::write(&path, "新内容新内容").unwrap();
        assert_eq!(index.refresh(), 1);
        assert_eq!(index.files()[&path].content, "新内容新内容");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 已删除的文件会从索引移除() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "内容").unwrap();
        let mut index = SearchIndex::new(dir.clone());
        index.refresh();
        fs::remove_file(&path).unwrap();
        assert_eq!(index.refresh(), 0);
        assert!(index.files().is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 二进制文件与超大文件不进入索引() {
        let dir = temp_dir();
        fs::write(dir.join("text.md"), "可搜索").unwrap();
        fs::write(dir.join("image.png"), [0x89u8, 0x50, 0x00, 0x4e, 0x47]).unwrap();
        let oversized = dir.join("huge.txt");
        fs::write(&oversized, vec![b'a'; (MAX_FILE_BYTES + 1) as usize]).unwrap();

        let mut index = SearchIndex::new(dir.clone());
        index.refresh();

        assert_eq!(index.files().len(), 1);
        assert!(index.files().contains_key(&dir.join("text.md")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 单独失效路径后该文件会被重新读取() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "内容").unwrap();
        let mut index = SearchIndex::new(dir.clone());
        assert_eq!(index.refresh(), 1);
        // 直接移除条目后必须重新读盘，而不是继续命中缓存。
        index.remove(&path);
        assert_eq!(index.refresh(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 全局缓存失效路径后返回最新内容() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "旧内容").unwrap();
        with_index(&dir, |index| assert_eq!(index.files()[&path].content, "旧内容"));

        fs::write(&path, "新内容").unwrap();
        invalidate_path(&path);
        with_index(&dir, |index| assert_eq!(index.files()[&path].content, "新内容"));

        invalidate_index();
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 切换根目录会重建索引() {
        let first = temp_dir();
        let second = temp_dir();
        fs::write(first.join("a.md"), "内容").unwrap();
        fs::write(second.join("b.md"), "内容").unwrap();

        with_index(&first, |index| {
            assert!(index.files().contains_key(&first.join("a.md")));
        });
        with_index(&second, |index| {
            assert!(index.files().contains_key(&second.join("b.md")));
            assert!(!index.files().contains_key(&first.join("a.md")));
        });

        invalidate_index();
        fs::remove_dir_all(first).unwrap();
        fs::remove_dir_all(second).unwrap();
    }
}
