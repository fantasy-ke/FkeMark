import type { SearchMatchResult } from '../components/CommandPalette'

/** 同一个文件内的命中集合 */
export interface SearchFileGroup {
  filePath: string
  fileName: string
  matches: SearchMatchResult[]
}

/** 搜索结果的目录树节点 */
export interface SearchTreeNode {
  /** 规范化后的磁盘路径，用作折叠状态键与 React key */
  path: string
  name: string
  type: 'folder' | 'file'
  children: SearchTreeNode[]
  /** 仅文件节点有值 */
  matches: SearchMatchResult[]
}

/** 统一分隔符并去掉结尾分隔符，便于跨平台比较路径 */
export function normalizeSearchPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** 把命中按文件分组，保持后端返回的先后顺序 */
export function groupSearchMatches(matches: SearchMatchResult[]): SearchFileGroup[] {
  const groups = new Map<string, SearchFileGroup>()
  for (const match of matches) {
    const group = groups.get(match.filePath)
    if (group) {
      group.matches.push(match)
    } else {
      groups.set(match.filePath, {
        filePath: match.filePath,
        fileName: match.fileName,
        matches: [match],
      })
    }
  }
  return Array.from(groups.values())
}

/**
 * 文件节点在结果中真正需要逐行展示的命中。
 * 文件名命中已经由节点名本身表达，不再重复占用一行。
 */
export function contentMatches(node: SearchTreeNode): SearchMatchResult[] {
  return node.matches.filter((match) => !match.isFileNameMatch)
}

/** 该节点是否存在文件名命中（用于高亮节点名） */
export function hasFileNameMatch(node: SearchTreeNode): boolean {
  return node.matches.some((match) => match.isFileNameMatch)
}

/** 取相对于根目录的路径片段；不在根目录下时退化为文件名 */
function relativeSegments(filePath: string, folderPath: string | null): string[] {
  const full = normalizeSearchPath(filePath)
  if (folderPath) {
    const root = normalizeSearchPath(folderPath)
    if (full.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      return full.slice(root.length + 1).split('/').filter(Boolean)
    }
  }
  return full.split('/').filter(Boolean).slice(-1)
}

/** 排序：目录在前、文件在后，同类按名称自然序 */
function compareNodes(left: SearchTreeNode, right: SearchTreeNode): number {
  if (left.type !== right.type) return left.type === 'folder' ? -1 : 1
  return left.name.localeCompare(right.name, undefined, { numeric: true })
}

/**
 * 把命中的文件整理成以 folderPath 为根的目录树。
 * 只包含命中文件所在的路径分支，不会展开整棵文件树。
 */
export function buildSearchResultTree(
  groups: SearchFileGroup[],
  folderPath: string | null,
): SearchTreeNode[] {
  const roots: SearchTreeNode[] = []

  for (const group of groups) {
    const segments = relativeSegments(group.filePath, folderPath)
    if (segments.length === 0) continue

    let level = roots
    let currentPath = folderPath ? normalizeSearchPath(folderPath) : ''

    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      let node = level.find((item) => item.path === currentPath)
      if (!node) {
        node = {
          path: currentPath,
          name: segment,
          type: isFile ? 'file' : 'folder',
          children: [],
          matches: [],
        }
        level.push(node)
      }
      if (isFile) {
        node.matches = group.matches
      } else {
        level = node.children
      }
    })
  }

  const sortLevel = (nodes: SearchTreeNode[]) => {
    nodes.sort(compareNodes)
    for (const node of nodes) sortLevel(node.children)
  }
  sortLevel(roots)
  return roots
}

/** 把文件分组转成扁平的列表结构，与树形结构共用同一套渲染 */
export function buildSearchResultList(groups: SearchFileGroup[]): SearchTreeNode[] {
  return groups.map((group) => ({
    path: normalizeSearchPath(group.filePath),
    name: group.fileName,
    type: 'file' as const,
    children: [],
    matches: group.matches,
  }))
}

/** 收集所有可折叠节点的路径，供「全部折叠」使用 */
export function collectCollapsiblePaths(nodes: SearchTreeNode[]): string[] {
  const paths: string[] = []
  const walk = (list: SearchTreeNode[]) => {
    for (const node of list) {
      const collapsible = node.type === 'folder'
        ? node.children.length > 0
        : contentMatches(node).length > 0
      if (collapsible) paths.push(node.path)
      walk(node.children)
    }
  }
  walk(nodes)
  return paths
}
