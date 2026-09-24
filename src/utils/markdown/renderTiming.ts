import { recordEditorPerformanceOperation } from '../../components/editor/useEditorPerformanceDiagnostics'

const SLOW_RENDER_MS = 16

export function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

/** 只记录慢渲染，避免几百个公式把 100 条性能日志冲掉。 */
export function noteRenderCost(stage: string, startedAt: number, details: Record<string, unknown> = {}): void {
  const durationMs = nowMs() - startedAt
  if (durationMs < SLOW_RENDER_MS) return
  recordEditorPerformanceOperation(stage, durationMs, details)
}
