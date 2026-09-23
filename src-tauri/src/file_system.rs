use std::sync::{Mutex, MutexGuard};

static FILE_WRITE_LOCK: Mutex<()> = Mutex::new(());

fn lock_file_writes() -> Result<MutexGuard<'static, ()>, String> {
    // 锁内没有需要维持一致性的内存数据，毒化后继续取用是安全的；
    // 若按错误处理，一次写入期间的 panic 会导致后续所有保存永久失败。
    Ok(FILE_WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()))
}

mod assets;
mod entries;
mod replacement_writer;
mod search;
mod search_index;
mod terminal;
mod trash;
mod version_history;

pub use assets::{
    export_image_asset, read_binary_file, rename_image_asset, write_binary_file,
    write_exported_image,
};
pub use entries::{
    copy_asset_to_assets, duplicate_path, get_file_info, list_directory, read_file, rename_path,
    reveal_in_file_manager, scan_directory, FileEntry, FileMetadata, FileTreeNode,
};
pub use search::{replace_in_files, search_in_files, ReplaceResult, SearchResult};
pub use search_index::invalidate_path;
pub use terminal::open_system_terminal;
pub use trash::{
    empty_trash, list_trash, move_to_trash, purge_from_trash, restore_from_trash, TrashItem,
};
pub use version_history::{
    create_snapshot, list_snapshots, read_snapshot, write_file_with_snapshot, FileWriteMetrics,
    VersionSnapshot,
};
