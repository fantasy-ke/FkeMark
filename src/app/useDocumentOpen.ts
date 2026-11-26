import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SearchMatchResult } from '../components/CommandPalette'
import { translate, type Lang } from '../i18n'
import type { FileEntry } from '../types'
import { getBaseName, pathsEqual } from '../utils/filePaths'
import { isTauri } from '../utils/tauri'
import { notifyError } from '../utils/toast'
import type { TabNavigation } from './useAppTabs'

interface OpenDocument {
  content: string
  savedAt: number | null
}

interface FileRead {
  path: string
  promise: Promise<OpenDocument>
  controller?: AbortController
  keep: boolean
}

export interface DocumentSearchJump {
  tabId: string
  match: SearchMatchResult
}

async function readDocument(path: string, signal?: AbortSignal): Promise<OpenDocument> {
  if (!isTauri()) {
    const response = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`, { signal })
    if (!response.ok) throw new Error(String(response.status))
    return { content: await response.text(), savedAt: null }
  }
  const [content, metadata] = await Promise.all([
    invoke<string>('read_file_command', { path }),
    invoke<{ modified: string }>('get_file_info', { path }).catch(() => null),
  ])
  const modified = metadata ? new Date(metadata.modified).getTime() : NaN
  return { content, savedAt: Number.isFinite(modified) ? modified : null }
}

export function useDocumentOpen({
  navigationRevision, findOpenTab, switchToTab, createTab, language, setRecentFiles,
}: TabNavigation & {
  navigationRevision: MutableRefObject<number>
  language: Lang
  setRecentFiles: Dispatch<SetStateAction<FileEntry[]>>
}) {
  const readsRef = useRef(new Set<FileRead>())
  const liveRef = useRef(true)
  const [openingRevision, setOpeningRevision] = useState<number | null>(null)
  const [searchJump, setSearchJump] = useState<DocumentSearchJump | null>(null)
  const tabsRef = useRef({ findOpenTab, switchToTab, createTab })
  tabsRef.current = { findOpenTab, switchToTab, createTab }

  useEffect(() => {
    liveRef.current = true
    const reads = readsRef.current
    return () => {
      liveRef.current = false
      reads.forEach((read) => read.controller?.abort())
      reads.clear()
    }
  }, [])

  function supersede(path?: string) {
    setSearchJump(null)
    for (const read of readsRef.current) {
      if (read.keep || !read.controller || (path && pathsEqual(path, read.path))) continue
      read.controller.abort()
      readsRef.current.delete(read)
    }
    return ++navigationRevision.current
  }

  function selectTab(id: string) {
    supersede()
    setOpeningRevision(null)
    tabsRef.current.switchToTab(id)
  }

  function apply(path: string, document: OpenDocument, activate: boolean) {
    const tabs = tabsRef.current
    const openId = tabs.findOpenTab(path)
    if (openId) {
      if (activate) tabs.switchToTab(openId)
      return openId
    }
    const { content, savedAt } = document
    const name = getBaseName(path)
    const id = tabs.createTab(name, path, content, undefined, savedAt, false, activate)
    const entry: FileEntry = { name, path, isFile: true, isDir: false, size: content.length, modified: savedAt ?? Date.now() }
    setRecentFiles((prev) => [entry, ...prev.filter((file) => !pathsEqual(file.path, path))].slice(0, 10))
    return id
  }

  async function openFile(path: string, keep = false, match?: SearchMatchResult) {
    const revision = supersede(path)
    const openId = tabsRef.current.findOpenTab(path)
    if (openId) {
      setOpeningRevision(null)
      tabsRef.current.switchToTab(openId)
      if (match) setSearchJump({ tabId: openId, match })
      return openId
    }

    let read: FileRead | undefined
    for (const pending of readsRef.current) {
      if (!pathsEqual(path, pending.path)) continue
      read = pending
      break
    }
    if (read) {
      read.keep ||= keep
    } else {
      const controller = isTauri() ? undefined : new AbortController()
      read = { path, controller, keep, promise: readDocument(path, controller?.signal) }
      readsRef.current.add(read)
    }
    setOpeningRevision(revision)
    try {
      const document = await read.promise
      if (!liveRef.current || read.controller?.signal.aborted) return
      const activate = revision === navigationRevision.current
      if (!activate && !keep) return
      if (activate) setOpeningRevision(null)
      const id = apply(path, document, activate)
      if (activate && match) setSearchJump({ tabId: id, match })
      return id
    } catch (error) {
      if (liveRef.current && !read.controller?.signal.aborted && (keep || revision === navigationRevision.current)) {
        notifyError(translate(language, 'file.openFailed', { detail: String(error) }))
      }
    } finally {
      readsRef.current.delete(read)
      if (liveRef.current && revision === navigationRevision.current) setOpeningRevision(null)
    }
  }

  async function openLocalFile(file: File) {
    const revision = supersede()
    setOpeningRevision(revision)
    try {
      const content = await file.text()
      if (liveRef.current && revision === navigationRevision.current) {
        setOpeningRevision(null)
        apply(file.name, { content, savedAt: file.lastModified }, true)
      }
    } catch (error) {
      if (liveRef.current && revision === navigationRevision.current) {
        notifyError(translate(language, 'file.openFailed', { detail: String(error) }))
      }
    } finally {
      if (liveRef.current && revision === navigationRevision.current) setOpeningRevision(null)
    }
  }

  return {
    openingFile: openingRevision === navigationRevision.current, searchJump, selectTab, openLocalFile,
    handleOpenFile: async (path: string) => { await openFile(path) },
    handleSearchResultClick: async (match: SearchMatchResult) => { await openFile(match.filePath, false, match) },
    openFiles: async (paths: string[]) => {
      if (!paths.length) return
      const results = paths.map((path) => openFile(path, true))
      const revision = navigationRevision.current
      const ids = await Promise.all(results)
      if (!liveRef.current || revision !== navigationRevision.current || ids.at(-1)) return
      const fallback = ids.reverse().find((id) => id !== undefined)
      if (fallback) selectTab(fallback)
    },
  }
}
