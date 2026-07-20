import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './plugins/ResizableImage'
import TextStyle from '@tiptap/extension-text-style'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import OrderedList from '@tiptap/extension-ordered-list'
import BulletList from '@tiptap/extension-bullet-list'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { lowlight } from '../lib/lowlight'
import {
  forwardRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { AppSettings, EditorMode } from '../types'
import { TyporaRender } from './plugins/TyporaRender'
import { MathInline, MathBlock } from './extensions/MathNode'
import { ImageUpload } from './extensions/ImageUploadNode'
import { SlashMenu, type SlashCommand } from './SlashMenu'
import { useI18n } from '../i18n'
import { debounce, isLargeDocument } from '../utils/performance'
import { invoke } from '@tauri-apps/api/core'
import { listen, type Event as TauriEvent } from '@tauri-apps/api/event'
import { isTauri } from '../utils/tauri'
import { matchKeymap, getCommandMeta, resolveKeymap } from '../utils/keymap'
import { notifyError, notifySuccess } from '../utils/toast'

// 导入拆分出的模块
import { markdownToHtml, htmlToMarkdown } from '../utils/markdown'
import { toAssetUrl } from '../utils/asset'
import { Minimap } from './editor/Minimap'
import { LineNumbers } from './editor/LineNumbers'
import {
  TableGridPicker,
  OlStylePicker,
  CodeBlockLangPicker,
} from './editor/EditorPickers'
import {
  LinkDialog,
  TableContextMenu,
  ImageContextMenu,
  ImageSizeDialog,
} from './editor/EditorMenus'
import { FindReplaceBar } from './FindReplaceBar'

// ── lowlight 实例已在 src/lib/lowlight.ts 中配置（注册了常用语言）──

// 有序列表扩展：增加 listStyle 属性（渲染为 data-ls），支持工具栏切换编号样式
const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: 'decimal',
        parseHTML: (el) => (el.getAttribute('data-ls') as string) || 'decimal',
        renderHTML: (attrs) =>
          attrs.listStyle && attrs.listStyle !== 'decimal'
            ? { 'data-ls': attrs.listStyle }
            : {},
      },
    }
  },
})

// 无序列表扩展：增加 marker 属性（渲染为 data-marker），保留原始列表标记（* / - / +）
// 解决 MD→HTML→TipTap→HTML→MD 往返转换时 * 被统一为 - 的问题
const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: {
        default: '-',
        parseHTML: (el) => (el.getAttribute('data-marker') as string) || '-',
        renderHTML: (attrs) =>
          attrs.marker && attrs.marker !== '-'
            ? { 'data-marker': attrs.marker }
            : {},
      },
    }
  },
})

// 表格扩展：增加 separators 属性（渲染为 data-separators），保留原始分隔行格式
// 解决 MD→HTML→TipTap→HTML→MD 往返转换时 | --------- | 被缩短为 | --- | 的问题
const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      separators: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-separators'),
        renderHTML: (attrs) =>
          attrs.separators ? { 'data-separators': attrs.separators } : {},
      },
    }
  },
})

/** 对外暴露的命令式接口，供 App 调用（如拖拽图片插入） */
export interface EditorHandle {
  insertImageMarkdown: (url: string, alt?: string) => void
  /** 从磁盘路径上传图片（拖拽到窗口）：占位 + 真实上传进度 */
  insertImageUploadFromPath: (srcPath: string) => void
  /** 从内存 Blob 上传图片（粘贴 / 编辑器内拖入）：占位 + 快速落盘 */
  insertImageUploadFromBlob: (file: File) => void
  focusEditor: () => void
  getEditor: () => TiptapEditor | null
  /** 获取当前 Markdown 内容（优先返回原始内容，避免往返转换损失） */
  getContent: () => string
}

interface EditorProps {
  content: string
  onChange: (content: string) => void
  settings: AppSettings
  editorMode: EditorMode
  onEditorModeChange: (mode: EditorMode) => void
  onSlashCommand?: (cmd: string) => void
  scrollRef?: RefObject<HTMLDivElement | null>
  onToggleMinimap?: () => void
  findReplaceVisible: boolean
  findReplaceMode: 'find' | 'replace'
  onFindReplaceClose: () => void
  onFindReplaceModeChange: (mode: 'find' | 'replace') => void
  filePath?: string | null
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { content, onChange, settings, editorMode, onEditorModeChange: _onEditorModeChange, onSlashCommand, scrollRef, onToggleMinimap: _onToggleMinimap,
    findReplaceVisible, findReplaceMode, onFindReplaceClose, onFindReplaceModeChange, filePath },
  ref
) {
  const { t } = useI18n()
  
  // ── 状态管理 ──
  const [tableCtxMenu, setTableCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [slashState, setSlashState] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  })
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; text: string }>({
    open: false, url: '', text: '',
  })
  // 图片右键菜单
  const [imageCtxMenu, setImageCtxMenu] = useState<{
    x: number; y: number; pos: number;
    width: number | null; height: number | null;
    widthUnit: string; heightUnit: string; src: string
  } | null>(null)
  // 图片尺寸调整弹窗
  const [imageSizeDialog, setImageSizeDialog] = useState<{
    pos: number; width: string; height: string; widthUnit: string; heightUnit: string
  } | null>(null)
  // 浮动语法提示（焦点左上方）
  const [syntaxHint, setSyntaxHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const [codeBlockLang, setCodeBlockLang] = useState<{ pos: number; language: string; x: number; y: number } | null>(null)
  // 表格网格选择器
  const [tablePicker, setTablePicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  // 有序列表样式选择器
  const [olPicker, setOlPicker] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  const [headingPickerOpen, setHeadingPickerOpen] = useState(false)

  const editorRef = useRef<TiptapEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // filePath 的 ref，用于 paste 处理时获取最新路径
  const filePathRef = useRef<string | null>(null)
  useEffect(() => { filePathRef.current = filePath ?? null }, [filePath])
  // docDir ref：用于 markdownToHtml / htmlToMarkdown 中图片路径转换
  const docDirRef = useRef<string | null>(null)
  useEffect(() => { docDirRef.current = filePath ? filePath.replace(/[\\/][^\\/]+$/, '') : null }, [filePath])
  // 快捷键 keymap 的 ref，确保 handleShortcut 始终读取最新配置
  const keymapRef = useRef<Record<string, string>>(resolveKeymap(settings.keymap))
  useEffect(() => { keymapRef.current = resolveKeymap(settings.keymap) }, [settings.keymap])

  // ── 图片上传进度事件 ──
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | null = null
    let cancelled = false
    listen('asset://upload-progress', (e: TauriEvent<{ id: string; loaded: number; total: number; status: string; src?: string }>) => {
      const p = e.payload as { id: string; loaded: number; total: number; status: string; src?: string }
      const ed = editorRef.current
      if (!ed) return
      const progress = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0
      const patch: Record<string, unknown> = { progress }
      if (p.status === 'done' && p.src) {
        patch.status = 'done'
        patch.src = p.src
        patch.progress = 100
      } else if (p.status === 'error') {
        patch.status = 'error'
        patch.error = 'upload failed'
      }
      updateUploadNode(ed, p.id, patch)
    }).then((u) => { if (cancelled) u(); else unlisten = u })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  // ── 图片上传取消（占位节点上点击 ×）──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; action: string }>).detail
      if (detail.action === 'cancel' && editorRef.current) {
        removeUploadNode(editorRef.current, detail.id)
      }
    }
    window.addEventListener('fkemark:img-upload-action', handler)
    return () => window.removeEventListener('fkemark:img-upload-action', handler)
  }, [])

  // ── 原始内容保护：避免 MD→HTML→MD 往返转换丢失格式 ──
  // 保存外部传入的原始 Markdown，仅在用户编辑后才使用 htmlToMarkdown 转换结果
  const originalContentRef = useRef<string>('')
  const hasUserEditedRef = useRef(false)
  // 标志位：正在程序化设置内容（setContent），期间 onUpdate 不应标记为用户编辑
  const isSettingContentRef = useRef(false)

  // ── 粘贴截图：写入文档同级 assets/ 目录，以占位 + 进度方式插入 ──
  function handlePasteImage(
    _view: unknown,
    event: ClipboardEvent
  ): boolean {
    const clipboardData = event.clipboardData
    if (!clipboardData) return false

    const imageItems = Array.from(clipboardData.items).filter(
      (item) => item.type.startsWith('image/')
    )
    if (imageItems.length === 0) return false

    event.preventDefault()
    for (const item of imageItems) {
      const file = item.getAsFile()
      if (file) insertImageUploadFromBlob(file)
    }
    return true
  }

  // ── 图片上传占位 + 进度（统一 Toast 反馈）──
  function uid(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
    return `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function updateUploadNode(ed: TiptapEditor, id: string, patch: Record<string, unknown>) {
    let foundPos = -1
    let foundNode: any = null
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'imageUpload' && (node.attrs as { id: string }).id === id) {
        foundPos = pos
        foundNode = node
        return false
      }
      return true
    })
    if (foundPos < 0) return
    const newAttrs = { ...foundNode.attrs, ...patch }
    // 上传完成：将 imageUpload 占位节点替换为正式 image 节点
    // image 节点由 ResizableImage 扩展管理，支持右键菜单 / 尺寸调整 / renderHTML 序列化
    if (newAttrs.status === 'done' && newAttrs.src) {
      const imageType = ed.schema.nodes.image
      const tr = ed.state.tr.setNodeMarkup(foundPos, imageType, {
        src: newAttrs.src,
        alt: newAttrs.name || '',
      })
      ed.view.dispatch(tr)
      return
    }
    const tr = ed.state.tr.setNodeMarkup(foundPos, undefined, newAttrs)
    ed.view.dispatch(tr)
  }

  function removeUploadNode(ed: TiptapEditor, id: string) {
    let foundPos = -1
    let foundNode: any = null
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'imageUpload' && (node.attrs as { id: string }).id === id) {
        foundPos = pos
        foundNode = node
        return false
      }
      return true
    })
    if (foundPos < 0) return
    const tr = ed.state.tr.delete(foundPos, foundPos + foundNode.nodeSize)
    ed.view.dispatch(tr)
  }

  function insertImageUploadNode(id: string, fileName: string, initialProgress = 0) {
    editor?.chain().focus().insertContent({
      type: 'imageUpload',
      attrs: { id, name: fileName, progress: initialProgress, status: 'uploading', src: '', error: '' },
    }).run()
  }

  // 从磁盘路径上传（拖拽到窗口）：真实上传进度
  function insertImageUploadFromPath(srcPath: string) {
    const ed = editor
    if (!ed) return
    const id = uid()
    const fileName = srcPath.split(/[\\/]/).pop() || 'image'
    insertImageUploadNode(id, fileName, 0)
    if (!isTauri()) {
      notifyError('当前环境不支持文件上传')
      removeUploadNode(ed, id)
      return
    }
    const docDir = filePathRef.current?.replace(/[\\/][^\\/]+$/, '')
    if (!docDir) {
      notifyError('请先保存文档后再拖入图片')
      removeUploadNode(ed, id)
      return
    }
    void (async () => {
      try {
        const relPath = await invoke<string>('upload_asset', { src: srcPath, docDir, id })
        const assetUrl = toAssetUrl(relPath, docDir)
        updateUploadNode(ed, id, { src: assetUrl, status: 'done', progress: 100 })
        notifySuccess(`图片已插入：${fileName}`)
      } catch (e) {
        updateUploadNode(ed, id, { status: 'error', error: String(e) })
        notifyError(`图片上传失败: ${String(e)}`)
      }
    })()
  }

  // 从内存 Blob 上传（粘贴 / 编辑器内拖入）：落盘后完成
  function insertImageUploadFromBlob(file: File) {
    const ed = editor
    if (!ed) return
    const id = uid()
    const fileName = file.name || 'pasted-image'
    insertImageUploadNode(id, fileName, 30)
    void (async () => {
      try {
        if (!isTauri() || !filePathRef.current) {
          const base64 = await fileToDataURL(file)
          updateUploadNode(ed, id, { src: base64, status: 'done', progress: 100 })
          return
        }
        const docDir = filePathRef.current.replace(/[\\/][^\\/]+$/, '')
        const ext = file.type.split('/')[1] || 'png'
        const assetName = `paste_${Date.now()}.${ext}`
        const fullPath = `${docDir}/assets/${assetName}`
        const buf = await file.arrayBuffer()
        await invoke('write_binary_file', { filePath: fullPath, data: Array.from(new Uint8Array(buf)) })
        updateUploadNode(ed, id, { src: toAssetUrl(`./assets/${assetName}`, docDir), status: 'done', progress: 100 })
      } catch (e) {
        updateUploadNode(ed, id, { status: 'error', error: String(e) })
        notifyError(`图片插入失败: ${String(e)}`)
      }
    })()
  }

  function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  // 编辑器内拖入图片（Blob，无磁盘路径）
  function handleDropImage(_view: unknown, event: DragEvent): boolean {
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return false
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return false
    event.preventDefault()
    for (const file of imageFiles) {
      insertImageUploadFromBlob(file)
    }
    return true
  }

  // ── 编辑器初始化 ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // 用 CodeBlockLowlight 替代
        orderedList: false, // 用带 listStyle 属性的 StyledOrderedList 替代
        bulletList: false, // 用带 marker 属性的 CustomBulletList 替代
      }),
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'md-link' },
      }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
      StyledOrderedList,
      CustomBulletList,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      CustomTable.configure({
        resizable: true,
        HTMLAttributes: { class: 'editor-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TyporaRender,
      MathInline,
      MathBlock,
      ImageUpload,
    ],
    // 初始化时即把 markdown 转为 HTML，避免首次渲染显示无格式的原始文本
    content: markdownToHtml(content || '', docDirRef.current),
    onUpdate: ({ editor, transaction }) => {
      // 仅文档内容变更时才序列化回存，跳过纯装饰器更新（如 markdown 语法符号显隐）
      if (!transaction.docChanged) return
      // 仅在非程序化 setContent 期间才标记为用户编辑
      if (!isSettingContentRef.current) {
        hasUserEditedRef.current = true
      }
      // 大文档使用防抖更新，减少频繁 onChange 导致的重新渲染
      const html = editor.getHTML()
      const md = htmlToMarkdown(html, docDirRef.current)
      if (isLargeDocument(md)) {
        // 大文档：延迟 100ms
        if (!(editor as unknown as { _debouncedOnChange?: ReturnType<typeof debounce> })._debouncedOnChange) {
          ;(editor as unknown as { _debouncedOnChange?: ReturnType<typeof debounce> })._debouncedOnChange = debounce(() => {
            onChange(htmlToMarkdown(editor.getHTML(), docDirRef.current))
          }, 100)
        }
        ;(editor as unknown as { _debouncedOnChange?: ReturnType<typeof debounce> })._debouncedOnChange?.()
      } else {
        onChange(md)
      }
    },
    editorProps: {
      attributes: { class: 'editor-inner' },
      handleKeyDown: (view, event) => {
        const ed = editorRef.current
        if (!ed) return false
        return handleShortcut(ed, event, view)
      },
      handlePaste: (view, event) => {
        return handlePasteImage(view, event)
      },
      handleDrop: (view, event) => {
        return handleDropImage(view, event)
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // ── 对外暴露插入图片能力 ──
  const insertImageMarkdown = useCallback((url: string, alt?: string) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent({ type: 'image', attrs: { src: url, alt: alt || '', title: null } })
      .run()
  }, [editor])

  useImperativeHandle(ref, () => ({
    insertImageMarkdown,
    insertImageUploadFromPath,
    insertImageUploadFromBlob,
    focusEditor: () => editor?.commands.focus(),
    getEditor: () => editor,
    getContent: () => {
      // 如果用户没有编辑过，返回原始内容（避免往返转换损失）
      if (!hasUserEditedRef.current && originalContentRef.current) {
        return originalContentRef.current
      }
      // 用户已编辑或无原始内容，使用转换后的内容
      return editor ? htmlToMarkdown(editor.getHTML(), docDirRef.current) : originalContentRef.current
    },
  }), [editor, insertImageMarkdown])

  // ── 视图模式：控制可编辑性 ──
  useEffect(() => {
    if (!editor) return
    editor.setEditable(editorMode !== 'read')
  }, [editorMode, editor])

  // ── 内容同步（源码模式跳过，避免每键触发 setContent）──
  useEffect(() => {
    if (!editor || editorMode === 'source') return
    if (content !== htmlToMarkdown(editor.getHTML(), docDirRef.current)) {
      // 外部内容变化（如切换标签、打开新文件）：更新原始内容并重置编辑标记
      originalContentRef.current = content
      hasUserEditedRef.current = false
      // 设置标志位，防止 setContent 触发的 onUpdate 误标记为用户编辑
      isSettingContentRef.current = true
      editor.commands.setContent(markdownToHtml(content, docDirRef.current))
      // setContent 的 onUpdate 是同步触发的，这里在下一微任务中重置标志位
      // 使用 setTimeout(0) 确保 onUpdate 处理完毕后再重置
      setTimeout(() => { isSettingContentRef.current = false }, 0)
    }
  }, [content, editor, editorMode])

  // ── 浮动语法提示：跟踪光标位置，在焦点左上方显示块级前缀 ──
  useEffect(() => {
    if (!editor || editorMode !== 'live') { setSyntaxHint(null); return }
    const handler = () => {
      const { selection, doc } = editor.state
      if (!selection.empty) { setSyntaxHint(null); return }
      const $from = doc.resolve(selection.from)
      // 只有光标在块的最前方（offset=0）时才显示语法提示，避免在文本中间也悬浮显示
      if ($from.parentOffset !== 0) { setSyntaxHint(null); return }
      const parts: string[] = []
      const block = $from.parent
      if (block.type.name === 'heading') {
        parts.push('#'.repeat(block.attrs.level) + ' ')
      } else if (block.type.name === 'blockquote') {
        parts.push('> ')
      } else if (block.type.name === 'codeBlock') {
        parts.push('```')
      }
      let depth = $from.depth
      while (depth > 0) {
        const ancestor = $from.node(depth)
        if (ancestor.type.name === 'listItem') {
          const listType = $from.node(depth - 1).type.name
          if (listType === 'bulletList') {
            parts.push('- ')
          } else if (listType === 'orderedList') {
            parts.push(`${$from.index(depth - 1) + 1}. `)
          }
        } else if (ancestor.type.name === 'taskItem') {
          parts.push(ancestor.attrs.checked ? '- [x] ' : '- [ ] ')
        }
        depth--
      }
      const marks = $from.marks()
      if (marks.some((m) => m.type.name === 'bold')) parts.push('**')
      if (marks.some((m) => m.type.name === 'italic')) parts.push('*')
      if (marks.some((m) => m.type.name === 'strike')) parts.push('~~')
      if (marks.some((m) => m.type.name === 'code')) parts.push('`')

      const text = parts.join('').trim()
      if (!text) { setSyntaxHint(null); return }
      try {
        const coords = editor.view.coordsAtPos(selection.from)
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = Math.max(4, coords.left - rect.left - 4)
        const y = Math.max(4, coords.top - rect.top - 22)
        setSyntaxHint({ text, x, y })
      } catch { /* ignore */ }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, editorMode])

  // ── 代码块语言选择器：跟踪光标是否在 codeBlock 内 ──
  useEffect(() => {
    if (!editor) { setCodeBlockLang(null); return }
    const handler = () => {
      const { selection, doc } = editor.state
      const $from = doc.resolve(selection.from)
      const block = $from.parent
      if (block.type.name !== 'codeBlock') { setCodeBlockLang(null); return }
      try {
        const blockStart = $from.before($from.depth)
        const coords = editor.view.coordsAtPos(blockStart)
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setCodeBlockLang({
          pos: blockStart,
          language: block.attrs.language || 'plaintext',
          x: coords.right - rect.left - 120,
          y: coords.top - rect.top + 6,
        })
      } catch { /* ignore */ }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

  // ── 滚动时隐藏代码块语言选择器（避免下拉框与代码块位置不同步）──
  useEffect(() => {
    if (!editor) return
    const el = scrollRef?.current || containerRef.current?.querySelector('.editor-scroll')
    if (!el) return
    const onScroll = () => setCodeBlockLang(null)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [editor, editorMode, scrollRef])

  // ── 链接弹窗 ──
  function openLinkDialog() {
    const ed = editorRef.current
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    const selectedText = empty ? '' : ed.state.doc.textBetween(from, to, ' ')
    setLinkDialog({ open: true, url: '', text: selectedText })
  }

  function applyLink() {
    if (!editor) return
    const { url, text } = linkDialog
    if (!url.trim()) { setLinkDialog({ open: false, url: '', text: '' }); return }
    const { from, to, empty } = editor.state.selection
    if (empty) {
      const display = text.trim() || url.trim()
      const start = from
      editor.chain().focus()
        .insertContent({ type: 'text', text: display, marks: [{ type: 'link', attrs: { href: url.trim() } }] })
        .setTextSelection({ from: start, to: start + display.length })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
      void from; void to
    }
    setLinkDialog({ open: false, url: '', text: '' })
  }

  // ── 编辑器快捷键处理 ──
  function handleShortcut(
    ed: TiptapEditor,
    event: KeyboardEvent,
    view: { state: { selection: { $from: { start: () => number; parent: { textContent: string }; parentOffset: number; depth: number; node: (d: number) => { type: { name: string }; childCount: number } } } } }
  ): boolean {
    const key = event.key

    // ── 可自定义命令（查 keymap 反查，仅处理 editor 作用域）──
    const cmd = matchKeymap(event, keymapRef.current)
    if (cmd && getCommandMeta(cmd)?.scope === 'editor') {
      event.preventDefault()
      switch (cmd) {
        case 'heading1': ed.chain().focus().toggleHeading({ level: 1 }).run(); break
        case 'heading2': ed.chain().focus().toggleHeading({ level: 2 }).run(); break
        case 'heading3': ed.chain().focus().toggleHeading({ level: 3 }).run(); break
        case 'heading4': ed.chain().focus().toggleHeading({ level: 4 }).run(); break
        case 'heading5': ed.chain().focus().toggleHeading({ level: 5 }).run(); break
        case 'heading6': ed.chain().focus().toggleHeading({ level: 6 }).run(); break
        case 'paragraph': ed.chain().focus().setParagraph().run(); break
        case 'bold': ed.chain().focus().toggleBold().run(); break
        case 'italic': ed.chain().focus().toggleItalic().run(); break
        case 'strike': ed.chain().focus().toggleStrike().run(); break
        case 'blockquote': ed.chain().focus().toggleBlockquote().run(); break
        case 'link': openLinkDialog(); break
      }
      return true
    }
    // ── Tab 在表格单元格内导航 + 最后一格新建行 ──
    if (key === 'Tab' && !event.shiftKey) {
      const { $from } = view.state.selection
      let inCell = false
      let cellDepth = -1
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d)
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          inCell = true
          cellDepth = d
          break
        }
      }
      if (inCell && cellDepth > 0) {
        event.preventDefault()
        const beforePos = ed.state.selection.from
        ed.commands.goToNextCell?.() || false
        if (ed.state.selection.from === beforePos) {
          ed.chain().focus().addRowAfter().run()
          setTimeout(() => {
            ed.commands.goToNextCell?.()
          }, 0)
        }
        return true
      }
    }
    // Enter 处理：--- → 分割线，``` → 代码块
    if (key === 'Enter' && !event.shiftKey) {
      const { $from } = view.state.selection
      const parent = $from.parent
      const textBefore = parent.textContent.slice(0, $from.parentOffset)
      const textAfter = parent.textContent.slice($from.parentOffset)
      const atEnd = $from.parentOffset === parent.textContent.length

      // --- → 分割线（仅行尾触发）
      if (atEnd && /^---\s*$/.test(textBefore)) {
        event.preventDefault()
        const from = $from.start()
        const to = from + parent.textContent.length
        ed.chain().focus().deleteRange({ from, to }).setHorizontalRule().run()
        return true
      }

      // ``` → 代码块
      // 场景1：行尾输入 ```lang + Enter
      // 场景2：输入六个反引号 `````` 光标在中间回车 → 后三个作为结尾标记（丢弃），创建代码块
      const fenceMatch = textBefore.match(/^```(\w*)\s*$/)
      if (fenceMatch && (atEnd || /^```\s*$/.test(textAfter))) {
        event.preventDefault()
        const from = $from.start()
        const to = from + parent.textContent.length
        const lang = fenceMatch[1] || 'plaintext'
        ed.chain().focus().deleteRange({ from, to }).setCodeBlock({ language: lang }).run()
        return true
      }
    }
    return false
  }

  // ── 斜杠命令：监听 transaction 检测 / 输入 ──
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      const { selection } = editor.state
      if (!selection.empty) { setSlashState((s) => (s.open ? { ...s, open: false } : s)); return }
      const $from = selection.$from
      if ($from.parent.type.name !== 'paragraph' && $from.parent.type.name !== 'heading') {
        setSlashState((s) => (s.open ? { ...s, open: false } : s)); return
      }
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
      const m = textBefore.match(/(?:^|\s)\/(\w*)$/)
      if (m) {
        const query = m[1]
        try {
          const coords = editor.view.coordsAtPos(selection.from)
          setSlashState({ open: true, query, x: coords.left, y: coords.bottom + 4 })
        } catch { /* ignore */ }
      } else {
        setSlashState((s) => (s.open ? { ...s, open: false } : s))
      }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

  const applySlashCommand = useCallback((cmd: SlashCommand) => {
    if (!editor) return
    const { selection } = editor.state
    const $from = selection.$from
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
    const slashIdx = textBefore.lastIndexOf('/')
    if (slashIdx >= 0) {
      const from = $from.start() + slashIdx
      editor.chain().focus().deleteRange({ from, to: selection.from }).run()
    }
    switch (cmd.id) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'h4': editor.chain().focus().toggleHeading({ level: 4 }).run(); break
      case 'bold': insertInlineMark('bold', '粗体'); break
      case 'italic': insertInlineMark('italic', '斜体'); break
      case 'strike': insertInlineMark('strike', '删除线'); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'ul': editor.chain().focus().toggleBulletList().run(); break
      case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'code': insertInlineMark('code', '代码'); break
      case 'codeblock': editor.chain().focus().setCodeBlock({ language: 'plaintext' }).run(); break
      case 'table':
        insertTable(3, 3)
        break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'image': openImagePicker(); break
      case 'link': openLinkDialog(); break
      case 'mathblock':
        editor.chain().focus().insertContent({ type: 'mathBlock', attrs: { tex: 'E = mc^2' } }).run()
        break
      case 'mathinline':
        editor.chain().focus().insertContent({ type: 'mathInline', attrs: { tex: 'a^2 + b^2 = c^2' } }).run()
        break
    }
    setSlashState((s) => ({ ...s, open: false }))
  }, [editor])

  // ── 插入表格 ──
  function insertTable(rows: number, cols: number) {
    if (!editor) return
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  }

  // ── 工具栏表格按钮：弹出网格选择器 ──
  function openTablePicker(e: React.MouseEvent) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTablePicker({ open: true, x: rect.left, y: rect.bottom + 4 })
  }

  // ── 工具栏有序列表样式按钮：弹出样式选择器 ──
  function toggleOlPicker(e: React.MouseEvent) {
    e.preventDefault()
    if (olPicker.open) {
      setOlPicker({ open: false, x: 0, y: 0 })
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setOlPicker({ open: true, x: rect.left, y: rect.bottom + 4 })
    }
  }

  // 应用有序列表编号样式
  function applyOlStyle(style: string) {
    if (!editor) return
    const { $from } = editor.state.selection
    let inOl = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'orderedList') { inOl = true; break }
    }
    if (!inOl) {
      editor.chain().focus().toggleOrderedList().run()
    }
    editor.chain().focus().updateAttributes('orderedList', { listStyle: style }).run()
    setOlPicker((s) => ({ ...s, open: false }))
  }

  // ── 应用设置（行高 / 编辑区宽度 / 标记显隐）──
  // 字体与字号已迁移到 App.tsx 顶层 CSS 变量（--font-editor / --editor-font-size），
  // 此处仅保留每个编辑器实例独立的行高与编辑区宽度。
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement
    const lhMap = { compact: '1.5', normal: '1.8', relaxed: '2.2' }
    el.style.lineHeight = lhMap[settings.lineHeight] || '1.8'
    const ewMap = { narrow: '680px', medium: '800px', wide: '960px' }
    document.documentElement.style.setProperty('--editor-max-w', ewMap[settings.editorWidth] || '800px')
    if (settings.showMarkers) document.body.classList.remove('hide-markers')
    else document.body.classList.add('hide-markers')
  }, [editor, settings.lineHeight, settings.editorWidth, settings.showMarkers])

  // ── 自动补全括号 ──
  useEffect(() => {
    if (!editor || !settings.autoBracket) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!editor.isFocused) return
      const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
      const closing = pairs[e.key]
      if (closing) {
        e.preventDefault()
        editor.commands.insertContent(`${e.key}${closing}`)
        editor.commands.focus()
        setTimeout(() => {
          const { from } = editor.state.selection
          editor.commands.setTextSelection(from - 1)
        }, 0)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editor, settings.autoBracket])

  // ── 行内 mark：有选区则切换，无选区则插入占位文本并选中 ──
  function insertInlineMark(markName: string, placeholder: string) {
    if (!editor) return
    const { from, empty } = editor.state.selection
    if (empty) {
      editor.chain().focus()
        .insertContent({ type: 'text', text: placeholder, marks: [{ type: markName }] })
        .setTextSelection({ from, to: from + placeholder.length })
        .run()
    } else {
      switch (markName) {
        case 'bold': editor.chain().focus().toggleBold().run(); break
        case 'italic': editor.chain().focus().toggleItalic().run(); break
        case 'strike': editor.chain().focus().toggleStrike().run(); break
        case 'code': editor.chain().focus().toggleCode().run(); break
      }
    }
  }

  const execCmd = useCallback((cmd: string) => {
    if (!editor) return
    switch (cmd) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'bold': insertInlineMark('bold', '粗体'); break
      case 'italic': insertInlineMark('italic', '斜体'); break
      case 'strike': insertInlineMark('strike', '删除线'); break
      case 'code': insertInlineMark('code', '代码'); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'list': editor.chain().focus().toggleBulletList().run(); break
      case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo': editor.chain().focus().toggleTaskList().run(); break
      case 'hr': editor.chain().focus().setHorizontalRule().run(); break
      case 'link': openLinkDialog(); break
      case 'image': openImagePicker(); break
      case 'table': {
        const rect = editor.view.dom.getBoundingClientRect()
        setTablePicker({ open: true, x: rect.left + 40, y: rect.top + 40 })
        break
      }
      case 'codeblock': editor.chain().focus().toggleCodeBlock().run(); break
      case 'slash': onSlashCommand?.('slash'); break
    }
  }, [editor, onSlashCommand])

  // ── 图片选择器 ──
  function openImagePicker() {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        insertImageMarkdown(reader.result as string, file.name)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  // 将菜单定位钳制在视口内
  function clampMenuPos(x: number, y: number, estW = 210, estH = 300) {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - estW - pad)
    const maxY = Math.max(pad, window.innerHeight - estH - pad)
    return {
      x: Math.min(Math.max(pad, x), maxX),
      y: Math.min(Math.max(pad, y), maxY),
    }
  }

  const onScrollContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.nativeEvent.stopImmediatePropagation()
    const target = e.target as HTMLElement

    // 图片右键
    const imgEl = target.closest('img') as HTMLImageElement | null
    if (imgEl) {
      const imgPos = findImagePos(imgEl)
      if (imgPos !== null) {
        const node = editor?.state.doc.nodeAt(imgPos)
        setImageCtxMenu({
          ...clampMenuPos(e.clientX, e.clientY, 220, 200),
          pos: imgPos,
          width: node?.attrs?.width ?? null,
          height: node?.attrs?.height ?? null,
          widthUnit: node?.attrs?.widthUnit ?? 'px',
          heightUnit: node?.attrs?.heightUnit ?? 'px',
          src: imgEl.src,
        })
        return
      }
    }

    // 表格单元格右键
    if (target.closest('table.editor-table, .tableWrapper')) {
      setTableCtxMenu(clampMenuPos(e.clientX, e.clientY, 210, 300))
      return
    }
    // 通用右键菜单已移除：仅保留表格和图片区域的上下文菜单
  }

  // 查找图片节点在 ProseMirror 文档中的位置
  function findImagePos(imgEl: HTMLImageElement): number | null {
    if (!editor) return null
    let pos: number | null = null
    editor.state.doc.descendants((node, nodePos) => {
      if (pos !== null) return false
      if (node.type.name === 'image') {
        if (node.attrs.src === imgEl.getAttribute('src')) {
          pos = nodePos
          return false
        }
      }
      return true
    })
    return pos
  }

  // 图片尺寸实时预览
  function applyImageSizePreview(_pos: number, width: string | null, height: string | null, widthUnit: string, heightUnit: string) {
    if (!editor) return
    const w = width ? parseInt(width, 10) : null
    const h = height ? parseInt(height, 10) : null
    editor.commands.updateImageSize({ width: w, height: h, widthUnit, heightUnit })
  }

  // ── 菜单关闭事件监听 ──
  useEffect(() => {
    if (!imageCtxMenu) return
    const close = () => setImageCtxMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [imageCtxMenu])

  useEffect(() => {
    if (!tableCtxMenu) return
    const close = () => setTableCtxMenu(null)
    document.addEventListener('click', close)
    return () => { document.removeEventListener('click', close) }
  }, [tableCtxMenu])

  useEffect(() => {
    if (!slashState.open) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.slash-menu')) setSlashState((s) => ({ ...s, open: false }))
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [slashState.open])

  useEffect(() => {
    if (!tablePicker.open) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.table-grid-picker') && !target.closest('[data-table-btn]')) {
        setTablePicker((s) => ({ ...s, open: false }))
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tablePicker.open])

  useEffect(() => {
    if (!olPicker.open) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.ol-style-picker') && !target.closest('[data-ol-btn]')) {
        setOlPicker((s) => ({ ...s, open: false }))
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [olPicker.open])

  useEffect(() => {
    if (!headingPickerOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.tb-heading-dropdown')) {
        setHeadingPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [headingPickerOpen])

  // ── 加载状态 ──
  if (!editor) {
    return (
      <div className="editor-area">
        <div className="welcome-screen">
          <div className="welcome-tagline" style={{ fontSize: 14 }}>编辑器加载中...</div>
        </div>
      </div>
    )
  }

  const isReadMode = editorMode === 'read'
  const isSourceMode = editorMode === 'source'
  const minimapOnLeft = settings.showMinimap && settings.minimapSide === 'left'
  const minimapOnRight = settings.showMinimap && settings.minimapSide === 'right'

  return (
    <div className="editor-area" ref={containerRef}>
      <div className="editor-pane">
        {/* 查找替换栏 */}
        <FindReplaceBar
          editor={editor}
          visible={findReplaceVisible && !isSourceMode}
          mode={findReplaceMode}
          onClose={onFindReplaceClose}
          onModeChange={onFindReplaceModeChange}
        />

        {/* 工具栏 */}
        {!isReadMode && !isSourceMode && (
          <div className={`editor-toolbar ${settings.toolbarFloating ? 'floating' : ''}`}>
            {/* 标题下拉选择（H1-H6） */}
            <div className="tb-heading-dropdown">
              <button
                className="tb-btn"
                title="标题 (Ctrl+1~7)"
                onClick={() => setHeadingPickerOpen(!headingPickerOpen)}
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
                      <span style={{ color: 'var(--muted)', fontSize: 10 }}>标题 {level}</span>
                    </button>
                  ))}
                  <div className="app-menu-divider" style={{ margin: '4px 0' }} />
                  <button
                    className="heading-picker-item"
                    onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setParagraph().run(); setHeadingPickerOpen(false) }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>正文</span>
                    <span style={{ color: 'var(--muted)', fontSize: 10 }}>段落</span>
                  </button>
                </div>
              )}
            </div>
            <span className="tb-sep" />
            <button className="tb-btn" title="粗体 (Ctrl+B) — **文本**" onClick={() => execCmd('bold')}><strong>B</strong></button>
            <button className="tb-btn" title="斜体 (Ctrl+I) — *文本*" onClick={() => execCmd('italic')}><em>I</em></button>
            <button className="tb-btn" title="删除线 (Alt+S) — ~~文本~~" onClick={() => execCmd('strike')}><s>S</s></button>
            <button className="tb-btn" title="行内代码 — `代码`" onClick={() => execCmd('code')}>&lt;/&gt;</button>
            <span className="tb-sep" />
            <button className="tb-btn" title="引用 (Ctrl+Shift+Q) — &gt; 文本" onClick={() => execCmd('quote')}>❝</button>
            <button className="tb-btn" title="无序列表 — - 项" onClick={() => execCmd('list')}>≡</button>
            {/* 有序列表下拉按钮：点击直接打开编号样式选择器 */}
            <button
              className="tb-btn"
              title={t('toolbar.ol')}
              data-ol-btn
              onClick={toggleOlPicker}
            >
              1.<svg viewBox="0 0 24 24" width="7" height="7" style={{ marginLeft: 1 }} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button className="tb-btn" title="任务列表 — - [ ] 待办" onClick={() => execCmd('todo')}>☐</button>
            <button className="tb-btn" title="分割线 — ---" onClick={() => execCmd('hr')}>―</button>
            <span className="tb-sep" />
            <button
              className="tb-btn"
              title="表格 — | 列 | 列 |"
              data-table-btn
              onClick={openTablePicker}
            >▦</button>
            <button className="tb-btn" title="链接 (Ctrl+K) — [文本](url)" onClick={() => execCmd('link')}>🔗</button>
            <button className="tb-btn" title="图片 — ![alt](url)" onClick={() => execCmd('image')}>🖼</button>
            {/* 代码块按钮 */}
            <button className="tb-btn" title="代码块 — ```语言" onClick={() => execCmd('codeblock')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </button>
            <span style={{ flex: 1 }} />
            <button className="tb-btn" title="命令菜单 (/)" onClick={() => execCmd('slash')}>/</button>
          </div>
        )}

        {/* 源码模式 */}
        {isSourceMode && (
          <textarea
            className="source-textarea"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="在此编辑 Markdown 源码..."
            spellCheck={false}
          />
        )}

        {/* 实时/阅读模式 */}
        {!isSourceMode && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {minimapOnLeft && <Minimap content={content} scrollRef={scrollRef} side="left" editorMode={editorMode} />}

            <div
              className={`editor-scroll ${isReadMode ? 'read-mode-scroll' : ''}`}
              ref={scrollRef as React.RefObject<HTMLDivElement>}
              style={{ position: 'relative' }}
              onContextMenu={onScrollContextMenu}
            >
              {settings.showLineNumbers && !isReadMode && <LineNumbers content={content} />}
              <EditorContent editor={editor} />
            </div>

            {minimapOnRight && <Minimap content={content} scrollRef={scrollRef} side="right" editorMode={editorMode} />}
          </div>
        )}

        {/* 浮动语法提示 */}
        {syntaxHint && (
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
          onClose={() => setSlashState((s) => ({ ...s, open: false }))}
        />
      )}

      {/* 表格网格选择器 */}
      {tablePicker.open && (
        <TableGridPicker
          x={tablePicker.x}
          y={tablePicker.y}
          onSelect={(rows, cols) => {
            insertTable(rows, cols)
            setTablePicker((s) => ({ ...s, open: false }))
          }}
          onClose={() => setTablePicker((s) => ({ ...s, open: false }))}
        />
      )}

      {/* 有序列表样式选择器 */}
      {olPicker.open && (
        <OlStylePicker
          x={olPicker.x}
          y={olPicker.y}
          onApply={applyOlStyle}
          onClose={() => setOlPicker((s) => ({ ...s, open: false }))}
        />
      )}

      {/* 代码块语言选择器 */}
      {codeBlockLang && (
        <CodeBlockLangPicker
          pos={codeBlockLang.pos}
          language={codeBlockLang.language}
          x={codeBlockLang.x}
          y={codeBlockLang.y}
          onChange={(lang) => {
            setCodeBlockLang((s) => s ? { ...s, language: lang } : null)
            editor?.commands.updateAttributes('codeBlock', { language: lang })
          }}
        />
      )}

      {/* 链接弹窗 */}
      <LinkDialog
        open={linkDialog.open}
        url={linkDialog.url}
        text={linkDialog.text}
        onUrlChange={(url) => setLinkDialog((s) => ({ ...s, url }))}
        onTextChange={(text) => setLinkDialog((s) => ({ ...s, text }))}
        onApply={applyLink}
        onClose={() => setLinkDialog({ open: false, url: '', text: '' })}
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
          onResize={() => setImageSizeDialog({
            pos: imageCtxMenu.pos,
            width: imageCtxMenu.width != null ? String(imageCtxMenu.width) : '',
            height: imageCtxMenu.height != null ? String(imageCtxMenu.height) : '',
            widthUnit: imageCtxMenu.widthUnit || 'px',
            heightUnit: imageCtxMenu.heightUnit || 'px',
          })}
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
          onWidthChange={(width) => setImageSizeDialog((s) => s ? { ...s, width } : null)}
          onHeightChange={(height) => setImageSizeDialog((s) => s ? { ...s, height } : null)}
          onWidthUnitChange={(unit) => setImageSizeDialog((s) => s ? { ...s, widthUnit: unit } : null)}
          onHeightUnitChange={(unit) => setImageSizeDialog((s) => s ? { ...s, heightUnit: unit } : null)}
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

      <div className="focus-overlay" />
    </div>
  )
})
