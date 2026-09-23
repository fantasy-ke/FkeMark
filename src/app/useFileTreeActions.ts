import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { Dispatch, SetStateAction } from 'react'
import { showConfirm, showPrompt } from '../components/ConfirmDialog'
import { translate, type Lang } from '../i18n'
import type { FileEntry, FileTreeNode } from '../types'
import { getBaseName, isSamePathOrDescendant, isUnsafeFileName, joinPath, replacePathPrefix, withExcalidrawExtension, withMarkdownExtension, withPreservedMarkdownExtension } from '../utils/filePaths'
import { createEmptyExcalidrawScene } from '../utils/markdown/excalidraw'
import { isTauri } from '../utils/tauri'
import { notifyError, notifySuccess } from '../utils/toast'

type FileTreeTargetType = FileTreeNode['type']

interface UseFileTreeActionsParams {
  language: Lang
  currentFolderPath: string | null
  scanFolder: (dirPath: string) => Promise<void>
  setRecentFiles: Dispatch<SetStateAction<FileEntry[]>>
  replaceTabPathPrefix: (oldPath: string, newPath: string) => void
  removeTabsByPathPrefix: (path: string) => void
}

function replaceRecentPath(entry: FileEntry, oldPath: string, newPath: string): FileEntry {
  const nextPath = replacePathPrefix(entry.path, oldPath, newPath)
  return nextPath ? { ...entry, path: nextPath, name: getBaseName(nextPath) } : entry
}

export function useFileTreeActions({
  language,
  currentFolderPath,
  scanFolder,
  setRecentFiles,
  replaceTabPathPrefix,
  removeTabsByPathPrefix,
}: UseFileTreeActionsParams) {
  const refreshTree = async () => {
    if (currentFolderPath) await scanFolder(currentFolderPath)
  }

  const handleCopyTreePath = async (path: string) => {
    try {
      if (isTauri()) await writeText(path)
      else await navigator.clipboard?.writeText(path)
      notifySuccess(translate(language, 'tab.pathCopied'))
    } catch (e) {
      notifyError(translate(language, 'sidebar.context.copyPathFailed', { detail: String(e) }))
    }
  }

  const handleRevealTreePath = async (path: string) => {
    if (!isTauri()) return
    try {
      await invoke('reveal_in_file_manager', { filePath: path })
    } catch (e) {
      notifyError(translate(language, 'sidebar.context.openLocationFailed', { detail: String(e) }))
    }
  }

  const handleDuplicateTreePath = async (path: string) => {
    if (!isTauri()) return
    try {
      await invoke<string>('duplicate_path', { path })
      await refreshTree()
      notifySuccess(translate(language, 'sidebar.context.duplicateSuccess'))
    } catch (e) {
      notifyError(translate(language, 'sidebar.context.duplicateFailed', { detail: String(e) }))
    }
  }

  const handleRenameTreePath = async (path: string) => {
    if (!isTauri()) return
    const oldName = getBaseName(path)
    const rawName = (await showPrompt(
      translate(language, 'sidebar.context.renamePrompt'),
      oldName,
      translate(language, 'sidebar.context.renameTitle'),
    ))?.trim()
    if (!rawName) return
    const name = withPreservedMarkdownExtension(oldName, rawName)
    if (name === oldName) return

    try {
      const newPath = await invoke<string>('rename_path', { path, newName: name })
      replaceTabPathPrefix(path, newPath)
      setRecentFiles((prev) => prev.map((entry) => replaceRecentPath(entry, path, newPath)))
      await refreshTree()
      notifySuccess(translate(language, 'sidebar.context.renameSuccess'))
    } catch (e) {
      notifyError(translate(language, 'sidebar.context.renameFailed', { detail: String(e) }))
    }
  }

  const handleDeleteTreePath = async (path: string, type: FileTreeTargetType = 'file') => {
    if (!isTauri()) return
    const titleKey = type === 'folder' ? 'sidebar.context.deleteFolderTitle' : 'trash.deleteFile'
    const confirmKey = type === 'folder' ? 'sidebar.context.confirmDeleteFolder' : 'trash.confirmDelete'
    if (!(await showConfirm(translate(language, confirmKey), translate(language, titleKey)))) return

    try {
      // 先抬高修订号取消在途保存，移入回收站成功后再关标签，避免删除失败丢文档。
      replaceTabPathPrefix(path, path)
      await invoke('move_to_trash', { filePath: path })
      removeTabsByPathPrefix(path)
      setRecentFiles((prev) => prev.filter((entry) => !isSamePathOrDescendant(entry.path, path)))
      await refreshTree()
      notifySuccess(translate(language, 'trash.deleteSuccess'))
    } catch (e) {
      notifyError(`${translate(language, 'trash.deleteFailed')}: ${e}`)
    }
  }
  const handleCreateMarkdownInFolder = async (path: string, type: FileTreeTargetType = 'folder') => {
    if (!isTauri() || type !== 'folder') return
    const rawName = (await showPrompt(
      translate(language, 'tab.enterFileName'),
      translate(language, 'document.untitledFileName'),
      translate(language, 'sidebar.context.newMarkdown'),
    ))?.trim()
    if (!rawName) return
    if (isUnsafeFileName(rawName)) {
      notifyError(translate(language, 'sidebar.context.newMarkdownInvalid'))
      return
    }
    const filePath = joinPath(path, withMarkdownExtension(rawName))
    try {
      const existing = await invoke('get_file_info', { path: filePath }).catch(() => null)
      if (existing) {
        notifyError(translate(language, 'sidebar.context.newMarkdownExists'))
        return
      }
      await invoke('write_file_command', { path: filePath, content: '' })
      await refreshTree()
      notifySuccess(translate(language, 'sidebar.context.newMarkdownSuccess'))
    } catch (e) {
      notifyError(translate(language, 'sidebar.context.newMarkdownFailed', { detail: String(e) }))
    }
  }

  const handleCreateExcalidrawInFolder = async (path: string, type: FileTreeTargetType = 'folder') => {
    if (!isTauri() || type !== 'folder') return
    const rawName = (await showPrompt(
      translate(language, 'tab.enterFileName'),
      'sketch',
      translate(language, 'sidebar.context.newExcalidraw'),
    ))?.trim()
    if (!rawName) return
    if (isUnsafeFileName(rawName)) {
      notifyError(translate(language, 'sidebar.context.newMarkdownInvalid'))
      return
    }
    const filePath = joinPath(path, withExcalidrawExtension(rawName))
    try {
      const existing = await invoke('get_file_info', { path: filePath }).catch(() => null)
      if (existing) {
        notifyError(translate(language, 'sidebar.context.newMarkdownExists'))
        return
      }
      await invoke('write_file_command', { path: filePath, content: `${createEmptyExcalidrawScene()}\n` })
      await refreshTree()
      notifySuccess(translate(language, 'sidebar.context.newExcalidrawSuccess'))
    } catch (e) {
      notifyError(translate(language, 'sidebar.context.newExcalidrawFailed', { detail: String(e) }))
    }
  }

  return {
    handleCopyTreePath,
    handleCreateExcalidrawInFolder,
    handleCreateMarkdownInFolder,
    handleDeleteFile: (path: string) => handleDeleteTreePath(path, 'file'),
    handleDeleteTreePath,
    handleDuplicateTreePath,
    handleRenameTreePath,
    handleRevealTreePath,
  }
}
