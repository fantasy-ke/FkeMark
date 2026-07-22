import { useEffect, useMemo, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../i18n'
import { isTauri } from '../utils/tauri'
import { notifyError, notifySuccess } from '../utils/toast'
import {
  createRenamedImageFileName,
  extractDocumentImages,
  getImageFileName,
  renameImageReference,
  replaceDocumentImageSource,
  resolveLocalImagePath,
  type DocumentImage,
} from '../utils/imageManager'

interface ImageManagerPanelProps {
  open: boolean
  content: string
  filePath: string | null
  onClose: () => void
  onContentChange: (content: string) => void
}

interface RenameState {
  image: DocumentImage
  value: string
  error: string | null
}

const IMAGE_FILTERS = [{
  name: 'Images',
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
}]

function documentDirectory(filePath: string): string | null {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return slash >= 0 ? filePath.slice(0, slash) : null
}

function previewSource(image: DocumentImage, filePath: string | null): string {
  if (image.kind !== 'local') return image.src
  const absolutePath = resolveLocalImagePath(image.src, filePath)
  if (!absolutePath || !isTauri()) return image.src
  return convertFileSrc(absolutePath)
}

function safeExportFileName(src: string, index: number, contentType?: string | null): string {
  let name = getImageFileName(src, index).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
  if (!name || name === '.' || name === '..') name = `image-${index}.png`
  if (!/\.[a-z0-9+_-]{2,8}$/i.test(name)) {
    const mime = contentType?.match(/^image\/([a-z0-9.+-]+)/i)?.[1]?.toLowerCase()
    const extension = mime === 'jpeg' ? 'jpg' : mime === 'svg+xml' ? 'svg' : mime || 'png'
    name += `.${extension}`
  }
  return name
}

async function readExternalImage(src: string): Promise<{ data: number[]; contentType: string | null }> {
  const requestSrc = src.startsWith('//') ? `https:${src}` : src
  const request = async () => {
    if (/^https?:\/\//i.test(requestSrc) && isTauri()) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      return tauriFetch(requestSrc)
    }
    return fetch(requestSrc)
  }
  const response = await request()
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  const buffer = await response.arrayBuffer()
  return {
    data: Array.from(new Uint8Array(buffer)),
    contentType: response.headers.get('content-type'),
  }
}

export function ImageManagerPanel({
  open,
  content,
  filePath,
  onClose,
  onContentChange,
}: ImageManagerPanelProps) {
  const { t } = useI18n()
  const images = useMemo(() => extractDocumentImages(content), [content])
  const [renameState, setRenameState] = useState<RenameState | null>(null)
  const [busySource, setBusySource] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (renameState) setRenameState(null)
      else onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose, renameState])

  useEffect(() => {
    if (!open) setRenameState(null)
  }, [open])

  if (!open) return null

  const desktopReady = isTauri() && Boolean(filePath)

  async function handleRename() {
    if (!renameState || !filePath) return
    const currentName = getImageFileName(renameState.image.src)
    const result = createRenamedImageFileName(renameState.value, currentName)
    if (!result.value) {
      const key = result.error === 'extension'
        ? 'imageManager.renameExtensionError'
        : result.error === 'empty'
          ? 'imageManager.renameEmptyError'
          : 'imageManager.renameInvalidError'
      setRenameState({ ...renameState, error: t(key) })
      return
    }

    const sourcePath = resolveLocalImagePath(renameState.image.src, filePath)
    if (!sourcePath) {
      setRenameState({ ...renameState, error: t('imageManager.localPathError') })
      return
    }

    setBusySource(renameState.image.src)
    try {
      await invoke('rename_image_asset', { sourcePath, newName: result.value })
      const nextSource = renameImageReference(renameState.image.src, result.value)
      onContentChange(replaceDocumentImageSource(content, renameState.image.src, nextSource))
      setRenameState(null)
      notifySuccess(t('imageManager.renameSuccess', { name: result.value }))
    } catch (error) {
      setRenameState({ ...renameState, error: t('imageManager.renameFailed', { detail: String(error) }) })
    } finally {
      setBusySource(null)
    }
  }

  async function handleReplace(image: DocumentImage) {
    if (!filePath || !isTauri()) {
      notifyError(t(filePath ? 'imageManager.desktopOnly' : 'imageManager.saveFirst'))
      return
    }
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: t('imageManager.selectReplacement'),
      filters: IMAGE_FILTERS,
    })
    if (!selected || Array.isArray(selected)) return

    const docDir = documentDirectory(filePath)
    if (!docDir) {
      notifyError(t('imageManager.localPathError'))
      return
    }

    setBusySource(image.src)
    try {
      const nextSource = await invoke<string>('copy_asset_to_assets', { src: selected, docDir })
      onContentChange(replaceDocumentImageSource(content, image.src, nextSource))
      notifySuccess(t('imageManager.replaceSuccess', { name: getImageFileName(nextSource) }))
    } catch (error) {
      notifyError(t('imageManager.replaceFailed', { detail: String(error) }))
    } finally {
      setBusySource(null)
    }
  }

  async function handleExportAll() {
    if (!isTauri()) {
      notifyError(t('imageManager.desktopOnly'))
      return
    }
    if (images.length === 0) {
      notifyError(t('imageManager.noImages'))
      return
    }

    const destination = await openDialog({
      directory: true,
      multiple: false,
      title: t('imageManager.selectExportFolder'),
    })
    if (!destination || Array.isArray(destination)) return

    setExporting(true)
    let exported = 0
    let failed = 0
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      try {
        if (image.kind === 'local') {
          const sourcePath = resolveLocalImagePath(image.src, filePath)
          if (!sourcePath) throw new Error(t('imageManager.localPathError'))
          await invoke('export_image_asset', {
            sourcePath,
            destinationDir: destination,
            fileName: safeExportFileName(image.src, index + 1),
          })
        } else {
          const downloaded = await readExternalImage(image.src)
          await invoke('write_exported_image', {
            destinationDir: destination,
            fileName: safeExportFileName(image.src, index + 1, downloaded.contentType),
            data: downloaded.data,
          })
        }
        exported += 1
      } catch (error) {
        failed += 1
        console.warn('Export image failed:', image.src, error)
      }
    }
    setExporting(false)

    if (failed === 0) notifySuccess(t('imageManager.exportSuccess', { count: exported }))
    else if (exported > 0) notifyError(t('imageManager.exportPartial', { count: exported, failed }))
    else notifyError(t('imageManager.exportFailed'))
  }

  return (
    <div className="image-manager-overlay" role="presentation">
      <aside className="image-manager-panel" role="dialog" aria-modal="true" aria-labelledby="image-manager-title">
        <header className="image-manager-header">
          <div>
            <h2 id="image-manager-title">{t('imageManager.title')}</h2>
            <p>{t('imageManager.summary', { count: images.length })}</p>
          </div>
          <button className="image-manager-icon-btn" onClick={onClose} title={t('imageManager.close')} aria-label={t('imageManager.close')}>
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="image-manager-body">
          {images.length === 0 ? (
            <div className="image-manager-empty">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5L5 19" /></svg>
              <strong>{t('imageManager.emptyTitle')}</strong>
              <span>{t('imageManager.emptyHint')}</span>
            </div>
          ) : images.map((image, index) => {
            const canRename = desktopReady && image.kind === 'local'
            const busy = busySource === image.src
            return (
              <article className="image-manager-card" key={image.src}>
                <div className="image-manager-preview">
                  <img src={previewSource(image, filePath)} alt={image.alt || getImageFileName(image.src, index + 1)} />
                  <span className={`image-manager-kind kind-${image.kind}`}>{t(`imageManager.kind.${image.kind}`)}</span>
                </div>
                <div className="image-manager-info">
                  <div className="image-manager-name" title={getImageFileName(image.src, index + 1)}>
                    {getImageFileName(image.src, index + 1)}
                  </div>
                  {image.alt && <div className="image-manager-alt" title={image.alt}>{image.alt}</div>}
                  <code title={image.src}>{image.src}</code>
                  <span className="image-manager-count">{t('imageManager.occurrences', { count: image.occurrences })}</span>
                </div>
                <div className="image-manager-actions">
                  <button
                    disabled={!canRename || busy}
                    onClick={() => setRenameState({ image, value: getImageFileName(image.src), error: null })}
                    title={!filePath ? t('imageManager.saveFirst') : image.kind !== 'local' ? t('imageManager.renameLocalOnly') : t('imageManager.rename')}
                  >
                    <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
                    {t('imageManager.rename')}
                  </button>
                  <button disabled={!desktopReady || busy} onClick={() => handleReplace(image)}>
                    <svg viewBox="0 0 24 24"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" /></svg>
                    {t('imageManager.replace')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <footer className="image-manager-footer">
          {!filePath && images.length > 0 && <span>{t('imageManager.saveFirst')}</span>}
          <button className="image-manager-export-btn" disabled={images.length === 0 || exporting} onClick={handleExportAll}>
            <svg viewBox="0 0 24 24"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            {exporting ? t('imageManager.exporting') : t('imageManager.exportAll')}
          </button>
        </footer>
      </aside>

      {renameState && (
        <div className="image-manager-rename-layer" role="presentation">
          <div className="image-manager-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="image-manager-rename-title">
            <h3 id="image-manager-rename-title">{t('imageManager.renameTitle')}</h3>
            <label htmlFor="image-manager-rename-input">{t('imageManager.renameLabel')}</label>
            <input
              id="image-manager-rename-input"
              autoFocus
              value={renameState.value}
              onChange={(event) => setRenameState({ ...renameState, value: event.target.value, error: null })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleRename()
              }}
            />
            <p className={renameState.error ? 'error' : ''}>
              {renameState.error || t('imageManager.renameHint')}
            </p>
            <div className="image-manager-rename-actions">
              <button onClick={() => setRenameState(null)}>{t('common.cancel')}</button>
              <button className="primary" disabled={busySource === renameState.image.src} onClick={handleRename}>
                {t('imageManager.renameConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
