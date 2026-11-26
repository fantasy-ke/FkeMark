import { useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'

export interface ConverterUpdateInfo {
  currentVersion: string
  latestVersion: string
  tagName: string
  releaseNotes: string
  releaseDate: string
  isNewer: boolean
}

type ConverterPhase = 'idle' | 'downloading' | 'error' | 'current'

function errorKey(error: unknown, fallback: 'network' | 'install') {
  switch (error) {
    case 'component_unavailable':
    case 'component_network_failed':
    case 'component_integrity_failed':
    case 'component_install_failed':
    case 'component_install_busy':
      return `import.error.${error}`
    default:
      return `import.error.component_${fallback}_failed`
  }
}

export async function checkConverterUpdate() {
  if (!isTauri()) return null
  return invoke<ConverterUpdateInfo | null>('check_converter_component_update')
}

export function useConverterUpdate() {
  const [info, setInfo] = useState<ConverterUpdateInfo | null>(null)
  const [phase, setPhase] = useState<ConverterPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const downloadRevision = useRef(0)
  const downloading = useRef(false)

  async function check() {
    const revision = downloadRevision.current
    if (downloading.current) return null
    try {
      const next = await checkConverterUpdate()
      return downloading.current || revision !== downloadRevision.current ? null : { info: next, revision }
    } catch (reason) {
      return downloading.current || revision !== downloadRevision.current ? null : { error: errorKey(reason, 'network'), revision }
    }
  }

  function applyCheck(result: Awaited<ReturnType<typeof check>>) {
    if (!result || downloading.current || result.revision !== downloadRevision.current) return null
    if ('error' in result) {
      setCheckError(result.error ?? null)
      return null
    }
    setCheckError(null)
    setInfo(result.info)
    if (result.info?.tagName !== info?.tagName || !result.info?.isNewer) {
      setPhase('idle')
      setError(null)
    }
    return result.info
  }

  async function start() {
    if (!info?.isNewer || downloading.current) return
    downloading.current = true
    downloadRevision.current++
    setError(null)
    setCheckError(null)
    setPhase('downloading')
    try {
      const installed = await invoke<boolean>('install_converter_component', { tagName: info.tagName })
      const next = installed ? null : await checkConverterUpdate().catch(() => null)
      setInfo(next ?? { ...info, currentVersion: info.latestVersion, isNewer: false })
      setPhase('current')
    } catch (reason) {
      setError(errorKey(reason, 'install'))
      setPhase('error')
    } finally {
      downloading.current = false
    }
  }

  return { info, phase, error, checkError, check, applyCheck, start }
}

export type ConverterUpdate = Pick<ReturnType<typeof useConverterUpdate>, 'info' | 'phase' | 'error' | 'start'> & { checkError?: string | null }
