import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { Lang } from '../i18n'
import { translate } from '../i18n'
import { showAlert, showCloseTabDialog, showConfirm, showPrompt } from '../components/ConfirmDialog'
import type { TabItem } from '../components/TabBar'
import { isTauri } from '../utils/tauri'
import { getDocumentSyncStatus, type DocumentSyncStatus } from '../utils/documentStats'
import type { EditorMode } from '../types'
import { normalizeVersionSnapshotLimit } from '../utils/versionHistory'
import { getBaseName, replacePathPrefix } from '../utils/filePaths'
import { enqueueDocumentSave } from './documentSaveQueue'

export interface TabContentCacheEntry {
  content: string
  isModified: boolean
  editorMode: EditorMode
  path?: string
  lastSavedAt: number | null
}

export interface ExternalDocumentChange {
  path: string
  content: string
}


function downloadDocument(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
interface UseAppTabsParams {
  currentFile: string | null
  setCurrentFile: Dispatch<SetStateAction<string | null>>
  setFileContent: Dispatch<SetStateAction<string>>
  isModified: boolean
  setIsModified: Dispatch<SetStateAction<boolean>>
  editorMode: EditorMode
  setEditorMode: Dispatch<SetStateAction<EditorMode>>
  lastSavedAt: number | null
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  setSaveStatus: Dispatch<SetStateAction<DocumentSyncStatus>>
  currentFolderPath: string | null
  scanFolder: (dirPath: string) => Promise<void>
  language: Lang
  getCurrentContent: () => string
  snapshotLimit: number
  documentRevisionRef?: MutableRefObject<Map<string, number>>
}

export function useAppTabs({
  currentFile,
  setCurrentFile,
  setFileContent,
  isModified,
  setIsModified,
  editorMode,
  setEditorMode,
  lastSavedAt,
  setLastSavedAt,
  setSaveStatus,
  currentFolderPath,
  scanFolder,
  language,
  getCurrentContent,
  snapshotLimit,
  documentRevisionRef,
}: UseAppTabsParams) {
  const [tabs, setTabs] = useState<TabItem[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const tabContentCache = useRef<Map<string, TabContentCacheEntry>>(new Map())
  const tabIdCounter = useRef(0)
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  tabsRef.current = tabs
  const bumpDocumentRevision = (tabId: string) => {
    if (!documentRevisionRef) return
    const revision = documentRevisionRef.current.get(tabId) ?? 0
    documentRevisionRef.current.set(tabId, revision + 1)
  }
  activeTabIdRef.current = activeTabId

function generateTabId(): string {
  tabIdCounter.current += 1
  return `tab-${Date.now()}-${tabIdCounter.current}`
}

// 创建新标签
function createTab(
  name: string,
  path: string | null,
  content: string,
  mode?: EditorMode,
  savedAt: number | null = null,
  initiallyModified = false,
) {
  const id = generateTabId()
  const tab: TabItem = { id, name, path, isModified: initiallyModified }
  tabContentCache.current.set(id, {
    content,
    isModified: initiallyModified,
    editorMode: mode || editorMode,
    path: path ?? undefined,
    lastSavedAt: savedAt,
  })
  setTabs((prev) => [...prev, tab])
  switchToTab(id)
  return id
}

// 切换标签：保存当前标签内容到缓存，加载目标标签内容
function switchToTab(tabId: string) {
  // 保存当前标签的状态到缓存
  if (activeTabId) {
    const activeTab = tabs.find((t) => t.id === activeTabId)
    tabContentCache.current.set(activeTabId, {
      content: getCurrentContent(),
      isModified,
      editorMode,
      path: currentFile ?? activeTab?.path ?? undefined,
      lastSavedAt,
    })
  }

  const cached = tabContentCache.current.get(tabId)
  if (!cached) return

  setActiveTabId(tabId)
  // 优先从缓存获取 path（避免 React 状态批处理导致的闭包陷阱）
  const tabPath = cached.path ?? tabs.find((t) => t.id === tabId)?.path ?? null
  setCurrentFile(tabPath)
  setFileContent(cached.content)
  setIsModified(cached.isModified)
  setEditorMode(cached.editorMode)
  setSaveStatus(getDocumentSyncStatus(cached.isModified, cached.path))
  setLastSavedAt(cached.lastSavedAt)
}

// 关闭标签
async function closeTab(tabId: string) {
  let cached = tabContentCache.current.get(tabId)
  const initialActiveTabId = activeTabIdRef.current
  if (tabId === initialActiveTabId && cached) {
    cached = { ...cached, content: getCurrentContent(), isModified, editorMode, path: currentFile ?? cached.path, lastSavedAt }
    tabContentCache.current.set(tabId, cached)
  }
  const tab = tabsRef.current.find((t) => t.id === tabId)
  const saveRevision = documentRevisionRef?.current.get(tabId) ?? 0

  const saveTabSnapshot = async (
    path: string,
    content: string,
    allowUnassignedPath = false,
  ) => {
    let saved = false
    try {
      saved = await enqueueDocumentSave(async () => {
      const current = tabContentCache.current.get(tabId)
      const currentTab = tabsRef.current.find((item) => item.id === tabId)
      const currentPath = current?.path ?? currentTab?.path
      const matchesRequest = Boolean(current)
        && current!.isModified
        && current!.content === content
        && (currentPath === path || (allowUnassignedPath && !currentPath))
        && (documentRevisionRef?.current.get(tabId) ?? 0) === saveRevision
      if (!matchesRequest) return false

      if (isTauri()) {
        await invoke('write_file_command', { path, content, snapshotLimit: normalizeVersionSnapshotLimit(snapshotLimit) })
      } else {
        downloadDocument(content, getBaseName(path))
      }

      const latest = tabContentCache.current.get(tabId)
      const latestTab = tabsRef.current.find((item) => item.id === tabId)
      const latestPath = latest?.path ?? latestTab?.path
      const stillCurrent = Boolean(latest)
        && latest!.isModified
        && latest!.content === content
        && (latestPath === path || (allowUnassignedPath && !latestPath))
        && (documentRevisionRef?.current.get(tabId) ?? 0) === saveRevision
      if (!stillCurrent) return false

      const savedAt = Date.now()
      tabContentCache.current.set(tabId, {
        ...latest!,
        isModified: false,
        path,
        lastSavedAt: savedAt,
      })
      setTabs((prev) => prev.map((item) => item.id === tabId
        ? { ...item, isModified: false, path, name: getBaseName(path) }
        : item))
      return true
      })
    } catch (e) {
      await showAlert(`${translate(language, 'tab.saveFailed')}: ${e}`, translate(language, 'tab.closeTitle'))
      return false
    }
    if (saved) return true
    await showAlert(translate(language, 'tab.saveFailed'), translate(language, 'tab.closeTitle'))
    return false
  }

  if (cached?.isModified && tab) {
    const choice = await showCloseTabDialog(
      translate(language, 'tab.closeConfirm'),
      translate(language, 'tab.closeTitle'),
      {
        confirmText: translate(language, 'tab.save'),
        tertiaryText: translate(language, 'tab.discard'),
        cancelText: translate(language, 'tab.cancel'),
      },
    )
    if (choice === 'cancel') return
    if (choice === 'save') {
      const content = cached.content
      const path = cached.path || tab.path
      if (path) {
        if (!await saveTabSnapshot(path, content)) return
      } else if (isTauri()) {
        try {
          const savePath = await openDialog({ directory: true, multiple: false, title: translate(language, 'tab.selectSaveLocation') })
          if (typeof savePath !== 'string') return
          const fileName = await showPrompt(translate(language, 'tab.enterFileName'), translate(language, 'document.untitledFileName'), translate(language, 'tab.closeTitle'))
          if (!fileName) return
          const fullPath = `${savePath}/${fileName}`
          if (!await saveTabSnapshot(fullPath, content, true)) return
          if (currentFolderPath) scanFolder(currentFolderPath)
        } catch (e) {
          await showAlert(`${translate(language, 'tab.saveFailed')}: ${e}`, translate(language, 'tab.closeTitle'))
          return
        }
      } else {
        const name = await showPrompt(translate(language, 'tab.enterFileName'), translate(language, 'document.untitledFileName'), translate(language, 'tab.closeTitle'))
        if (!name || !await saveTabSnapshot(name, content, true)) return
      }
    }
    // choice === 'discard' → 不保存，直接关闭
  }

  const latestTabs = tabsRef.current
  const idx = latestTabs.findIndex((t) => t.id === tabId)
  if (idx < 0) return
  const newTabs = latestTabs.filter((t) => t.id !== tabId)
  setTabs((prev) => prev.filter((t) => t.id !== tabId))
  tabContentCache.current.delete(tabId)

  // 如果关闭的是当前标签，切换到相邻标签
  if (activeTabIdRef.current === tabId) {
    if (newTabs.length === 0) {
      setActiveTabId(null)
      setCurrentFile(null)
      setFileContent('')
      setIsModified(false)
      setSaveStatus('saved')
      setLastSavedAt(null)
    } else {
      const nextTab = newTabs[Math.min(idx, newTabs.length - 1)]
      const nextCached = tabContentCache.current.get(nextTab.id)
      if (nextCached) {
        setActiveTabId(nextTab.id)
        // 优先从缓存获取 path（避免 React 状态批处理导致的闭包陷阱）
        setCurrentFile(nextCached.path || nextTab.path)
        setFileContent(nextCached.content)
        setIsModified(nextCached.isModified)
        setEditorMode(nextCached.editorMode)
        setSaveStatus(getDocumentSyncStatus(nextCached.isModified, nextCached.path))
        setLastSavedAt(nextCached.lastSavedAt)
      }
    }
  }
}

// Close other tabs
async function closeOtherTabs(tabId: string) {
  const targetTab = tabs.find((t) => t.id === tabId)
  if (!targetTab) return

  if (activeTabId) {
    const activeTab = tabs.find((t) => t.id === activeTabId)
    tabContentCache.current.set(activeTabId, {
      content: getCurrentContent(),
      isModified,
      editorMode,
      path: currentFile ?? activeTab?.path ?? undefined,
      lastSavedAt,
    })
  }

  const modifiedOthers = tabs.filter((tab) => {
    if (tab.id === tabId) return false
    const cached = tabContentCache.current.get(tab.id)
    return cached?.isModified || tab.isModified
  })
  if (modifiedOthers.length > 0) {
    const ok = await showConfirm(
      translate(language, 'tab.closeOthersConfirm', { count: modifiedOthers.length }),
      translate(language, 'tab.closeTitle')
    )
    if (!ok) return
  }

  for (const tab of tabs) {
    if (tab.id !== tabId) {
      tabContentCache.current.delete(tab.id)
    }
  }
  setTabs(tabs.filter((t) => t.id === tabId))
  if (activeTabId !== tabId) {
    switchToTab(tabId)
  }
}

// Close all tabs
async function closeAllTabs() {
  if (tabs.length === 0) return

  if (activeTabId) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    tabContentCache.current.set(activeTabId, {
      content: getCurrentContent(),
      isModified,
      editorMode,
      path: currentFile ?? activeTab?.path ?? undefined,
      lastSavedAt,
    })
  }

  const modifiedTabs = tabs.filter((tab) => {
    const cached = tabContentCache.current.get(tab.id)
    return cached?.isModified || tab.isModified
  })
  if (modifiedTabs.length > 0) {
    const ok = await showConfirm(
      translate(language, 'tab.closeAllConfirm', { count: modifiedTabs.length }),
      translate(language, 'tab.closeTitle')
    )
    if (!ok) return
  }

  tabContentCache.current.clear()
  setTabs([])
  setActiveTabId(null)
  setCurrentFile(null)
  setFileContent('')
  setIsModified(false)
  setSaveStatus('saved')
  setLastSavedAt(null)
}

// 更新当前标签的修改状态
function updateActiveTabModified(modified: boolean) {
  if (!activeTabId) return
  setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, isModified: modified } : t))
  const cached = tabContentCache.current.get(activeTabId)
  if (cached) {
    tabContentCache.current.set(activeTabId, { ...cached, isModified: modified })
  }
}

function markTabSaved(tabId: string) {
  setTabs((prev) => prev.map((tab) => tab.id === tabId ? { ...tab, isModified: false } : tab))
}

function applyExternalDocumentChanges(changes: ExternalDocumentChange[], excludedPath?: string): ExternalDocumentChange | null {
  const changesByPath = new Map(changes.map((change) => [change.path, change]))
  const savedAt = Date.now()
  let activeChange: ExternalDocumentChange | null = null
  for (const tab of tabsRef.current) {
    if (!tab.path || tab.path === excludedPath) continue
    const change = changesByPath.get(tab.path)
    if (!change) continue
    const cached = tabContentCache.current.get(tab.id)
    if (tab.isModified || cached?.isModified) continue
    if (cached) {
      tabContentCache.current.set(tab.id, {
        ...cached,
        content: change.content,
        isModified: false,
        path: change.path,
        lastSavedAt: savedAt,
      })
      if (tab.id === activeTabIdRef.current) activeChange = change
    }
  }
  setTabs((prev) => prev.map((tab) => {
    const cached = tabContentCache.current.get(tab.id)
    if (!tab.path || tab.path === excludedPath || tab.isModified || cached?.isModified || !changesByPath.has(tab.path)) return tab
    return { ...tab, isModified: false }
  }))
  return activeChange
}

// 更新当前标签的路径（保存后文件名可能变化）
function updateActiveTabPath(path: string, name: string) {
  if (!activeTabId) return
  bumpDocumentRevision(activeTabId)
  setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, path, name } : t))
}

function replaceTabPathPrefix(oldPath: string, newPath: string) {
  tabsRef.current.forEach((tab) => {
    if (!tab.path || !replacePathPrefix(tab.path, oldPath, newPath)) return
    bumpDocumentRevision(tab.id)
  })
  setTabs((prev) => prev.map((tab) => {
    if (!tab.path) return tab
    const nextPath = replacePathPrefix(tab.path, oldPath, newPath)
    return nextPath ? { ...tab, path: nextPath, name: getBaseName(nextPath) } : tab
  }))
  tabContentCache.current.forEach((cached, id) => {
    if (!cached.path) return
    const nextPath = replacePathPrefix(cached.path, oldPath, newPath)
    if (nextPath) tabContentCache.current.set(id, { ...cached, path: nextPath })
  })
  const nextCurrentFile = currentFile ? replacePathPrefix(currentFile, oldPath, newPath) : null
  if (nextCurrentFile) setCurrentFile(nextCurrentFile)
}

function removeTabsByPathPrefix(path: string) {
  const removedIds = new Set(tabs
    .filter((tab) => tab.path && replacePathPrefix(tab.path, path, path))
    .map((tab) => tab.id))
  if (removedIds.size === 0) return

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId)
  const nextTabs = tabs.filter((tab) => !removedIds.has(tab.id))
  removedIds.forEach((id) => tabContentCache.current.delete(id))
  setTabs(nextTabs)

  if (!activeTabId || !removedIds.has(activeTabId)) return
  if (nextTabs.length === 0) {
    setActiveTabId(null)
    setCurrentFile(null)
    setFileContent('')
    setIsModified(false)
    setEditorMode(editorMode)
    setSaveStatus('saved')
    setLastSavedAt(null)
    return
  }

  const nextTab = nextTabs[Math.min(Math.max(activeIndex, 0), nextTabs.length - 1)]
  const nextCached = tabContentCache.current.get(nextTab.id)
  setActiveTabId(nextTab.id)
  setCurrentFile(nextCached?.path || nextTab.path)
  setFileContent(nextCached?.content ?? '')
  setIsModified(nextCached?.isModified ?? nextTab.isModified)
  setEditorMode(nextCached?.editorMode ?? editorMode)
  setSaveStatus(getDocumentSyncStatus(nextCached?.isModified ?? nextTab.isModified, nextCached?.path || nextTab.path))
  setLastSavedAt(nextCached?.lastSavedAt ?? null)
}

function markActiveDocumentSaved(savedAt = Date.now(), path = currentFile, content?: string) {
  updateActiveTabModified(false)
  setIsModified(false)
  setSaveStatus('saved')
  setLastSavedAt(savedAt)
  if (!activeTabId) return
  const cached = tabContentCache.current.get(activeTabId)
  if (cached) {
    tabContentCache.current.set(activeTabId, {
      ...cached,
      content: content ?? getCurrentContent(),
      isModified: false,
      path: path ?? cached.path,
      lastSavedAt: savedAt,
    })
  }
}


  return {
    tabs,
    activeTabId,
    tabContentCache: tabContentCache as MutableRefObject<Map<string, TabContentCacheEntry>>,
    createTab,
    switchToTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    updateActiveTabModified,
    updateActiveTabPath,
    markActiveDocumentSaved,
    replaceTabPathPrefix,
    removeTabsByPathPrefix,
    markTabSaved,
    applyExternalDocumentChanges,
  }
}
