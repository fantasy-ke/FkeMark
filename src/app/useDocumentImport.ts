import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { showDialog } from '../components/ConfirmDialog'
import { translate, type Lang } from '../i18n'
import { isTauri } from '../utils/tauri'
import type { useAppTabs } from './useAppTabs'

interface ConvertedDocument {
  markdown: string
  title: string | null
  fileName: string
}

interface WebpageSnapshot {
  url: string
  html: string
}

type DocumentSource = { kind: 'file' | 'url'; value: string } | { kind: 'webpage'; value: WebpageSnapshot }

type ImportSourceFormat = { kind: 'file'; extension?: string } | { kind: 'url' | 'webpage' }

type ImportTaskState =
  | { phase: 'queued' | 'converting' | 'success'; sourceFormat: ImportSourceFormat }
  | { phase: 'error'; messageKey: string; sourceFormat?: ImportSourceFormat }

export type DocumentImportPanelState = ImportTaskState
  | { phase: 'downloading' | 'componentReady' | 'componentCurrent'; sourceFormat?: never }
  | { phase: 'componentError'; messageKey: string; sourceFormat?: never }
  | { phase: 'webpageReady'; messageKey?: string; sourceFormat?: never }

export interface DocumentImportTask {
  id: number
  name: string
  state: ImportTaskState
}

interface UseDocumentImportParams {
  language: Lang
  createTab: ReturnType<typeof useAppTabs>['createTab']
}

export interface DocumentImportControls {
  inputBusy: boolean
  importing: boolean
  tasks: readonly DocumentImportTask[]
  importPanel: DocumentImportPanelState | null
  minimizedCount: number
  downloadMinimized: boolean
  showImportPanel: () => void
  closeImportPanel: () => void
  handleImportLocal: () => Promise<void>
  handleImportUrl: () => Promise<void>
  handleCaptureWebpage: () => Promise<void>
  handleInstallConverter: () => Promise<void>
}

const IMPORT_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'html', 'htm', 'epub', 'txt', 'csv', 'json', 'xml', 'png', 'jpg', 'jpeg', 'webp']
const IMPORT_ERRORS = [
  'invalid_input', 'unsupported_format', 'file_read_failed', 'input_too_large',
  'output_too_large', 'empty_result', 'conversion_failed', 'converter_missing',
  'timeout', 'busy', 'network_failed', 'invalid_url',
  'component_unavailable',
  'webpage_https_required', 'webpage_open_failed', 'webpage_closed', 'webpage_not_ready', 'webpage_sign_in',
  'wechat_ocr_failed',
]
const COMPONENT_ERRORS = [
  'component_unavailable', 'component_network_failed', 'component_integrity_failed',
  'component_install_failed', 'component_install_busy',
]

function getSourceFormat(source: DocumentSource): ImportSourceFormat {
  if (source.kind === 'url') return { kind: 'url' }
  if (source.kind === 'webpage') return { kind: 'webpage' }
  const name = source.value.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  return IMPORT_EXTENSIONS.includes(extension)
    ? { kind: 'file', extension: extension === 'htm' ? 'HTML' : extension.toUpperCase() }
    : { kind: 'file' }
}

function suggestFileName(result: ConvertedDocument, source: DocumentSource, language: Lang): string {
  const sourceName = source.kind === 'file' ? source.value.split(/[\\/]/).pop() : ''
  const title = result.title?.trim()
  const name = title || (result.fileName || sourceName || '').split(/[\\/]/).pop() || ''
  const base = (title ? name.replace(/\.md$/i, '') : name.replace(/\.[^.]+$/, ''))
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  // 同时限制 UTF-8 字节与字符数，避免 Windows 和其他平台保存时文件名过长。
  let safeName = ''
  for (const character of base) {
    if (safeName.length + character.length > 100 || new TextEncoder().encode(safeName + character).length > 200) break
    safeName += character
  }
  safeName = safeName.replace(/[.\s]+$/g, '') || translate(language, 'import.defaultName')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) safeName = `_${safeName}`
  return `${safeName}.md`
}

function validateUrl(value: string): string {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed) || /[\s\u0000-\u001f\u007f]/.test(trimmed)) throw 'invalid_url'
  try {
    const url = new URL(trimmed)
    if (!url.hostname || url.username || url.password) throw 'invalid_url'
  } catch {
    throw 'invalid_url'
  }
  return trimmed
}

function importError(error: unknown, sourceFormat?: ImportSourceFormat): Extract<ImportTaskState, { phase: 'error' }> {
  const code = typeof error === 'string' && IMPORT_ERRORS.includes(error) ? error : 'conversion_failed'
  return { phase: 'error', messageKey: `import.error.${code}`, sourceFormat }
}

export function useDocumentImport({ language, createTab }: UseDocumentImportParams): DocumentImportControls {
  const [inputBusy, setInputBusy] = useState(false)
  const [notice, setNotice] = useState<DocumentImportPanelState | null>(null)
  const [webpageOpen, setWebpageOpen] = useState(false)
  const [tasks, setTasks] = useState<DocumentImportTask[]>([])
  const [hidden, setHidden] = useState(false)
  const inputLock = useRef(false)
  const pending = useRef(0)
  const nextId = useRef(0)
  const tail = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  const latest = useRef({ language, createTab })
  latest.current = { language, createTab }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  function enqueue(sources: DocumentSource[]) {
    const startBatch = pending.current === 0
    pending.current += sources.length
    const entries = sources.map((source) => ({
      id: ++nextId.current,
      name: source.kind === 'file' ? source.value.split(/[\\/]/).pop() ?? '' : new URL(source.kind === 'webpage' ? source.value.url : source.value).hostname,
      state: { phase: 'queued' as const, sourceFormat: getSourceFormat(source) },
    }))
    setNotice(null)
    if (startBatch) setHidden(false)
    setTasks((previous) => startBatch ? entries : [...previous, ...entries])

    // 后端一次只接受一个转换；选择来源时不占用队列的执行锁。
    let batch = tail.current ?? Promise.resolve()
    for (const [index, source] of sources.entries()) {
      const { id, state: { sourceFormat } } = entries[index]
      const update = (state: ImportTaskState) => setTasks((previous) =>
        previous.map((task) => task.id === id ? { ...task, state } : task))
      batch = batch.then(async () => {
        try {
          if (!mounted.current) return
          update({ phase: 'converting', sourceFormat })
          const result = await invoke<ConvertedDocument>('convert_document', { source })
          if (!mounted.current) return
          if (typeof result?.markdown !== 'string' || !result.markdown.trim()) throw 'empty_result'
          // 转换期间可能切换或编辑其他标签，创建新标签时使用最新闭包。
          latest.current.createTab(suggestFileName(result, source, latest.current.language), null, result.markdown, undefined, null, true)
          update({ phase: 'success', sourceFormat })
        } catch (error) {
          if (mounted.current) update(importError(error, sourceFormat))
        } finally {
          if (--pending.current === 0 && mounted.current) setHidden(false)
        }
      })
    }
    tail.current = batch
    return batch
  }

  async function importDocument(kind: 'file' | 'url') {
    if (!mounted.current || inputLock.current) return
    if (!isTauri()) {
      setNotice({ phase: 'error', messageKey: 'import.desktopOnly' })
      setHidden(false)
      return
    }
    if (!pending.current) {
      setNotice(null)
      setTasks([])
    }
    inputLock.current = true
    setInputBusy(true)
    try {
      const lang = latest.current.language
      if (kind === 'file') {
        const value = await open({
          multiple: true,
          directory: false,
          title: translate(lang, 'import.localTitle'),
          filters: [{ name: translate(lang, 'import.supportedDocuments'), extensions: IMPORT_EXTENSIONS }],
        })
        if (!mounted.current || value === null) return
        const files = Array.isArray(value) ? value : [value]
        if (files.length) return enqueue(files.map((file) => {
          if (typeof file !== 'string' || !file.trim()) throw 'invalid_input'
          return { kind, value: file }
        }))
        return
      }

      const { confirmed, tertiary, value } = await showDialog({
        type: 'prompt',
        title: translate(lang, 'import.urlTitle'),
        message: translate(lang, 'import.urlPrompt'),
        inputPlaceholder: 'https://',
        confirmText: translate(lang, 'import.urlDirect'),
        tertiaryText: translate(lang, 'import.urlOpenSignIn'),
      })
      if (!mounted.current || (!confirmed && !tertiary)) return
      if (!value?.trim()) throw 'invalid_input'
      const url = validateUrl(value)
      if (confirmed) return enqueue([{ kind, value: url }])

      if (new URL(url).protocol !== 'https:') throw 'webpage_https_required'
      await invoke('open_webpage_import', { url, title: translate(lang, 'import.webpageWindowTitle') })
      if (mounted.current) {
        setNotice(null)
        setWebpageOpen(true)
      }
    } catch (error) {
      if (mounted.current) {
        setNotice(importError(error))
        setHidden(false)
      }
    } finally {
      inputLock.current = false
      if (mounted.current) setInputBusy(false)
    }
  }

  async function handleCaptureWebpage() {
    if (!webpageOpen || inputLock.current) return
    inputLock.current = true
    setInputBusy(true)
    try {
      const snapshot = await invoke<WebpageSnapshot>('capture_webpage_import')
      if (!mounted.current) return
      await invoke('close_webpage_import')
      if (!mounted.current) return
      setWebpageOpen(false)
      return enqueue([{ kind: 'webpage', value: snapshot }])
    } catch (error) {
      if (mounted.current) {
        if (error === 'webpage_closed') setWebpageOpen(false)
        setNotice(importError(error))
        setHidden(false)
      }
    } finally {
      inputLock.current = false
      if (mounted.current) setInputBusy(false)
    }
  }

  async function handleInstallConverter() {
    if (!mounted.current || inputLock.current || pending.current) return
    setTasks([])
    setHidden(false)
    if (!isTauri()) {
      setNotice({ phase: 'componentError', messageKey: 'import.desktopOnly' })
      return
    }
    inputLock.current = true
    setInputBusy(true)
    setNotice({ phase: 'downloading' })
    try {
      const installed = await invoke<boolean>('install_converter_component')
      if (mounted.current) setNotice({ phase: installed ? 'componentReady' : 'componentCurrent' })
    } catch (error) {
      if (!mounted.current) return
      const code = typeof error === 'string' && COMPONENT_ERRORS.includes(error) ? error : 'component_install_failed'
      setNotice({ phase: 'componentError', messageKey: `import.error.${code}` })
    } finally {
      inputLock.current = false
      if (mounted.current) {
        setInputBusy(false)
        setHidden(false)
      }
    }
  }

  let pendingCount = 0
  let activeTask: DocumentImportTask | undefined
  for (const task of tasks) {
    if (task.state.phase === 'queued' || task.state.phase === 'converting') {
      pendingCount++
      activeTask ??= task
    }
  }
  const webpageReady = webpageOpen && notice?.phase !== 'downloading'
  const panel = webpageReady
    ? { phase: 'webpageReady', messageKey: notice?.phase === 'error' ? notice.messageKey : undefined } as const
    : notice ?? activeTask?.state ?? tasks.at(-1)?.state ?? null
  return {
    inputBusy,
    importing: inputBusy || pendingCount > 0,
    tasks,
    importPanel: hidden && !webpageReady ? null : panel,
    minimizedCount: hidden ? pendingCount : 0,
    downloadMinimized: hidden && notice?.phase === 'downloading',
    showImportPanel: () => setHidden(false),
    closeImportPanel: () => {
      if (panel?.phase === 'webpageReady') {
        if (inputLock.current) return
        setWebpageOpen(false)
        setNotice(null)
        void invoke('close_webpage_import').catch((error) => {
          if (mounted.current) {
            setNotice(importError(error))
            setHidden(false)
          }
        })
        return
      }
      if (notice?.phase !== 'downloading') setNotice(null)
      if (pending.current || notice?.phase === 'downloading') setHidden(true)
      else setTasks([])
    },
    handleImportLocal: () => importDocument('file'),
    handleImportUrl: () => importDocument('url'),
    handleCaptureWebpage,
    handleInstallConverter,
  }
}
