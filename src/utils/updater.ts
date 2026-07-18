/**
 * FkeMark 版本更新服务
 * - 通过 GitHub API / 静态 JSON 清单检查最新版本（latest 通道 / dev 通道）
 * - 使用 Tauri HTTP API 绕过 WebView2 CORS 限制
 * - 比较版本号判断是否有可用更新（支持 pre-release / dev 版本）
 * - 打开外部链接（GitHub 仓库 / Issues / Releases）
 */

import { isTauri } from './tauri'

// ── GitHub 仓库信息 ──
const GITHUB_OWNER = 'fantasy-ke'
const GITHUB_REPO = 'FkeMark'
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`

// ── GitHub 页面 URL ──
export const GITHUB_URLS = {
  repo: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
  issues: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
  releases: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
  releasesLatest: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
  releasesDev: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/dev-latest`,
  sourceCode: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
  license: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/LICENSE`,
  newIssue: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new`,
}

// ── 更新通道 ──
export type UpdateChannel = 'latest' | 'dev'

// ── 更新信息 ──
export interface UpdateInfo {
  version: string         // 版本号，如 "0.2.0" 或 "dev-d0a6a97"
  tagName: string         // Git tag，如 "v0.2.0"
  releaseDate: string     // ISO 日期字符串
  releaseNotes: string    // 更新日志（Markdown）
  htmlUrl: string         // GitHub Release 页面 URL
  isNewer: boolean        // 是否比当前版本新
  isPrerelease: boolean   // 是否为预发布版本
  downloads: {
    windows?: { name: string; url: string; size?: number }
    macos?: { name: string; url: string; size?: number }
    linux?: { name: string; url: string; size?: number }
  }
}

// ── GitHub API 响应类型 ──
interface GitHubAsset {
  name: string
  browser_download_url: string
  content_type: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  body: string
  html_url: string
  prerelease: boolean
  assets: GitHubAsset[]
}

/**
 * 获取构建时注入的更新通道
 * CI 构建时通过 VITE_UPDATE_CHANNEL 环境变量注入
 */
export function getBuildChannel(): UpdateChannel {
  try {
    const ch = __UPDATE_CHANNEL__
    return ch === 'dev' ? 'dev' : 'latest'
  } catch {
    return 'latest'
  }
}

/**
 * 获取当前应用版本号
 * - dev 构建：优先用 vite 注入的 __APP_VERSION__（语义化版本 0.1.0-dev.xxx），
 *   因为 Cargo.toml/tauri.conf.json 中是 MSI 兼容的数字版本（0.1.0.12345）
 * - latest 构建：优先用 Tauri getVersion()（与 Cargo.toml 一致）
 */
export async function getLocalVersion(): Promise<string> {
  const buildChannel = getBuildChannel()
  // dev 构建：优先使用 vite 注入的语义化版本号
  if (buildChannel === 'dev') {
    try {
      return __APP_VERSION__
    } catch {
      // 降级
    }
  }
  // latest 构建：优先使用 Tauri app API
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      return await getVersion()
    } catch {
      // 降级
    }
  }
  // 浏览器环境从 package.json 读取（vite 注入）
  try {
    return __APP_VERSION__
  } catch {
    return '0.1.0'
  }
}

/**
 * 检查是否有可用更新
 * @param channel 更新通道：latest（正式版）或 dev（开发版）
 * @param currentVersion 当前版本号
 * @returns 更新信息，如果获取失败返回 null
 */
export async function checkForUpdate(
  channel: UpdateChannel,
  currentVersion: string
): Promise<UpdateInfo | null> {
  try {
    // 1. 尝试从 GitHub Release 下载静态 JSON 清单（无 API 速率限制）
    const manifestUrl =
      channel === 'latest'
        ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/latest.json`
        : `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/dev-latest/dev.json`

    const manifestResult = await tryFetchJson<UpdateManifest>(manifestUrl)
    if (manifestResult) {
      const version = manifestResult.version.replace(/^v/, '')
      const isNewer = isVersionNewer(version, currentVersion, channel)
      return {
        version,
        tagName: manifestResult.tagName || manifestResult.version,
        releaseDate: manifestResult.pubDate,
        releaseNotes: manifestResult.releaseNotes || '',
        htmlUrl: manifestResult.htmlUrl || (channel === 'latest' ? GITHUB_URLS.releasesLatest : GITHUB_URLS.releasesDev),
        isNewer,
        isPrerelease: channel === 'dev',
        downloads: manifestResult.downloads || {},
      }
    }

    // 2. 降级到 GitHub API
    const apiUrl =
      channel === 'latest'
        ? `${GITHUB_API_BASE}/releases/latest`
        : `${GITHUB_API_BASE}/releases/tags/dev-latest`

    const apiResult = await tryFetchJson<GitHubRelease>(apiUrl, {
      Accept: 'application/vnd.github.v3+json',
    })
    if (!apiResult) {
      console.warn('[updater] GitHub API 返回空结果')
      return null
    }

    // dev 通道：tag 固定为 dev-latest，从 release name "Dev Build (dev-abc1234)" 中提取
    let version: string
    if (channel === 'dev') {
      const match = apiResult.name?.match(/dev-([a-f0-9]{7,})/i)
      version = match ? `dev-${match[1]}` : apiResult.tag_name.replace(/^v/, '')
    } else {
      version = apiResult.tag_name.replace(/^v/, '')
    }

    const isNewer = isVersionNewer(version, currentVersion, channel)
    const downloads = parseAssets(apiResult.assets || [])

    return {
      version,
      tagName: apiResult.tag_name,
      releaseDate: apiResult.published_at,
      releaseNotes: apiResult.body || '',
      htmlUrl: apiResult.html_url,
      isNewer,
      isPrerelease: apiResult.prerelease,
      downloads,
    }
  } catch (e) {
    console.error('[updater] 检查更新失败:', e)
    return null
  }
}

/**
 * 在系统浏览器中打开外部链接
 */
export async function openExternalUrl(url: string) {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      return
    } catch {
      // 降级到 window.open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ── 工具函数 ──

/**
 * 判断 remoteVersion 是否比 currentVersion 新
 * - latest 通道：使用 semver 比较（含 pre-release 处理）
 * - dev 通道：版本字符串不同即认为有更新（每次 dev push 产生新 SHA）
 */
function isVersionNewer(remoteVersion: string, currentVersion: string, channel: UpdateChannel): boolean {
  if (channel === 'dev') {
    // dev 通道：版本不同就有更新
    return remoteVersion !== currentVersion
  }
  // latest 通道：semver 比较
  return compareSemver(remoteVersion, currentVersion) > 0
}

/**
 * 比较两个语义化版本号，返回 >0 / 0 / <0
 * 支持 pre-release 版本：0.1.0-dev.abc1234
 * 规则：无 pre-release > 有 pre-release（正式版 > 预发布版）
 */
function compareSemver(a: string, b: string): number {
  // 去除前缀 v
  const va = a.replace(/^v/, '')
  const vb = b.replace(/^v/, '')

  // 拆分 base 和 pre-release
  const [baseA, preA] = va.split('-', 2)
  const [baseB, preB] = vb.split('-', 2)

  // 比较 base 版本（纯数字部分）
  const pa = baseA.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = baseB.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }

  // base 版本相同，比较 pre-release
  // 无 pre-release > 有 pre-release
  if (!preA && preB) return 1
  if (preA && !preB) return -1
  if (!preA && !preB) return 0

  // 都有 pre-release，字符串比较
  if (preA! > preB!) return 1
  if (preA! < preB!) return -1
  return 0
}

/** 格式化 GitHub API 日期为友好显示 */
export function formatReleaseDate(isoDate: string, lang: 'zh-CN' | 'en' = 'zh-CN'): string {
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return isoDate
    if (lang === 'zh-CN') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return isoDate
  }
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 解析 GitHub Release assets，按平台分类 */
function parseAssets(assets: GitHubAsset[]): UpdateInfo['downloads'] {
  const result: UpdateInfo['downloads'] = {}
  for (const a of assets) {
    const name = a.name.toLowerCase()
    // 跳过 JSON 清单文件
    if (name.endsWith('.json')) continue
    // Windows: .msi / .exe / -setup
    if (name.endsWith('.msi') || name.endsWith('.exe') || name.includes('setup') || name.includes('windows') || name.includes('win64') || name.includes('x64-setup')) {
      if (!result.windows) result.windows = { name: a.name, url: a.browser_download_url, size: a.size }
    }
    // macOS: .dmg / .app
    else if (name.endsWith('.dmg') || name.endsWith('.app') || name.includes('macos') || name.includes('darwin') || name.includes('aarch64') || name.includes('x86_64-apple')) {
      if (!result.macos) result.macos = { name: a.name, url: a.browser_download_url, size: a.size }
    }
    // Linux: .deb / .AppImage
    else if (name.endsWith('.deb') || name.endsWith('.appimage') || name.includes('linux') || name.includes('ubuntu')) {
      if (!result.linux) result.linux = { name: a.name, url: a.browser_download_url, size: a.size }
    }
  }
  return result
}

/**
 * 尝试 fetch JSON，失败返回 null
 * 在 Tauri 环境中使用 @tauri-apps/plugin-http 绕过 CORS 限制
 */
async function tryFetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    // Tauri 环境：使用 Tauri HTTP 插件绕过 CORS
    if (isTauri()) {
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
        const res = await tauriFetch(url, {
          method: 'GET',
          headers: headers || {},
        })
        if (!res.ok) {
          console.warn(`[updater] tauriFetch ${url} returned ${res.status}`)
          return null
        }
        // v2: 使用标准 Response.json() 解析
        return await res.json() as T
      } catch (e) {
        console.warn(`[updater] tauriFetch ${url} failed, falling back to fetch:`, e)
        // 降级到普通 fetch
      }
    }

    // 浏览器环境或 Tauri HTTP 降级：使用原生 fetch
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(headers || {}),
      },
    })
    if (!res.ok) {
      console.warn(`[updater] fetch ${url} returned ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (e) {
    console.warn(`[updater] fetch ${url} failed:`, e)
    return null
  }
}

// ── 静态 JSON 清单格式（CI 生成）──
interface UpdateManifest {
  version: string
  tagName?: string
  pubDate: string
  releaseNotes?: string
  htmlUrl?: string
  downloads?: UpdateInfo['downloads']
}
