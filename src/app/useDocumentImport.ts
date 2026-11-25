import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { showPrompt } from '../components/ConfirmDialog'
import { translate, type Lang } from '../i18n'
import { isTauri } from '../utils/tauri'
import type { useAppTabs } from './useAppTabs'

interface ConvertedDocument {
  markdown: string
  title: string | null
  fileName: string
}

interface DocumentSource {
  kind: 'file' | 'url'
  value: string
}

type ImportSourceFormat = { kind: 'file'; extension?: string } | { kind: 'url' }

export type DocumentImportPanelState =
  | { phase: 'converting' | 'success'; sourceFormat: ImportSourceFormat }
  | { phase: 'error'; messageKey: string; sourceFormat?: ImportSourceFormat }
  | { phase: 'downloading' | 'componentReady' | 'componentCurrent'; sourceFormat?: never }
  | { phase: 'componentError'; messageKey: string; sourceFormat?: never }

interface UseDocumentImportParams {
  language: Lang
  createTab: ReturnType<typeof useAppTabs>['createTab']
}

const IMPORT_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'html', 'htm', 'epub', 'txt', 'csv', 'json', 'xml', 'png', 'jpg', 'jpeg', 'webp']
const IMPORT_ERRORS = [
  'invalid_input', 'unsupported_format', 'file_read_failed', 'input_too_large',
  'output_too_large', 'empty_result', 'conversion_failed', 'converter_missing',
  'timeout', 'busy', 'network_failed', 'invalid_url',
  'component_unavailable',
]
const COMPONENT_ERRORS = [
  'component_unavailable', 'component_network_failed', 'component_integrity_failed',
  'component_install_failed', 'component_install_busy',
]

function getSourceFormat(source: DocumentSource): ImportSourceFormat {
  if (source.kind === 'url') return { kind: 'url' }
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

export function useDocumentImport({ language, createTab }: UseDocumentImportParams) {
  const [importing, setImporting] = useState(false)
  const [importPanel, setImportPanel] = useState<DocumentImportPanelState | null>(null)
  const [downloadHidden, setDownloadHidden] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const latest = useRef({ language, createTab })
  latest.current = { language, createTab }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function importDocument(kind: DocumentSource['kind']) {
    if (!mounted.current || inFlight.current) return
    if (!isTauri()) {
      setImportPanel({ phase: 'error', messageKey: 'import.desktopOnly' })
      return
    }
    inFlight.current = true
    setImporting(true)
    setImportPanel(null)
    let sourceFormat: ImportSourceFormat | undefined
    try {
      const value = kind === 'file'
        ? await open({
          multiple: false,
          directory: false,
          title: translate(latest.current.language, 'import.localTitle'),
          filters: [{ name: translate(latest.current.language, 'import.supportedDocuments'), extensions: IMPORT_EXTENSIONS }],
        })
        : await showPrompt(
          translate(latest.current.language, 'import.urlPrompt'),
          '',
          translate(latest.current.language, 'import.urlTitle'),
          'https://',
        )
      if (!mounted.current || value === null) return
      if (typeof value !== 'string' || !value.trim()) throw 'invalid_input'
      const source: DocumentSource = { kind, value: kind === 'url' ? validateUrl(value) : value }
      sourceFormat = getSourceFormat(source)
      setImportPanel({ phase: 'converting', sourceFormat })
      const result = await invoke<ConvertedDocument>('convert_document', { source })
      if (!mounted.current) return
      if (typeof result?.markdown !== 'string' || !result.markdown.trim()) throw 'empty_result'
      // 转换期间可能切换或编辑其他标签，必须使用最新闭包缓存当前编辑内容。
      latest.current.createTab(suggestFileName(result, source, latest.current.language), null, result.markdown, undefined, null, true)
      setImportPanel({ phase: 'success', sourceFormat })
    } catch (error) {
      if (!mounted.current) return
      const code = typeof error === 'string' && IMPORT_ERRORS.includes(error) ? error : 'conversion_failed'
      setImportPanel({ phase: 'error', messageKey: `import.error.${code}`, sourceFormat })
    } finally {
      inFlight.current = false
      if (mounted.current) setImporting(false)
    }
  }

  async function handleInstallConverter() {
    if (!mounted.current || inFlight.current) return
    if (!isTauri()) {
      setImportPanel({ phase: 'componentError', messageKey: 'import.desktopOnly' })
      return
    }
    inFlight.current = true
    setImporting(true)
    setDownloadHidden(false)
    setImportPanel({ phase: 'downloading' })
    try {
      const installed = await invoke<boolean>('install_converter_component')
      if (mounted.current) setImportPanel({ phase: installed ? 'componentReady' : 'componentCurrent' })
    } catch (error) {
      if (!mounted.current) return
      const code = typeof error === 'string' && COMPONENT_ERRORS.includes(error) ? error : 'component_install_failed'
      setImportPanel({ phase: 'componentError', messageKey: `import.error.${code}` })
    } finally {
      inFlight.current = false
      if (mounted.current) setImporting(false)
    }
  }

  const downloadMinimized = importPanel?.phase === 'downloading' && downloadHidden
  return {
    importing,
    importPanel: downloadMinimized ? null : importPanel,
    downloadMinimized,
    showImportPanel: () => setDownloadHidden(false),
    // 隐藏面板不取消任务；终态重新显示，避免丢失结果和保存提醒。
    closeImportPanel: () => {
      if (importPanel?.phase === 'downloading') setDownloadHidden(true)
      else setImportPanel(null)
    },
    handleImportLocal: () => importDocument('file'),
    handleImportUrl: () => importDocument('url'),
    handleInstallConverter,
  }
}
