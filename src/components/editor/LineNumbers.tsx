/**
/**
 * 行号组件 — 在编辑器左侧显示行号
 */
export function LineNumbers({ content }: { content: string }) {
  const lines = content.split('\n').length
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '40px', paddingTop: '40px',
      textAlign: 'right', paddingRight: '8px', fontSize: '12px',
      fontFamily: 'var(--font-mono)', color: 'var(--muted)',
      userSelect: 'none', pointerEvents: 'none', lineHeight: '1.8', opacity: 0.5,
    }}>
      {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
    </div>
  )
}
