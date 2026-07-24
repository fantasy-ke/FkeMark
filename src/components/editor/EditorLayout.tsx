import { EditorContent } from '@tiptap/react'
import { useState, type Dispatch, type MouseEvent as ReactMouseEvent, type ReactNode, type SetStateAction } from 'react'
import { SlashMenu } from '../SlashMenu'
import { WikiLinkPicker } from './WikiLinkPicker'
import { FindReplaceBar } from '../FindReplaceBar'
import { Minimap } from './Minimap'
import { LineNumbers } from './LineNumbers'
import { SearchHighlightOverlay } from './SearchHighlightOverlay'
import { TableGridPicker, OlStylePicker, CodeBlockLangPicker } from './EditorPickers'
import { LinkDialog, TableContextMenu, ImageContextMenu, ImageSizeDialog } from './EditorMenus'
import { AiAssistantPanel } from './AiAssistant'
import { AiSelectionButton } from './AiSelectionButton'
import { SpellCheckButton, SpellCheckPanel, useSpellCheckAssistant } from './SpellCheckAssistant'
import { PresentationButton, PresentationMode } from './PresentationMode'
import { SnippetsMenu } from './SnippetsMenu'
import { VersionHistoryMenu } from './VersionHistoryMenu'
import { openExternalUrl } from '../../utils/updater'
import { getWikiTargetFromHref } from '../../utils/markdown/wikiLinks'
import {
  TOOLBAR_BUTTON_GROUPS,
  getToolbarButtonDefinition,
  isToolbarButtonId,
  isToolbarGroupPlacement,
  isToolbarSeparatorId,
  resolveToolbarItems,
  type ToolbarDropdownGroupId,
} from '../../utils/toolbar'
import type { ToolbarButtonConfig, ToolbarButtonId } from '../../types'

type StateSetter = Dispatch<SetStateAction<any>>
type EditorLayoutProps = Record<string, any> & {
  setCodeBlockLang: StateSetter
  setHeadingPickerOpen: StateSetter
  setImageCtxMenu: StateSetter
  setImageEditPopup: StateSetter
  setImageSizeDialog: StateSetter
  setLinkDialog: StateSetter
  setOlPicker: StateSetter
  setSearchCurrentIdx: StateSetter
  setSearchMatches: StateSetter
  setSlashState: StateSetter
  setTableCtxMenu: StateSetter
  setTablePicker: StateSetter
  setTextareaScrollTop: StateSetter
}

export function EditorLayout(props: EditorLayoutProps) {
  const {
    aiAssistant, applyImageEdit, applyImageSizePreview, applyLink, applyOlStyle, applySlashCommand,
    closeEditorOverlays, closeLinkDialog, codeBlockLang, containerRef, content,
    docDirRef, editor, editorMode, execCmd, filePath, findReplaceMode, getCurrentContent,
    findReplaceVisible, handlePreviewLinkClick, handleSplitScroll, hasEditorOverlay, headingPickerOpen, hideAiSelectionButton,
    imageCtxMenu, imageEditPopup, imageEditPopupRef, imageSizeDialog, insertTable,
    isReadMode, isSourceMode, isSplitMode, jumpToFootnote, linkDialog,
    minimapOnLeft, minimapOnRight, olPicker, onAddAiContext, onChange, onFindReplaceClose,
    onFindReplaceModeChange, onOpenWikiLink, onScrollContextMenu, openExistingLinkDialog, openTablePicker, previewHtml,
    previewScrollRef, scrollRef, searchCurrentIdx, searchMatches, setCodeBlockLang,
    setHeadingPickerOpen, setImageCtxMenu, setImageEditPopup, setImageSizeDialog, setLinkDialog,
    setOlPicker, setSearchCurrentIdx, setSearchMatches, setSlashState, setTableCtxMenu,
    setTablePicker, setTextareaScrollTop, settings, showToolbar, slashState,
    splitRatio, splitRef, startSplitDrag, syntaxHint, t,
    tableCtxMenu, tablePicker, textareaRef, textareaScrollTop, toggleOlPicker,
    toolbarLayoutClass, toolbarPosition, wikiLinkPicker,
  } = props
  const spellCheck = useSpellCheckAssistant({ content, enabled: settings.spellCheckEnabled, onChange })
  const [presentationOpen, setPresentationOpen] = useState(false)
  const [openToolbarGroup, setOpenToolbarGroup] = useState<ToolbarDropdownGroupId | null>(null)
  const showLineNumbers = Boolean(settings.showLineNumbers)

  const toolbarItems = resolveToolbarItems(settings.toolbarButtons)
  const toolbarGroupById = new Map(TOOLBAR_BUTTON_GROUPS.map((group) => [group.id, group]))

  function toolbarButtonTitle(id: ToolbarButtonId) {
    return t(getToolbarButtonDefinition(id).labelKey)
  }

  function runToolbarButton(id: ToolbarButtonId, e?: ReactMouseEvent<HTMLButtonElement>) {
    setOpenToolbarGroup(null)
    if (id === 'ol' && e) {
      toggleOlPicker(e)
      return
    }
    if (id === 'table' && e) {
      openTablePicker(e)
      return
    }
    execCmd(id === 'ul' ? 'list' : id)
  }

  function renderToolbarButtonIcon(id: ToolbarButtonId): ReactNode {
    if (id === 'heading') return <strong>H</strong>
    if (id === 'bold') return <strong>B</strong>
    if (id === 'italic') return <em>I</em>
    if (id === 'strike') return <s>S</s>
    if (id === 'code') return <>&lt;/&gt;</>
    if (id === 'quote') return <>{'\u275D'}</>
    if (id === 'ul') return <>{'\u2261'}</>
    if (id === 'ol') {
      return <>
        1.<svg viewBox="0 0 24 24" width="7" height="7" style={{ marginLeft: 1 }} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </>
    }
    if (id === 'todo') return <>{'\u2610'}</>
    if (id === 'hr') return <>{'\u2015'}</>
    if (id === 'table') return <>{'\u25A6'}</>
    if (id === 'link') return <>{String.fromCodePoint(0x1F517)}</>
    if (id === 'wikilink') return <span style={{ fontSize: 9 }}>[[]]</span>
    if (id === 'image') return <>{String.fromCodePoint(0x1F5BC)}</>
    if (id === 'codeblock') {
      return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    }
    return <>/</>
  }

  function renderToolbarActionButton(config: ToolbarButtonConfig & { id: ToolbarButtonId }) {
    return (
      <button
        key={config.id}
        className="tb-btn"
        title={toolbarButtonTitle(config.id)}
        aria-label={toolbarButtonTitle(config.id)}
        data-toolbar-button={config.id}
        data-ol-btn={config.id === 'ol' ? true : undefined}
        data-table-btn={config.id === 'table' ? true : undefined}
        onClick={(e) => runToolbarButton(config.id, e)}
      >
        {renderToolbarButtonIcon(config.id)}
      </button>
    )
  }

  function renderHeadingControl() {
    return (
      <div className="tb-heading-dropdown" key="heading" data-toolbar-button="heading">
        <button
          className="tb-btn"
          title={toolbarButtonTitle('heading')}
          aria-label={toolbarButtonTitle('heading')}
          onClick={() => {
            const shouldOpen = !headingPickerOpen
            setOpenToolbarGroup(null)
            closeEditorOverlays()
            if (shouldOpen) setHeadingPickerOpen(true)
          }}
        >
          <strong>H</strong>
          <svg viewBox="0 0 24 24" width="8" height="8" style={{ marginLeft: 1 }} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {headingPickerOpen && (
          <div className="heading-picker-dropdown" onMouseLeave={() => setHeadingPickerOpen(false)}>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <button
                key={level}
                className="heading-picker-item"
                onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: level as 1|2|3|4|5|6 }).run(); setHeadingPickerOpen(false) }}
              >
                <span style={{ fontWeight: 700 - (level - 1) * 80, fontSize: `${18 - level}px` }}>H{level}</span>
                <span style={{ color: 'var(--muted)', fontSize: 10 }}>{t('toolbar.headingLevel', { level })}</span>
              </button>
            ))}
            <div className="app-menu-divider" style={{ margin: '4px 0' }} />
            <button
              className="heading-picker-item"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setParagraph().run(); setHeadingPickerOpen(false) }}
            >
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('toolbar.paragraph')}</span>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>{t('toolbar.paragraphDesc')}</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderToolbarGroup(groupId: ToolbarDropdownGroupId) {
    const group = toolbarGroupById.get(groupId)
    const items = toolbarItems.filter((item): item is ToolbarButtonConfig & { id: ToolbarButtonId } => item.placement === groupId && isToolbarButtonId(item.id))
    if (!group || items.length === 0) return null

    return (
      <div className="tb-heading-dropdown tb-group-dropdown" key={`group-${groupId}`} data-toolbar-group={groupId}>
        <button
          className="tb-btn tb-group-trigger"
          title={t(group.labelKey)}
          aria-label={t(group.labelKey)}
          onClick={() => {
            const shouldOpen = openToolbarGroup !== groupId
            closeEditorOverlays()
            setOpenToolbarGroup(shouldOpen ? groupId : null)
          }}
        >
          <span className="tb-group-trigger-text">{group.icon}</span>
          <svg viewBox="0 0 24 24" width="8" height="8" style={{ marginLeft: 1 }} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {openToolbarGroup === groupId && (
          <div className="heading-picker-dropdown tb-group-menu" onMouseLeave={() => setOpenToolbarGroup(null)}>
            {items.map((item) => (
              <button
                key={item.id}
                className="heading-picker-item tb-group-item"
                onMouseDown={(e) => { e.preventDefault(); runToolbarButton(item.id, e) }}
              >
                <span className="tb-group-item-main">
                  <span className="tb-group-item-icon">{renderToolbarButtonIcon(item.id)}</span>
                  <span>{toolbarButtonTitle(item.id)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderConfiguredToolbarButton(config: ToolbarButtonConfig & { id: ToolbarButtonId }) {
    if (config.id === 'versions') {
      return (
        <VersionHistoryMenu
          key={config.id}
          filePath={filePath}
          getCurrentContent={getCurrentContent}
          onRestore={onChange}
          closeWhen={hasEditorOverlay || openToolbarGroup !== null || spellCheck.panelOpen || aiAssistant.panelOpen || presentationOpen}
          onBeforeOpen={() => {
            setOpenToolbarGroup(null)
            closeEditorOverlays()
            aiAssistant.closePanel()
            spellCheck.closePanel()
          }}
        />
      )
    }
    if (config.id === 'snippets') {
      return (
        <SnippetsMenu
          key={config.id}
          editor={editor}
          docDir={docDirRef.current}
          closeWhen={hasEditorOverlay || openToolbarGroup !== null || spellCheck.panelOpen || aiAssistant.panelOpen || presentationOpen}
          onBeforeOpen={() => {
            setOpenToolbarGroup(null)
            closeEditorOverlays()
            aiAssistant.closePanel()
            spellCheck.closePanel()
          }}
        />
      )
    }
    if (config.id === 'spellCheck') {
      if (!settings.spellCheckEnabled) return null
      return (
        <SpellCheckButton
          key={config.id}
          spellCheck={spellCheck}
          t={t}
          onBeforeOpen={() => { setOpenToolbarGroup(null); closeEditorOverlays(); aiAssistant.closePanel() }}
        />
      )
    }
    if (config.id === 'presentation') {
      return (
        <PresentationButton
          key={config.id}
          t={t}
          onStart={() => {
            setOpenToolbarGroup(null)
            closeEditorOverlays()
            aiAssistant.closePanel()
            spellCheck.closePanel()
            setPresentationOpen(true)
          }}
        />
      )
    }
    return config.id === 'heading' ? renderHeadingControl() : renderToolbarActionButton(config)
  }

  const toolbarNodes: ReactNode[] = []
  const renderedGroups = new Set<ToolbarDropdownGroupId>()
  for (const config of toolbarItems) {
    if (config.placement === 'hidden') continue
    if (isToolbarSeparatorId(config.id)) {
      toolbarNodes.push(<span className="tb-sep" key={config.id} aria-hidden="true" />)
      continue
    }
    if (isToolbarGroupPlacement(config.placement)) {
      if (renderedGroups.has(config.placement)) continue
      renderedGroups.add(config.placement)
      const groupNode = renderToolbarGroup(config.placement)
      if (groupNode) toolbarNodes.push(groupNode)
      continue
    }
    if (isToolbarButtonId(config.id)) toolbarNodes.push(renderConfiguredToolbarButton({ ...config, id: config.id }))
  }

  return (
    <div className="editor-area" ref={containerRef}>
      <div className={`editor-pane ${toolbarLayoutClass}`.trim()}>
        {/* 查找替换栏 */}
        <FindReplaceBar
          editor={editor}
          visible={findReplaceVisible}
          mode={findReplaceMode}
          onClose={onFindReplaceClose}
          onModeChange={onFindReplaceModeChange}
          forceTextMode={isSourceMode || isSplitMode}
          content={isSourceMode || isSplitMode ? content : undefined}
          onContentChange={onChange}
          onTextMatchesChange={(matches, idx) => {
            setSearchMatches(matches)
            setSearchCurrentIdx(idx)
          }}
        />

        {/* Toolbar */}
        {showToolbar && (
          <div className={`editor-toolbar position-${toolbarPosition} ${settings.toolbarFloating ? 'floating' : ''}`.trim()}>
            {toolbarNodes}
          </div>
        )}

        {/* 源码模式：文本域 + 可选小地图（小地图绑定文本域滚动） */}
        {isSourceMode && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {minimapOnLeft && (
              <Minimap content={content} scrollRef={textareaRef} side="left" editorMode="source" docDir={docDirRef.current} />
            )}
            <div className={`source-textarea-wrapper${showLineNumbers ? ' has-line-numbers' : ''}`} style={{ position: 'relative', flex: 1, display: 'flex' }}>
              {showLineNumbers && <LineNumbers content={content} className="editor-line-numbers--source" scrollTop={textareaScrollTop} />}
              <textarea
                ref={textareaRef}
                className="source-textarea"
                value={content}
                onChange={wikiLinkPicker.handleSourceChange}
                onScroll={(e) => setTextareaScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
                placeholder={t('editor.sourcePlaceholder')}
                spellCheck={settings.spellCheckEnabled}
                lang="en-US"
              />
              <SearchHighlightOverlay
                text={content}
                matches={searchMatches}
                currentIndex={searchCurrentIdx}
                scrollTop={textareaScrollTop}
              />
            </div>
            {minimapOnRight && (
              <Minimap content={content} scrollRef={textareaRef} side="right" editorMode="source" docDir={docDirRef.current} />
            )}
          </div>
        )}

        {/* 分栏模式：左侧源码 + 可拖拽分隔条 + 右侧渲染预览（双栏独立滚动） */}
        {isSplitMode && (
          <div className="editor-split" ref={splitRef as React.RefObject<HTMLDivElement>} style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {minimapOnLeft && (
              <Minimap content={content} scrollRef={textareaRef} side="left" editorMode="source" docDir={docDirRef.current} />
            )}
            <div className="split-source" style={{ width: `${splitRatio * 100}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className={`source-textarea-wrapper${showLineNumbers ? ' has-line-numbers' : ''}`} style={{ position: 'relative', flex: 1, display: 'flex' }}>
                {showLineNumbers && <LineNumbers content={content} className="editor-line-numbers--source" scrollTop={textareaScrollTop} />}
                <textarea
                  ref={textareaRef}
                  className="source-textarea split-source-textarea"
                  value={content}
                  onChange={wikiLinkPicker.handleSourceChange}
                  onScroll={(e) => {
                    handleSplitScroll(e)
                    setTextareaScrollTop((e.target as HTMLTextAreaElement).scrollTop)
                  }}
                  placeholder={t('editor.sourcePlaceholder')}
                  spellCheck={settings.spellCheckEnabled}
                  lang="en-US"
                  style={{ width: '100%', maxWidth: 'none', margin: 0 }}
                />
                <SearchHighlightOverlay
                  text={content}
                  matches={searchMatches}
                  currentIndex={searchCurrentIdx}
                  scrollTop={textareaScrollTop}
                  isSplit
                />
              </div>
            </div>
            <div
              className="split-divider"
              onMouseDown={startSplitDrag}
              role="separator"
              aria-orientation="vertical"
              title={t('editor.splitDragTitle')}
            />
            <div
              ref={previewScrollRef}
              className={`split-preview${showLineNumbers ? ' has-line-numbers' : ''}`}
              onScroll={handleSplitScroll}
              onClickCapture={handlePreviewLinkClick}
              onContextMenu={(e) => e.preventDefault()}
              style={{ width: `${(1 - splitRatio) * 100}%`, minWidth: 0, overflow: 'auto', position: 'relative' }}
            >
              {showLineNumbers && <LineNumbers content={content} className="editor-line-numbers--preview" />}
              <div
                className="editor-inner editor-preview-inner"
                style={{ minHeight: '100%' }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
            {minimapOnRight && (
              <Minimap content={content} scrollRef={textareaRef} side="right" editorMode="source" docDir={docDirRef.current} />
            )}
          </div>
        )}

        {/* 实时/阅读模式 */}
        {!isSourceMode && !isSplitMode && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {minimapOnLeft && <Minimap content={content} scrollRef={scrollRef} side="left" editorMode={editorMode} docDir={docDirRef.current} />}

            <div
              className={`editor-scroll ${isReadMode ? 'read-mode-scroll' : ''} ${showLineNumbers ? 'has-line-numbers' : ''}`.trim()}
              ref={scrollRef as React.RefObject<HTMLDivElement>}
              style={{ position: 'relative' }}
              onContextMenu={onScrollContextMenu}
              onClickCapture={(e) => {
                if (!editor) return
                const target = e.target as HTMLElement
                const linkEl = target.closest('a.md-link') as HTMLAnchorElement | null
                if (linkEl) {
                  e.preventDefault()
                  e.stopPropagation()
                  const href = linkEl.getAttribute('href') || ''
                  const wikiTarget = getWikiTargetFromHref(href)
                  if (wikiTarget) return onOpenWikiLink?.(wikiTarget)
                  const linkScope = linkEl.closest('.editor-scroll') as HTMLElement | null
                  if (linkScope && jumpToFootnote(linkEl, linkScope)) return

                  if (isReadMode) {
                    if (e.detail === 1 && href) void openExternalUrl(href)
                    return
                  }

                  if (e.ctrlKey || e.metaKey || e.detail > 1) {
                    closeEditorOverlays()
                    if (href) void openExternalUrl(href)
                    return
                  }

                  try {
                    const from = editor.view.posAtDOM(linkEl, 0)
                    const text = linkEl.textContent || ''
                    openExistingLinkDialog(from, from + text.length, href, text)
                  } catch { /* ignore */ }
                  return
                }

                if (isReadMode) return
                const imgEl = target.closest('img') as HTMLImageElement | null
                if (imgEl) {
                  e.preventDefault()
                  e.stopPropagation()
                  try {
                    const view = editor.view
                    const pos = view.posAtDOM(imgEl, 0)
                    const node = view.state.doc.nodeAt(pos)
                    if (node && node.type.name === 'image') {
                      closeEditorOverlays()
                      setImageEditPopup({
                        x: e.clientX, y: e.clientY,
                        pos,
                        src: node.attrs.src || imgEl.src || '',
                        alt: node.attrs.alt || imgEl.alt || '',
                      })
                    }
                  } catch { /* ignore */ }
                }
              }}
            >
              {showLineNumbers && <LineNumbers content={content} className="editor-line-numbers--page" topOffset={isReadMode ? 60 : 64} />}
              <EditorContent editor={editor} spellCheck={settings.spellCheckEnabled} lang="en-US" />
            </div>

            {minimapOnRight && <Minimap content={content} scrollRef={scrollRef} side="right" editorMode={editorMode} docDir={docDirRef.current} />}
          </div>
        )}

        {/* 浮动语法提示 */}
        {syntaxHint && !codeBlockLang && !hasEditorOverlay && !openToolbarGroup && !spellCheck.panelOpen && !presentationOpen && (
          <div className="syntax-hint-badge" style={{ left: syntaxHint.x, top: syntaxHint.y }}>
            {syntaxHint.text}
          </div>
        )}
      </div>

      {/* 斜杠命令菜单 */}
      {slashState.open && (
        <SlashMenu
          query={slashState.query}
          x={slashState.x}
          y={slashState.y}
          onSelect={applySlashCommand}
          onClose={() => setSlashState((s: any) => ({ ...s, open: false }))}
        />
      )}

      <WikiLinkPicker
        {...wikiLinkPicker.state}
        suggestions={wikiLinkPicker.suggestions}
        onSelect={wikiLinkPicker.select}
        onClose={wikiLinkPicker.close}
      />

      {/* 表格网格选择器 */}
      {tablePicker.open && (
        <TableGridPicker
          x={tablePicker.x}
          y={tablePicker.y}
          onSelect={(rows, cols) => {
            insertTable(rows, cols)
            setTablePicker((s: any) => ({ ...s, open: false }))
          }}
          onClose={() => setTablePicker((s: any) => ({ ...s, open: false }))}
        />
      )}

      {/* 有序列表样式选择器 */}
      {olPicker.open && (
        <OlStylePicker
          x={olPicker.x}
          y={olPicker.y}
          onApply={applyOlStyle}
          onClose={() => setOlPicker((s: any) => ({ ...s, open: false }))}
        />
      )}

      {/* 代码块语言选择器 */}
      {codeBlockLang && !hasEditorOverlay && (
        <CodeBlockLangPicker
          pos={codeBlockLang.pos}
          language={codeBlockLang.language}
          x={codeBlockLang.x}
          y={codeBlockLang.y}
          boundsRef={containerRef}
          onChange={(lang) => {
            setCodeBlockLang((s: any) => s ? { ...s, language: lang } : null)
            editor?.commands.updateAttributes('codeBlock', { language: lang })
          }}
        />
      )}

      {/* 链接弹窗 */}
      <LinkDialog
        open={linkDialog.open}
        url={linkDialog.url}
        text={linkDialog.text}
        editing={linkDialog.editing}
        onUrlChange={(url) => setLinkDialog((s: any) => ({ ...s, url }))}
        onTextChange={(text) => setLinkDialog((s: any) => ({ ...s, text }))}
        onApply={applyLink}
        onClose={closeLinkDialog}
      />

      {/* 表格右键菜单 */}
      {tableCtxMenu && (
        <TableContextMenu
          x={tableCtxMenu.x}
          y={tableCtxMenu.y}
          editor={editor}
          onClose={() => setTableCtxMenu(null)}
        />
      )}

      {/* 图片右键菜单 */}
      {imageCtxMenu && (
        <ImageContextMenu
          x={imageCtxMenu.x}
          y={imageCtxMenu.y}
          pos={imageCtxMenu.pos}
          width={imageCtxMenu.width}
          height={imageCtxMenu.height}
          widthUnit={imageCtxMenu.widthUnit}
          heightUnit={imageCtxMenu.heightUnit}
          src={imageCtxMenu.src}
          editor={editor}
          onResize={() => {
            const current = imageCtxMenu
            closeEditorOverlays()
            setImageSizeDialog({
              pos: current.pos,
              width: current.width != null ? String(current.width) : '',
              height: current.height != null ? String(current.height) : '',
              widthUnit: current.widthUnit || 'px',
              heightUnit: current.heightUnit || 'px',
            })
          }}
          onResetSize={() => {
            editor?.commands.updateImageSize({ width: null, height: null, widthUnit: 'px', heightUnit: 'px' })
            setImageCtxMenu(null)
          }}
          onHalfWidth={() => {
            editor?.commands.updateImageSize({ width: 50, widthUnit: '%', height: null, heightUnit: 'px' })
            setImageCtxMenu(null)
          }}
          onFullWidth={() => {
            editor?.commands.updateImageSize({ width: 100, widthUnit: '%', height: null, heightUnit: 'px' })
            setImageCtxMenu(null)
          }}
          onDelete={() => {
            editor?.chain().focus().deleteRange({ from: imageCtxMenu.pos, to: imageCtxMenu.pos + 1 }).run()
            setImageCtxMenu(null)
          }}
          onClose={() => setImageCtxMenu(null)}
        />
      )}

      {/* 图片尺寸调整弹窗 */}
      {imageSizeDialog && (
        <ImageSizeDialog
          pos={imageSizeDialog.pos}
          width={imageSizeDialog.width}
          height={imageSizeDialog.height}
          widthUnit={imageSizeDialog.widthUnit}
          heightUnit={imageSizeDialog.heightUnit}
          onWidthChange={(width) => setImageSizeDialog((s: any) => s ? { ...s, width } : null)}
          onHeightChange={(height) => setImageSizeDialog((s: any) => s ? { ...s, height } : null)}
          onWidthUnitChange={(unit) => setImageSizeDialog((s: any) => s ? { ...s, widthUnit: unit } : null)}
          onHeightUnitChange={(unit) => setImageSizeDialog((s: any) => s ? { ...s, heightUnit: unit } : null)}
          onPreview={(w, h) => applyImageSizePreview(imageSizeDialog.pos, w, h, imageSizeDialog.widthUnit, imageSizeDialog.heightUnit)}
          onConfirm={() => {
            if (editor && imageSizeDialog) {
              const w = imageSizeDialog.width ? parseInt(imageSizeDialog.width, 10) : null
              const h = imageSizeDialog.height ? parseInt(imageSizeDialog.height, 10) : null
              editor.commands.updateImageSize({
                width: w,
                height: h,
                widthUnit: imageSizeDialog.widthUnit,
                heightUnit: imageSizeDialog.heightUnit,
              })
            }
            setImageSizeDialog(null)
          }}
          onCancel={() => setImageSizeDialog(null)}
        />
      )}

      {/* 图片单击编辑弹窗（src + alt） */}
      {imageEditPopup && (
        <div className="image-edit-popup-overlay">
          <div ref={imageEditPopupRef} className="image-edit-popup" style={{ left: imageEditPopup.x, top: imageEditPopup.y }} onClick={(e) => e.stopPropagation()}>
            <div className="image-edit-popup-title">{t('image.editTitle')}</div>
            <label className="image-edit-popup-label">{t('image.src')}</label>
            <input
              className="image-edit-popup-input"
              type="text"
              value={imageEditPopup.src}
              onChange={(e) => setImageEditPopup((s: any) => s ? { ...s, src: e.target.value } : null)}
              onKeyDown={(e) => { if (e.key === 'Escape') setImageEditPopup(null); if (e.key === 'Enter') applyImageEdit() }}
              autoFocus
              spellCheck={false}
            />
            <label className="image-edit-popup-label">{t('image.alt')}</label>
            <input
              className="image-edit-popup-input"
              type="text"
              value={imageEditPopup.alt}
              onChange={(e) => setImageEditPopup((s: any) => s ? { ...s, alt: e.target.value } : null)}
              onKeyDown={(e) => { if (e.key === 'Escape') setImageEditPopup(null); if (e.key === 'Enter') applyImageEdit() }}
              spellCheck={false}
            />
            <div className="image-edit-popup-actions">
              <button className="image-edit-popup-btn cancel" onClick={() => setImageEditPopup(null)}>{t('common.cancel')}</button>
              <button className="image-edit-popup-btn ok" onClick={applyImageEdit}>{t('common.ok')}</button>
            </div>
          </div>
        </div>
      )}

      <AiSelectionButton editor={editor} visible={editorMode === 'live' && !hideAiSelectionButton} onAdd={onAddAiContext} />
      <AiAssistantPanel ai={aiAssistant} t={t} />
      <SpellCheckPanel spellCheck={spellCheck} t={t} />
      <PresentationMode
        open={presentationOpen}
        content={content}
        docDir={docDirRef.current}
        onClose={() => setPresentationOpen(false)}
        t={t}
      />

      <div className="focus-overlay" />
    </div>
  )
}
