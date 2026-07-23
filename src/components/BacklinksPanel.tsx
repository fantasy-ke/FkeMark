import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Link2, RefreshCw, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { FileTreeNode } from '../types'
import { isTauri } from '../utils/tauri'
import { buildBacklinks, flattenMarkdownFiles, type WikiBacklink } from '../utils/markdown/wikiLinks'

interface BacklinksPanelProps {
  currentFile: string | null
  fileTree: FileTreeNode[]
  onOpenFile: (path: string) => void | Promise<void>
}

async function readMarkdownFile(path: string): Promise<string> {
  if (isTauri()) return invoke<string>('read_file_command', { path })
  const response = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  return response.text()
}

export function BacklinksPanel({ currentFile, fileTree, onOpenFile }: BacklinksPanelProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [backlinks, setBacklinks] = useState<WikiBacklink[]>([])
  const [loading, setLoading] = useState(false)
  const [failedCount, setFailedCount] = useState(0)
  const files = useMemo(() => flattenMarkdownFiles(fileTree), [fileTree])
  const currentIsMarkdown = Boolean(currentFile && /\.(?:md|markdown)$/i.test(currentFile))

  useEffect(() => {
    if (!currentIsMarkdown) setOpen(false)
  }, [currentIsMarkdown])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (!open || !currentFile || !currentIsMarkdown) return
    let active = true
    setLoading(true)
    setFailedCount(0)

    void Promise.all(files.map(async (file) => {
      if (file.path === currentFile) return { path: file.path, content: '' }
      try {
        return { path: file.path, content: await readMarkdownFile(file.path) }
      } catch (error) {
        console.warn('Failed to read note for backlinks:', file.path, error)
        return null
      }
    })).then((items) => {
      if (!active) return
      const readable = items.filter((item): item is { path: string; content: string } => item !== null)
      const failures = items.length - readable.length
      if (!readable.some((item) => item.path === currentFile)) readable.unshift({ path: currentFile, content: '' })
      setFailedCount(failures)
      setBacklinks(buildBacklinks(readable, currentFile))
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [currentFile, currentIsMarkdown, files, open, refreshKey])

  if (!currentIsMarkdown) return null

  return (
    <>
      {!open && (
        <button
          type="button"
          className="backlinks-toggle"
          title={t('backlinks.toggle')}
          aria-label={t('backlinks.toggle')}
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <Link2 size={17} />
        </button>
      )}

      {open && (
        <aside className="backlinks-panel" aria-label={t('backlinks.title')}>
          <header className="backlinks-header">
            <div className="backlinks-heading">
              <Link2 size={16} />
              <span>{t('backlinks.title')}</span>
              {!loading && <span className="backlinks-count">{backlinks.length}</span>}
            </div>
            <div className="backlinks-actions">
              <button type="button" title={t('backlinks.refresh')} onClick={() => setRefreshKey((key) => key + 1)}>
                <RefreshCw size={15} />
              </button>
              <button type="button" title={t('backlinks.close')} onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="backlinks-content">
            {failedCount > 0 && <div className="backlinks-warning">{t('backlinks.partial', { count: failedCount })}</div>}
            {loading && <div className="backlinks-empty">{t('backlinks.loading')}</div>}
            {!loading && backlinks.length === 0 && <div className="backlinks-empty">{t('backlinks.empty')}</div>}
            {!loading && backlinks.map((backlink, index) => (
              <button
                type="button"
                className="backlink-item"
                key={`${backlink.filePath}:${backlink.line}:${index}`}
                onClick={() => void onOpenFile(backlink.filePath)}
              >
                <span className="backlink-meta">
                  <strong>{backlink.noteName}</strong>
                  <span>{t('backlinks.line', { line: backlink.line })}</span>
                </span>
                <span className="backlink-context">{backlink.context}</span>
              </button>
            ))}
          </div>
        </aside>
      )}
    </>
  )
}