//! 全文搜索的内容索引。
//!
//! 同一根目录优先复用未变更的正文，空余预算按路径顺序分配。超过正文缓存预算
//! 的文件只保留元数据，搜索时逐个读取；搜索资格不受缓存预算影响。

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

/// 单个文件允许进入索引的最大字节数，超过该值的文件不参与搜索。
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
/// 单个根目录常驻的正文缓存总字节上限。
const MAX_CACHED_BODY_BYTES: usize = 32 * 1024 * 1024;
/// 判断二进制文件时检查的内容前缀字节数。
const BINARY_SNIFF_BYTES: usize = 8192;

/// 搜索候选文件；没有缓存正文时由扫描线程按需读取。
pub struct IndexedFile {
    content: Option<Box<str>>,
    /// 建立索引时记录的修改时间，用于判断缓存是否仍然有效。
    modified: Option<SystemTime>,
    /// 建立索引时记录的文件大小，修改时间不可用时作为补充依据。
    len: u64,
}

impl IndexedFile {
    pub fn content<'a>(&'a self, path: &Path, buffer: &'a mut Vec<u8>) -> Option<&'a str> {
        if let Some(content) = self.content.as_deref() {
            return Some(content);
        }
        read_text_bytes(path, self.len, buffer)?;
        std::str::from_utf8(buffer).ok()
    }
}

/// 按根目录缓存的文件内容索引。
pub struct SearchIndex {
    root: PathBuf,
    body_budget: usize,
    files: Vec<(PathBuf, IndexedFile)>,
}

impl SearchIndex {
    fn new(root: PathBuf, body_budget: usize) -> Self {
        Self {
            root,
            body_budget,
            files: Vec::new(),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn files(&self) -> &[(PathBuf, IndexedFile)] {
        &self.files
    }

    fn invalidate(&mut self, path: &Path) {
        if let Ok(index) = self
            .files
            .binary_search_by(|(key, _)| key.as_path().cmp(path))
        {
            self.files[index].1.content = None;
        }
    }

    /// 同步文件元数据并用空余预算缓存正文，返回本次新增的正文缓存条目数。
    pub fn refresh(&mut self) -> usize {
        let mut paths = Vec::new();
        collect_files(&self.root, &mut paths);
        paths.sort_unstable();

        let mut remaining = self.body_budget;
        let mut previous = std::mem::take(&mut self.files).into_iter().peekable();
        let mut next = Vec::with_capacity(paths.len());
        for path in paths {
            let (modified, len) = match file_stamp(&path) {
                Some(stamp) => stamp,
                None => continue,
            };
            if len > MAX_FILE_BYTES {
                continue;
            }
            // 先在有序路径间归并，保留所有仍然有效的热正文，不让新增文件挤掉它们。
            while previous.peek().is_some_and(|(old, _)| old < &path) {
                previous.next();
            }
            let file = previous
                .next_if(|(old, _)| old == &path)
                .map(|(_, file)| file)
                .filter(|file| file.modified == modified && file.len == len)
                .unwrap_or(IndexedFile {
                    content: None,
                    modified,
                    len,
                });
            if let Some(content) = &file.content {
                remaining -= content.len();
            }
            next.push((path, file));
        }
        drop(previous);

        let mut reread = 0;
        next.retain_mut(|(path, file)| {
            if file.content.is_some() || file.len as usize > remaining {
                return true;
            }
            let mut bytes = Vec::new();
            if read_text_bytes(path, file.len, &mut bytes).is_none() {
                return false;
            }
            let Ok(content) = String::from_utf8(bytes) else {
                return false;
            };
            // 文件可能在 stat 之后变大；只有实际正文仍合预算时才留存。
            if content.len() <= remaining {
                remaining -= content.len();
                file.content = Some(content.into_boxed_str());
                reread += 1;
            }
            true
        });
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
    with_index_with_budget(root, MAX_CACHED_BODY_BYTES, action)
}

pub(super) fn with_index_with_budget<T>(
    root: &Path,
    body_budget: usize,
    action: impl FnOnce(&SearchIndex) -> T,
) -> T {
    let mut guard = lock_index();
    if guard
        .as_ref()
        .is_some_and(|index| index.root() != root || index.body_budget != body_budget)
    {
        *guard = None;
    }
    let index = guard.get_or_insert_with(|| SearchIndex::new(root.to_path_buf(), body_budget));
    index.refresh();
    action(index)
}

/// 清空整个索引缓存；批量替换等大范围改动后调用。
pub fn invalidate_index() {
    let mut guard = lock_index();
    *guard = None;
}

/// 释放单个路径的缓存正文；文件被写入、重命名或删除后调用，
/// 避免修改时间精度不足时读到过期内容。
pub fn invalidate_path(path: &Path) {
    let mut guard = lock_index();
    if let Some(index) = guard.as_mut() {
        index.invalidate(path);
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

/// 按上限读取文本字节并跳过二进制；由调用者选择借用或保留 UTF-8 正文。
fn read_text_bytes(path: &Path, len: u64, bytes: &mut Vec<u8>) -> Option<()> {
    if len > MAX_FILE_BYTES {
        return None;
    }
    let file = fs::File::open(path).ok()?;
    bytes.clear();
    bytes.reserve(len as usize);
    // 限制实际读取量，避免文件在检查大小后继续增长。
    file.take(MAX_FILE_BYTES + 1).read_to_end(bytes).ok()?;
    if bytes.len() as u64 > MAX_FILE_BYTES || is_binary(bytes) {
        return None;
    }
    Some(())
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
    use super::{
        invalidate_index, invalidate_path, with_index, SearchIndex, MAX_CACHED_BODY_BYTES,
        MAX_FILE_BYTES,
    };
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
    fn 正文字节预算确定性保留热文本并为失效和删除回收空间() {
        let dir = temp_dir();
        let a = dir.join("a.txt");
        let b = dir.join("b.txt");
        let c = dir.join("c.txt");
        let d = dir.join("d.txt");
        fs::write(&d, "ddd").unwrap();
        fs::write(&c, "ccc").unwrap();
        fs::write(&b, "字字").unwrap();
        let mut index = SearchIndex::new(dir.clone(), 6);
        let cached = |index: &SearchIndex| {
            index
                .files()
                .iter()
                .filter(|(_, file)| file.content.is_some())
                .map(|(path, _)| path.clone())
                .collect::<Vec<_>>()
        };

        assert_eq!(index.refresh(), 1);
        assert_eq!(cached(&index), [b.clone()]);
        fs::write(&a, "aaa").unwrap();
        assert_eq!(index.refresh(), 0);
        assert_eq!(cached(&index), [b.clone()]);

        fs::write(&b, "字字字").unwrap();
        index.invalidate(&b);
        assert_eq!(index.refresh(), 2);
        assert_eq!(cached(&index), [a.clone(), c.clone()]);
        fs::remove_file(&a).unwrap();
        assert_eq!(index.refresh(), 1);
        assert_eq!(cached(&index), [c, d]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 未修改的文件在重复刷新时不会重新读盘() {
        let dir = temp_dir();
        fs::write(dir.join("note.md"), "内容").unwrap();
        let mut index = SearchIndex::new(dir.clone(), MAX_CACHED_BODY_BYTES);
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
        let mut index = SearchIndex::new(dir.clone(), MAX_CACHED_BODY_BYTES);
        index.refresh();
        fs::write(&path, "新内容新内容").unwrap();
        assert_eq!(index.refresh(), 1);
        assert_eq!(index.files()[0].1.content.as_deref(), Some("新内容新内容"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 已删除的文件会从索引移除() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "内容").unwrap();
        let mut index = SearchIndex::new(dir.clone(), MAX_CACHED_BODY_BYTES);
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
        // 即使遍历目录时记录的是旧大小，实际读取也不能越过单文件上限。
        assert!(super::read_text_bytes(&oversized, 1, &mut Vec::new()).is_none());

        let mut index = SearchIndex::new(dir.clone(), MAX_CACHED_BODY_BYTES);
        index.refresh();

        assert_eq!(index.files().len(), 1);
        assert_eq!(index.files()[0].0, dir.join("text.md"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 单独失效路径后该文件会被重新读取() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "内容").unwrap();
        let mut index = SearchIndex::new(dir.clone(), MAX_CACHED_BODY_BYTES);
        assert_eq!(index.refresh(), 1);
        // 释放缓存正文后必须重新读盘，即使文件的元数据完全未变。
        index.invalidate(&path);
        assert_eq!(index.refresh(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn 全局缓存失效路径后返回最新内容() {
        let dir = temp_dir();
        let path = dir.join("note.md");
        fs::write(&path, "旧内容").unwrap();
        with_index(&dir, |index| {
            assert_eq!(index.files()[0].1.content.as_deref(), Some("旧内容"));
        });

        fs::write(&path, "新内容").unwrap();
        invalidate_path(&path);
        with_index(&dir, |index| {
            assert_eq!(index.files()[0].1.content.as_deref(), Some("新内容"));
        });

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
            assert_eq!(index.files().len(), 1);
            assert_eq!(index.files()[0].0, first.join("a.md"));
        });
        with_index(&second, |index| {
            assert_eq!(index.files().len(), 1);
            assert_eq!(index.files()[0].0, second.join("b.md"));
        });

        invalidate_index();
        fs::remove_dir_all(first).unwrap();
        fs::remove_dir_all(second).unwrap();
    }
}
