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

export interface TabContentCacheEntry {
  content: string
  isModified: boolean
  editorMode: EditorMode
  path?: string
  lastSavedAt: number | null
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
}: UseAppTabsParams) {
  const [tabs, setTabs] = useState<TabItem[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const tabContentCache = useRef<Map<string, TabContentCacheEntry>>(new Map())
  const tabIdCounter = useRef(0)

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
) {
  const id = generateTabId()
  const tab: TabItem = { id, name, path, isModified: false }
  tabContentCache.current.set(id, {
    content,
    isModified: false,
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
  if (tabId === activeTabId && cached) {
    cached = { ...cached, content: getCurrentContent(), isModified, editorMode, path: currentFile ?? cached.path, lastSavedAt }
    tabContentCache.current.set(tabId, cached)
  }
  const tab = tabs.find((t) => t.id === tabId)
  if (cached?.isModified && tab) {
    const choice = await showCloseTabDialog(
      translate(language, 'tab.closeConfirm'),
      translate(language, 'tab.closeTitle'),
      {
        confirmText: translate(language, 'tab.save'),
        tertiaryText: translate(language, 'tab.discard'),
        cancelText: translate(language, 'tab.cancel'),
      }
    )
    if (choice === 'cancel') return
    if (choice === 'save') {
      // 保存标签内容
      const content = cached.content
      const path = cached.path || tab.path
      if (path) {
        // 已有路径，直接保存
        try {
          await invoke('write_file_command', { path, content })
          tabContentCache.current.set(tabId, { ...cached, isModified: false, lastSavedAt: Date.now() })
          setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, isModified: false } : t))
        } catch (e) {
          await showAlert(`${translate(language, 'tab.saveFailed')}: ${e}`, translate(language, 'tab.closeTitle'))
          return
        }
      } else {
        // 新文件无路径，需要选择保存位置
        if (isTauri()) {
          try {
            const savePath = await openDialog({ directory: true, multiple: false, title: translate(language, 'tab.selectSaveLocation') })
            if (typeof savePath === 'string') {
              const fileName = await showPrompt(translate(language, 'tab.enterFileName'), translate(language, 'document.untitledFileName'), translate(language, 'tab.closeTitle'))
              if (!fileName) return
              const fullPath = `${savePath}/${fileName}`
              await invoke('write_file_command', { path: fullPath, content })
              tabContentCache.current.set(tabId, { ...cached, isModified: false, path: fullPath, lastSavedAt: Date.now() })
              setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, isModified: false, path: fullPath, name: fileName } : t))
              if (currentFolderPath) {
                scanFolder(currentFolderPath)
              }
            } else {
              return
            }
          } catch (e) {
            await showAlert(`${translate(language, 'tab.saveFailed')}: ${e}`, translate(language, 'tab.closeTitle'))
            return
          }
        } else {
          // 浏览器环境：下载文件
          const name = await showPrompt(translate(language, 'tab.enterFileName'), translate(language, 'document.untitledFileName'), translate(language, 'tab.closeTitle'))
          if (!name) return
          const blob = new Blob([content], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = name
          a.click()
          URL.revokeObjectURL(url)
          tabContentCache.current.set(tabId, { ...cached, isModified: false, path: name, lastSavedAt: Date.now() })
          setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, isModified: false, path: name, name } : t))
        }
      }
    }
    // choice === 'discard' → 不保存，直接关闭
  }

  const idx = tabs.findIndex((t) => t.id === tabId)
  const newTabs = tabs.filter((t) => t.id !== tabId)
  setTabs(newTabs)
  tabContentCache.current.delete(tabId)

  // 如果关闭的是当前标签，切换到相邻标签
  if (activeTabId === tabId) {
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

// 更新当前标签的修改状态
function updateActiveTabModified(modified: boolean) {
  if (!activeTabId) return
  setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, isModified: modified } : t))
  const cached = tabContentCache.current.get(activeTabId)
  if (cached) {
    tabContentCache.current.set(activeTabId, { ...cached, isModified: modified })
  }
}

// 更新当前标签的路径（保存后文件名可能变化）
function updateActiveTabPath(path: string, name: string) {
  if (!activeTabId) return
  setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, path, name } : t))
}

function markActiveDocumentSaved(savedAt = Date.now(), path = currentFile) {
  updateActiveTabModified(false)
  setIsModified(false)
  setSaveStatus('saved')
  setLastSavedAt(savedAt)
  if (!activeTabId) return
  const cached = tabContentCache.current.get(activeTabId)
  if (cached) {
    tabContentCache.current.set(activeTabId, {
      ...cached,
      content: getCurrentContent(),
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
    updateActiveTabModified,
    updateActiveTabPath,
    markActiveDocumentSaved,
  }
}
