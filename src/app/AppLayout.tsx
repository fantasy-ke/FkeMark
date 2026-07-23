import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TopBar } from '../components/TopBar'
import { Sidebar } from '../components/Sidebar'
import { Editor } from '../components/Editor'
import { WelcomeScreen } from '../components/WelcomeScreen'
import { SettingsPanel } from '../components/SettingsPanel'
import { CommandPalette } from '../components/CommandPalette'
import { TabBar } from '../components/TabBar'
import { RecycleBinPanel } from '../components/RecycleBinPanel'
import { ImageManagerPanel } from '../components/ImageManagerPanel'
import { BacklinksPanel } from '../components/BacklinksPanel'
import { AiChatSidebar, type PendingAiContext } from '../components/ai/AiChatSidebar'
import { Onboarding } from '../components/Onboarding'
import { EmptyState } from '../components/EmptyState'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ToastCenter } from '../components/ToastCenter'
import { I18nProvider, translate } from '../i18n'
import type { Lang } from '../i18n'
import { isTauri } from '../utils/tauri'
import { EXPORT_FORMATS } from '../utils/importExport'
import { findWikiNotePath } from '../utils/markdown/wikiLinks'
import { notifyError } from '../utils/toast'

interface AppLayoutProps {
  _setSidebarCollapsed: any
  _setSidebarOpen: any
  activeSettingsSection: any
  activeTabId: any
  appVersion: any
  checkingUpdate: any
  closeOtherTabs: any
  closeTab: any
  currentFile: any
  currentFolderPath: any
  displayName: any
  doCheckUpdate: any
  documentStats: any
  editorHandleRef: any
  editorMode: any
  editorScrollRef: any
  exportFormatPicker: any
  fileContent: any
  fileTree: any
  finalizeNotice: any
  findReplaceMode: any
  findReplaceVisible: any
  folderHistory: any
  handleCloseWindow: any
  handleDeleteFile: any
  handleDocumentContentChange: any
  handleExport: any
  handleInsertTemplate: any
  handleNewFile: any
  handleNewWindow: any
  handleOpenFile: any
  handleOpenFileDialog: any
  handleOpenFolder: any
  handleSaveFile: any
  handleSearchResultClick: any
  handleSettingsChange: any
  handleTocJump: any
  handleToggleTheme: any
  imageManagerOpen: any
  isModified: any
  lastSavedLabel: any
  lineCount: any
  onResizeStart: any
  paletteCommands: any
  paletteVisible: any
  recentFiles: any
  recycleBinOpen: any
  removeFolderHistory: any
  reopenFolder: any
  rollbackAvailable: any
  saveStatus: any
  scanFolder: any
  setActiveSettingsSection: any
  setEditorMode: any
  setExportFormatPicker: any
  setFinalizeNotice: any
  setFindReplaceMode: any
  setFindReplaceVisible: any
  setImageManagerOpen: any
  setPaletteVisible: any
  setRecycleBinOpen: any
  setSettingsOpen: any
  setShowOnboarding: any
  setShowUpdateToast: any
  setUpdateNotification: any
  settings: any
  settingsOpen: any
  showEmptyState: any
  showOnboarding: any
  showUpdateToast: any
  showWelcome: any
  sidebarOpen: any
  sidebarWidth: any
  switchToTab: any
  syncLabel: any
  tabs: any
  tocItems: any
  updateInfo: any
  updateNotification: any
  updater: any
  windowMaximized: any
}

export function AppLayout({
  _setSidebarCollapsed,
  _setSidebarOpen,
  activeSettingsSection,
  activeTabId,
  appVersion,
  checkingUpdate,
  closeOtherTabs,
  closeTab,
  currentFile,
  currentFolderPath,
  displayName,
  doCheckUpdate,
  documentStats,
  editorHandleRef,
  editorMode,
  editorScrollRef,
  exportFormatPicker,
  fileContent,
  fileTree,
  finalizeNotice,
  findReplaceMode,
  findReplaceVisible,
  folderHistory,
  handleCloseWindow,
  handleDeleteFile,
  handleDocumentContentChange,
  handleExport,
  handleInsertTemplate,
  handleNewFile,
  handleNewWindow,
  handleOpenFile,
  handleOpenFileDialog,
  handleOpenFolder,
  handleSaveFile,
  handleSearchResultClick,
  handleSettingsChange,
  handleTocJump,
  handleToggleTheme,
  imageManagerOpen,
  isModified,
  lastSavedLabel,
  lineCount,
  onResizeStart,
  paletteCommands,
  paletteVisible,
  recentFiles,
  recycleBinOpen,
  removeFolderHistory,
  reopenFolder,
  rollbackAvailable,
  saveStatus,
  scanFolder,
  setActiveSettingsSection,
  setEditorMode,
  setExportFormatPicker,
  setFinalizeNotice,
  setFindReplaceMode,
  setFindReplaceVisible,
  setImageManagerOpen,
  setPaletteVisible,
  setRecycleBinOpen,
  setSettingsOpen,
  setShowOnboarding,
  setShowUpdateToast,
  setUpdateNotification,
  settings,
  settingsOpen,
  showEmptyState,
  showOnboarding,
  showUpdateToast,
  showWelcome,
  sidebarOpen,
  sidebarWidth,
  switchToTab,
  syncLabel,
  tabs,
  tocItems,
  updateInfo,
  updateNotification,
  updater,
  windowMaximized,
}: AppLayoutProps) {
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false)
  const [pendingAiContext, setPendingAiContext] = useState<PendingAiContext | null>(null)

  function addAiContext(text: string) {
    if (!text.trim()) return
    setPendingAiContext((current) => ({ id: (current?.id ?? 0) + 1, text }))
    setAiSidebarOpen(true)
  }

  function openAiSettings() {
    setActiveSettingsSection('ai')
    setSettingsOpen(true)
  }

  function openWikiLink(target: string) {
    const path = findWikiNotePath(fileTree, target)
    if (path) return void handleOpenFile(path)
    notifyError(translate(settings.language, 'wikiLink.notFound', { name: target }))
  }

  return (
    <I18nProvider
      language={settings.language}
      setLanguage={(l: Lang) => handleSettingsChange({ ...settings, language: l })}
    >
    <div className="app-container">
      <TopBar
        currentFile={displayName}
        isModified={isModified}
        theme={settings.theme}
        editorMode={editorMode}
        onToggleTheme={handleToggleTheme}
        onThemeChange={(newTheme) => handleSettingsChange({ ...settings, theme: newTheme })}
        onOpenSettings={(section?: string) => {
          if (section) setActiveSettingsSection(section)
          setSettingsOpen(true)
        }}
        onExport={() => setExportFormatPicker(true)}
        onManageImages={() => setImageManagerOpen(true)}
        onSave={handleSaveFile}
        onEditorModeChange={setEditorMode}
        sidebarCollapsed={!sidebarOpen}
        onToggleSidebar={() => {
          const next = !sidebarOpen
          _setSidebarOpen(next)
          _setSidebarCollapsed(!next)
        }}
        hasUpdate={!!(updateInfo && updateInfo.isNewer)}
        onCloseAction={handleCloseWindow}
        isMaximized={windowMaximized}
        onNewTextFile={handleNewFile}
        onOpenFile={handleOpenFileDialog}
        onOpenFolder={handleOpenFolder}
        onNewWindow={handleNewWindow}
        aiOpen={aiSidebarOpen}
        onToggleAi={() => setAiSidebarOpen((open) => !open)}
      />

      <div className="main-layout">
        <div
          className={`sidebar-wrapper ${sidebarOpen ? 'open' : 'closed'}`}
          style={{ width: sidebarOpen ? `${sidebarWidth + 2}px` : '0px' }}
        >
          <Sidebar
            onOpenFile={handleOpenFile}
            recentFiles={recentFiles}
            currentFile={currentFile}
            tocItems={tocItems}
            onTocClick={handleTocJump}
            fileTree={fileTree}
            width={sidebarWidth}
            folderHistory={folderHistory}
            onReopenFolder={reopenFolder}
            onRemoveFolderHistory={removeFolderHistory}
            onOpenFolder={handleOpenFolder}
            onDeleteFile={handleDeleteFile}
            onOpenRecycleBin={() => setRecycleBinOpen(true)}
          />
          {/* 拖拽手柄（细线条）*/}
          <div
            className="sidebar-resizer"
            onMouseDown={onResizeStart}
          />
        </div>

        <main className="editor-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
          {showWelcome && (
            <WelcomeScreen onNewFile={handleNewFile} onOpenFolder={handleOpenFolder} />
          )}
          {!showWelcome && (
            <div className="editor-pane" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabClick={switchToTab}
                onTabClose={closeTab}
                onCloseOthers={closeOtherTabs}
                onNewTab={handleNewFile}
              />
              <Editor
                ref={editorHandleRef}
                content={fileContent}
                onChange={handleDocumentContentChange}
                settings={settings}
                editorMode={editorMode}
                onEditorModeChange={setEditorMode}
                scrollRef={editorScrollRef}
                onToggleMinimap={() => handleSettingsChange({ ...settings, showMinimap: !settings.showMinimap })}
                findReplaceVisible={findReplaceVisible}
                findReplaceMode={findReplaceMode}
                onFindReplaceClose={() => setFindReplaceVisible(false)}
                onFindReplaceModeChange={setFindReplaceMode}
                onOpenWikiLink={openWikiLink}
                onAddAiContext={addAiContext}
                filePath={currentFile}
              />
              {/* 空状态提示 */}
              {showEmptyState && (
                <EmptyState onInsertTemplate={handleInsertTemplate} />
              )}
            </div>
          )}
          <BacklinksPanel currentFile={currentFile} fileTree={fileTree} onOpenFile={handleOpenFile} />
          <div className="focus-overlay" />
        </main>
        <AiChatSidebar
          open={aiSidebarOpen}
          settings={settings}
          pendingContext={pendingAiContext}
          onClose={() => setAiSidebarOpen(false)}
          onOpenSettings={openAiSettings}
        />
      </div>

            {/* 状态栏 — 对齐原型图布局 */}
      <footer className="statusbar" onContextMenu={(e) => e.preventDefault()}>
        <div className="statusbar-left">
          {/* 当前文档同步状态 */}
          <span className="statusbar-item statusbar-sync" title={translate(settings.language, 'status.sync.label')}>
            <span className={`status-dot ${saveStatus}`} />
            <span>{syncLabel}</span>
          </span>
          {/* 文件格式标签 */}
          <span className="statusbar-item statusbar-format">Markdown</span>
          {/* 文档统计 */}
          <span className="statusbar-item statusbar-metric word-count">
            {translate(settings.language, 'status.wordCount', { n: documentStats.wordCount })}
          </span>
          <span className="statusbar-item statusbar-metric reading-time">
            {translate(settings.language, 'status.readingTime', { n: documentStats.readingMinutes })}
          </span>
          <span className="statusbar-item statusbar-last-saved" title={lastSavedLabel}>{lastSavedLabel}</span>
        </div>
        <div className="statusbar-right">
          {/* 视图模式切换组 */}
          <div className="view-mode-group">
            <button className={`view-mode-btn ${editorMode === 'live' ? 'active' : ''}`} onClick={() => setEditorMode('live')}>{translate(settings.language, 'status.mode.live')}</button>
            <button className={`view-mode-btn ${editorMode === 'split' ? 'active' : ''}`} onClick={() => setEditorMode('split')}>{translate(settings.language, 'status.mode.split')}</button>
            <button className={`view-mode-btn ${editorMode === 'read' ? 'active' : ''}`} onClick={() => setEditorMode('read')}>{translate(settings.language, 'status.mode.read')}</button>
            <button className={`view-mode-btn ${editorMode === 'source' ? 'active' : ''}`} onClick={() => setEditorMode('source')}>{translate(settings.language, 'status.mode.source')}</button>
          </div>
          {/* 光标位置 */}
          <span className="statusbar-item">{translate(settings.language, 'status.line', { rows: lineCount, col: 1 })}</span>
          {/* 编码标识 */}
          <span className="statusbar-item statusbar-encoding">UTF-8</span>
          {/* 设置按钮 */}
          <button className="settings-gear-btn" onClick={() => setSettingsOpen(true)} title={translate(settings.language, 'status.settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            <span>{translate(settings.language, 'status.settings')}</span>
          </button>
        </div>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        initialSection={activeSettingsSection}
        appVersion={appVersion}
        updateInfo={updateInfo}
        checkingUpdate={checkingUpdate}
        onCheckUpdate={(ch) => doCheckUpdate(ch, true)}
        updater={updater}
        rollbackAvailable={rollbackAvailable}
        onOpenDevtools={async () => {
          if (!isTauri()) return
          try { await invoke('open_devtools') }
          catch (e) { console.error('打开开发者工具失败:', e) }
        }}
      />

      <ImageManagerPanel
        open={imageManagerOpen}
        content={fileContent}
        filePath={currentFile}
        onClose={() => setImageManagerOpen(false)}
        onContentChange={handleDocumentContentChange}
      />
      {/* 导出格式选择器 */}
      {exportFormatPicker && (
        <div className="link-dialog-overlay" onClick={() => setExportFormatPicker(false)}>
          <div className="link-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="link-dialog-title">{translate(settings.language, 'export.title')}</div>
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt}
                className="app-menu-item"
                style={{ width: '100%', margin: '4px 0' }}
                onClick={() => handleExport(fmt)}
              >
                <span className="menu-label">{translate(settings.language, `export.format.${fmt}`)}</span>
              </button>
            ))}
            <div className="link-dialog-actions">
              <button className="link-dialog-btn cancel" onClick={() => setExportFormatPicker(false)}>
                {translate(settings.language, 'linkDialog.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 更新通知 Toast */}
      {showUpdateToast && updateInfo && updateInfo.isNewer && (
        <div className="update-toast-overlay">
          <div className="update-toast">
            <div className="update-toast-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div className="update-toast-content">
              <div className="update-toast-title">{translate(settings.language, 'update.newVersionAvailable')}</div>
              <div className="update-toast-desc">{translate(settings.language, 'update.newVersionDesc', { version: updateInfo.version })}</div>
              <div className="update-toast-actions">
                <button className="update-toast-btn primary" onClick={() => {
                  setShowUpdateToast(false)
                  setActiveSettingsSection('about')
                  setSettingsOpen(true)
                }}>
                  {translate(settings.language, 'update.title')}
                </button>
                <button className="update-toast-btn" onClick={() => {
                  setShowUpdateToast(false)
                  setActiveSettingsSection('about')
                  setSettingsOpen(true)
                  // 直接开始下载（若当前平台有可用包）
                  updater.start(updateInfo)
                }}>
                  {translate(settings.language, 'update.download')}
                </button>
                <button className="update-toast-btn ghost" onClick={() => setShowUpdateToast(false)}>
                  {translate(settings.language, 'update.remindLater')}
                </button>
              </div>
            </div>
            <button className="update-toast-close" onClick={() => setShowUpdateToast(false)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 更新检查结果通知（已最新 / 检查失败） */}
      {(updateNotification === 'uptodate' || updateNotification === 'error') && (
        <div className="update-toast-overlay">
          <div className={`update-toast-mini ${updateNotification}`}>
            <div className="update-toast-mini-icon">
              {updateNotification === 'uptodate' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <span className="update-toast-mini-text">
              {updateNotification === 'uptodate'
                ? translate(settings.language, 'update.upToDate')
                : translate(settings.language, 'update.checkFailed')}
            </span>
            <button className="update-toast-mini-close" onClick={() => setUpdateNotification(null)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 安装后自愈通知（更新成功 / 安装未生效） */}
      {finalizeNotice && (
        <div className="update-toast-overlay">
          <div className={`update-toast-mini ${finalizeNotice.status === 'success' ? 'uptodate' : 'error'}`}>
            <div className="update-toast-mini-icon">
              {finalizeNotice.status === 'success' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <span className="update-toast-mini-text">
              {finalizeNotice.status === 'success'
                ? translate(settings.language, 'update.installSuccess', { version: finalizeNotice.version })
                : translate(settings.language, 'update.installFailed')}
            </span>
            <button className="update-toast-mini-close" onClick={() => setFinalizeNotice(null)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 命令面板（⌘P 风格）*/}
      <CommandPalette
        visible={paletteVisible}
        onClose={() => setPaletteVisible(false)}
        fileTree={fileTree}
        currentFile={currentFile}
        recentFiles={recentFiles}
        onOpenFile={handleOpenFile}
        folderPath={currentFolderPath}
        commands={paletteCommands}
        onSearchResultClick={handleSearchResultClick}
      />

      {/* 回收站面板 */}
      <RecycleBinPanel
        open={recycleBinOpen}
        onClose={() => setRecycleBinOpen(false)}
        onRestored={() => {
          // 文件还原后刷新文件树
          if (currentFolderPath) {
            scanFolder(currentFolderPath)
          }
        }}
      />

      {/* 首启引导 */}
      {showOnboarding && (
        <Onboarding
          onComplete={() => setShowOnboarding(false)}
          onOpenFolder={handleOpenFolder}
          onNewFile={handleNewFile}
        />
      )}

      {/* 自定义对话框（替代原生 alert/confirm/prompt） */}
      <ConfirmDialog lang={settings.language} />
      {/* 统一 Toast 通知中心 */}
      <ToastCenter />
    </div>
    </I18nProvider>
  )
}
