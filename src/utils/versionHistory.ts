export const VERSION_SNAPSHOT_LIMIT_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_VERSION_SNAPSHOT_LIMIT = 50

export function normalizeVersionSnapshotLimit(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return (VERSION_SNAPSHOT_LIMIT_OPTIONS as readonly number[]).includes(numeric)
    ? numeric
    : DEFAULT_VERSION_SNAPSHOT_LIMIT
}

export interface VersionSnapshot {
  id: string
  createdAt: number
  size: number
}

export type VersionDiffKind = 'same' | 'add' | 'remove'

export interface VersionDiffLine {
  kind: VersionDiffKind
  text: string
  oldLine: number | null
  newLine: number | null
}

const MAX_LCS_CELLS = 1_500_000

function splitLines(content: string): string[] {
  if (!content) return []
  return content.replace(/\r\n?/g, '\n').split('\n')
}

function createFallbackDiff(previous: string[], current: string[]): VersionDiffLine[] {
  let prefix = 0
  while (prefix < previous.length && prefix < current.length && previous[prefix] === current[prefix]) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < previous.length - prefix
    && suffix < current.length - prefix
    && previous[previous.length - suffix - 1] === current[current.length - suffix - 1]
  ) {
    suffix += 1
  }

  const result: VersionDiffLine[] = []
  for (let index = 0; index < prefix; index += 1) {
    result.push({ kind: 'same', text: previous[index], oldLine: index + 1, newLine: index + 1 })
  }
  for (let index = prefix; index < previous.length - suffix; index += 1) {
    result.push({ kind: 'remove', text: previous[index], oldLine: index + 1, newLine: null })
  }
  for (let index = prefix; index < current.length - suffix; index += 1) {
    result.push({ kind: 'add', text: current[index], oldLine: null, newLine: index + 1 })
  }
  for (let index = suffix; index > 0; index -= 1) {
    const oldIndex = previous.length - index
    const newIndex = current.length - index
    result.push({ kind: 'same', text: previous[oldIndex], oldLine: oldIndex + 1, newLine: newIndex + 1 })
  }
  return result
}

export function createVersionDiff(previousContent: string, currentContent: string): VersionDiffLine[] {
  const previous = splitLines(previousContent)
  const current = splitLines(currentContent)
  if (previous.length * current.length > MAX_LCS_CELLS) {
    return createFallbackDiff(previous, current)
  }

  const matrix = Array.from(
    { length: previous.length + 1 },
    () => new Uint32Array(current.length + 1),
  )
  for (let oldIndex = previous.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = current.length - 1; newIndex >= 0; newIndex -= 1) {
      matrix[oldIndex][newIndex] = previous[oldIndex] === current[newIndex]
        ? matrix[oldIndex + 1][newIndex + 1] + 1
        : Math.max(matrix[oldIndex + 1][newIndex], matrix[oldIndex][newIndex + 1])
    }
  }

  const result: VersionDiffLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < previous.length || newIndex < current.length) {
    if (
      oldIndex < previous.length
      && newIndex < current.length
      && previous[oldIndex] === current[newIndex]
    ) {
      result.push({
        kind: 'same',
        text: previous[oldIndex],
        oldLine: oldIndex + 1,
        newLine: newIndex + 1,
      })
      oldIndex += 1
      newIndex += 1
    } else if (
      oldIndex < previous.length
      && (newIndex >= current.length || matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1])
    ) {
      result.push({ kind: 'remove', text: previous[oldIndex], oldLine: oldIndex + 1, newLine: null })
      oldIndex += 1
    } else {
      result.push({ kind: 'add', text: current[newIndex], oldLine: null, newLine: newIndex + 1 })
      newIndex += 1
    }
  }
  return result
}
