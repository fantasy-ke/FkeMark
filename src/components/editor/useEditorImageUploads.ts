import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type Event as TauriEvent } from '@tauri-apps/api/event'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { AppSettings } from '../../types'
import { isTauri } from '../../utils/tauri'
import { notifyError, notifySuccess } from '../../utils/toast'
import { toAssetUrl } from '../../utils/asset'
import { getImageMimeType, uploadImageFile } from '../../utils/imageUpload'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface ImageUploadOptions {
  editorRef: RefObject<TiptapEditor | null>
  filePathRef: RefObject<string | null>
  docDirRef: RefObject<string | null>
  settings: AppSettings
  t: Translator
}

export function useEditorImageUploads({ editorRef, filePathRef, docDirRef, settings, t }: ImageUploadOptions) {
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
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
        // Rust 进度事件返回 Markdown 相对路径；写入图片节点前必须转换为 WebView 可加载的资源 URL。
        patch.src = toAssetUrl(p.src, docDirRef.current)
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

  // ── 粘贴截图：按当前图片存储方式，以占位 + 进度方式插入 ──
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
    editorRef.current?.chain().focus().insertContent({
      type: 'imageUpload',
      attrs: { id, name: fileName, progress: initialProgress, status: 'uploading', src: '', error: '' },
    }).run()
  }

  async function completeConfiguredUpload(ed: TiptapEditor, id: string, file: File) {
    const imageUrl = await uploadImageFile(file, settingsRef.current)
    updateUploadNode(ed, id, { src: imageUrl, status: 'done', progress: 100 })
    notifySuccess(t('file.imageInserted', { name: file.name || 'image' }))
  }

  // 从磁盘路径插入（拖拽到窗口）：本地保存或交给所选上传方式
  function insertImageUploadFromPath(srcPath: string) {
    const ed = editorRef.current
    if (!ed) return
    const id = uid()
    const fileName = srcPath.split(/[\\/]/).pop() || 'image'
    insertImageUploadNode(id, fileName, 0)
    if (!isTauri()) {
      notifyError(t('file.uploadUnsupported'))
      removeUploadNode(ed, id)
      return
    }

    if (settingsRef.current.imageUploadMode === 'local') {
      const docDir = filePathRef.current?.replace(/[\\/][^\\/]+$/, '')
      if (!docDir) {
        notifyError(t('file.saveBeforeImageInsert'))
        removeUploadNode(ed, id)
        return
      }
      void (async () => {
        try {
          const relPath = await invoke<string>('upload_asset', { src: srcPath, docDir, id })
          const assetUrl = toAssetUrl(relPath, docDir)
          updateUploadNode(ed, id, { src: assetUrl, status: 'done', progress: 100 })
          notifySuccess(t('file.imageInserted', { name: fileName }))
        } catch (e) {
          updateUploadNode(ed, id, { status: 'error', error: String(e) })
          notifyError(t('file.imageUploadFailed', { detail: String(e) }))
        }
      })()
      return
    }

    void (async () => {
      try {
        const data = await invoke<number[]>('read_binary_file', { path: srcPath })
        const file = new File([new Uint8Array(data)], fileName, { type: getImageMimeType(fileName) })
        updateUploadNode(ed, id, { progress: 30 })
        await completeConfiguredUpload(ed, id, file)
      } catch (e) {
        updateUploadNode(ed, id, { status: 'error', error: String(e) })
        notifyError(t('file.imageUploadFailed', { detail: String(e) }))
      }
    })()
  }

  // 从内存 Blob 插入（粘贴 / 编辑器内拖入）：按当前图片存储方式完成
  function insertImageUploadFromBlob(file: File) {
    const ed = editorRef.current
    if (!ed) return
    const id = uid()
    const fileName = file.name || 'pasted-image'
    insertImageUploadNode(id, fileName, 30)
    void (async () => {
      try {
        if (settingsRef.current.imageUploadMode !== 'local') {
          await completeConfiguredUpload(ed, id, file)
          return
        }
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
        notifyError(t('file.imageInsertFailed', { detail: String(e) }))
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

  return {
    handlePasteImage,
    handleDropImage,
    insertImageUploadFromPath,
    insertImageUploadFromBlob,
  }
}
