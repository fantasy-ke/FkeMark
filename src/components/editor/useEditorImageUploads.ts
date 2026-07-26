import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AppSettings } from '../../types'
import { isTauri } from '../../utils/tauri'
import { notifyError, notifySuccess } from '../../utils/toast'
import { getImageMimeType, uploadImageFile } from '../../utils/imageUpload'
import type { AnyBlockNoteEditor } from './blockNoteMarkdown'

type Translator = (key: string, values?: Record<string, string | number>) => string

interface ImageUploadOptions {
  editorRef: RefObject<AnyBlockNoteEditor | null>
  filePathRef: RefObject<string | null>
  settings: AppSettings
  t: Translator
}

export function useEditorImageUploads({ editorRef, filePathRef, settings, t }: ImageUploadOptions) {
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  function insertImage(url: string, name: string) {
    const editor = editorRef.current
    if (!editor) return
    const image = { type: 'image', props: { url, name, caption: '' } }
    try {
      const reference = editor.getTextCursorPosition().block
      editor.insertBlocks([image] as never[], reference, 'after')
    } catch {
      const reference = editor.document.at(-1)
      if (reference) editor.insertBlocks([image] as never[], reference, 'after')
      else editor.replaceBlocks(editor.document as never[], [image] as never[])
    }
    editor.focus()
  }

  async function completeConfiguredUpload(file: File) {
    const imageUrl = await uploadImageFile(file, settingsRef.current)
    insertImage(imageUrl, file.name || 'image')
    notifySuccess(t('file.imageInserted', { name: file.name || 'image' }))
  }

  function insertImageUploadFromPath(srcPath: string) {
    if (!editorRef.current) return
    const fileName = srcPath.split(/[\\/]/).pop() || 'image'
    if (!isTauri()) {
      notifyError(t('file.uploadUnsupported'))
      return
    }

    void (async () => {
      try {
        if (settingsRef.current.imageUploadMode === 'local') {
          const docDir = filePathRef.current?.replace(/[\\/][^\\/]+$/, '')
          if (!docDir) {
            notifyError(t('file.saveBeforeImageInsert'))
            return
          }
          const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `u-${Date.now()}`
          const relPath = await invoke<string>('upload_asset', { src: srcPath, docDir, id })
          insertImage(relPath, fileName)
          notifySuccess(t('file.imageInserted', { name: fileName }))
          return
        }

        const data = await invoke<number[]>('read_binary_file', { path: srcPath })
        const file = new File([new Uint8Array(data)], fileName, { type: getImageMimeType(fileName) })
        await completeConfiguredUpload(file)
      } catch (error) {
        notifyError(t('file.imageUploadFailed', { detail: String(error) }))
      }
    })()
  }

  function insertImageUploadFromBlob(file: File) {
    if (!editorRef.current) return
    void (async () => {
      try {
        if (settingsRef.current.imageUploadMode !== 'local') {
          await completeConfiguredUpload(file)
          return
        }
        if (!isTauri() || !filePathRef.current) {
          insertImage(await fileToDataURL(file), file.name || 'pasted-image')
          return
        }
        const docDir = filePathRef.current.replace(/[\\/][^\\/]+$/, '')
        const ext = file.type.split('/')[1] || 'png'
        const assetName = `paste_${Date.now()}.${ext}`
        const fullPath = `${docDir}/assets/${assetName}`
        const buffer = await file.arrayBuffer()
        await invoke('write_binary_file', { filePath: fullPath, data: Array.from(new Uint8Array(buffer)) })
        insertImage(`./assets/${assetName}`, file.name || assetName)
      } catch (error) {
        notifyError(t('file.imageInsertFailed', { detail: String(error) }))
      }
    })()
  }

  function handlePasteImage(_view: unknown, event: ClipboardEvent): boolean {
    const imageItems = Array.from(event.clipboardData?.items ?? []).filter((item) => item.type.startsWith('image/'))
    if (imageItems.length === 0) return false
    event.preventDefault()
    for (const item of imageItems) {
      const file = item.getAsFile()
      if (file) insertImageUploadFromBlob(file)
    }
    return true
  }

  function handleDropImage(_view: unknown, event: DragEvent): boolean {
    const imageFiles = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return false
    event.preventDefault()
    for (const file of imageFiles) insertImageUploadFromBlob(file)
    return true
  }

  return { handlePasteImage, handleDropImage, insertImageUploadFromPath, insertImageUploadFromBlob }
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
