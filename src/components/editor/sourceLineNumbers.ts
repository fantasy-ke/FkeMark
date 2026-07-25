export interface SourceLineNumberMarker {
  lineNumber: number
  top: number
}

export const SOURCE_LINE_HEIGHT = 25.2
const DEFAULT_VIEWPORT_HEIGHT = 480

/**
 * 源码行号只生成视口附近的标记，避免长文档为每一行创建文本布局或 DOM 节点。
 */
export function getVisibleSourceLineNumberMarkers(
  lineCount: number,
  scrollTop: number,
  viewportHeight: number,
  topOffset = 40,
  lineHeight = SOURCE_LINE_HEIGHT,
  overscan = 240,
): SourceLineNumberMarker[] {
  if (lineCount <= 0 || lineHeight <= 0) return []

  const effectiveViewportHeight = viewportHeight > 0 ? viewportHeight : DEFAULT_VIEWPORT_HEIGHT
  const firstOffset = Math.max(0, scrollTop - topOffset - overscan)
  const lastOffset = Math.max(0, scrollTop + effectiveViewportHeight - topOffset + overscan)
  const firstIndex = Math.min(lineCount - 1, Math.floor(firstOffset / lineHeight))
  const lastIndex = Math.min(lineCount - 1, Math.ceil(lastOffset / lineHeight))
  const markers = new Array<SourceLineNumberMarker>(Math.max(0, lastIndex - firstIndex + 1))

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    markers[index - firstIndex] = {
      lineNumber: index + 1,
      top: index * lineHeight,
    }
  }

  return markers
}
