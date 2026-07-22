/**
 * FkeMark 版本更新服务
 * - 通过 GitHub API / 静态 JSON 清单检查最新版本（latest 通道 / dev 通道）
 * - 使用 Tauri HTTP API 绕过 WebView2 CORS 限制
 * - 比较版本号判断是否有可用更新（支持 pre-release / dev 版本）
 * - 打开外部链接（GitHub 仓库 / Issues / Releases）
 */

import { isTauri } from './tauri'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'

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
    windows?: DownloadAsset
    macos?: DownloadAsset
    linux?: DownloadAsset
  }
}

// ── 单个平台下载资源 ──
export interface DownloadAsset {
  name: string
  url: string
  size?: number
  sha256?: string  // 完整性校验值（CI 清单提供时）
}

// ── 下载进度事件（Rust emit）──
export interface DownloadProgress {
  version: string
  downloaded: number
  total: number
  percent: number
  speed: number // 字节/秒
}

// ── 续传状态（Rust 返回）──
export interface DownloadState {
  version: string
  url: string
  fileName: string
  expectedSize: number
  expectedSha256: string
  downloaded: number
}

// ── 启动自愈结果（Rust 返回）──
export interface FinalizeResult {
  status: 'success' | 'failed' | 'none'
  prevVersion: string
  newVersion: string
  rollbackAvailable: boolean
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

// ── 应用内下载 / 安装 / 回滚 ──

/** 当前平台对应的下载资源 key */
export function getPlatformKey(): 'windows' | 'macos' | 'linux' {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  return 'linux'
}

/** 从更新信息中挑选当前平台的下载资源 */
export function getPlatformDownload(info: UpdateInfo): DownloadAsset | undefined {
  return info.downloads[getPlatformKey()]
}

/**
 * 下载更新包（后端断点续传 + 进度上报 + 完整性校验）
 * @returns 校验通过的正式安装包本地路径
 */
export async function downloadUpdate(info: UpdateInfo): Promise<string> {
  const asset = getPlatformDownload(info)
  if (!asset) throw new Error('update.noPlatformPackage')
  return await invoke<string>('download_update', {
    url: asset.url,
    version: info.version,
    fileName: asset.name,
    expectedSize: asset.size ?? 0,
    expectedSha256: asset.sha256 ?? '',
  })
}

/** 取消正在进行的下载（保留已下载部分以便续传） */
export async function cancelDownload(): Promise<void> {
  await invoke('cancel_download')
}

/** 查询某版本的续传状态（已下载字节 / 是否已完成） */
export async function getDownloadState(info: UpdateInfo): Promise<DownloadState | null> {
  const asset = getPlatformDownload(info)
  if (!asset) return null
  return await invoke<DownloadState | null>('get_download_state', {
    version: info.version,
    fileName: asset.name,
  })
}

/** 校验安装包完整性 */
export async function verifyUpdatePackage(path: string, size: number, sha256: string): Promise<boolean> {
  return await invoke<boolean>('verify_update_package', {
    path,
    expectedSize: size,
    expectedSha256: sha256,
  })
}

/** 安装更新（调用前须确保所有文档已保存），成功后应用会退出并由安装器接管 */
export async function installUpdate(installerPath: string, newVersion: string): Promise<void> {
  await invoke('install_update', { installerPath, newVersion })
}

/** 启动自愈：判断上次安装是否成功，返回结果 */
export async function finalizeUpdate(): Promise<FinalizeResult | null> {
  if (!isTauri()) return null
  try {
    return await invoke<FinalizeResult>('finalize_update')
  } catch (e) {
    console.warn('[updater] finalize_update failed:', e)
    return null
  }
}

/** 回滚到上一个版本（使用保留的旧安装包静默重装），成功后应用会退出 */
export async function rollbackUpdate(): Promise<void> {
  await invoke('rollback_update')
}

/** 监听下载进度事件，返回取消订阅函数 */
export async function listenDownloadProgress(
  handler: (p: DownloadProgress) => void
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const un = await listen<DownloadProgress>('update://download-progress', (e) => handler(e.payload))
  return un
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

/** 格式化 GitHub API 日期为友好显示（含时分秒） */
export function formatReleaseDate(isoDate: string, lang: 'zh-CN' | 'en' = 'zh-CN'): string {
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return isoDate
    const pad = (n: number) => n.toString().padStart(2, '0')
    const hh = pad(d.getHours())
    const mm = pad(d.getMinutes())
    const ss = pad(d.getSeconds())
    if (lang === 'zh-CN') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}:${ss}`
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ` ${hh}:${mm}:${ss}`
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
  // 先收集所有匹配的 Windows 候选，再按优先级选择
  let winCandidates: { asset: GitHubAsset; priority: number }[] = []
  for (const a of assets) {
    const name = a.name.toLowerCase()
    // 跳过 JSON 清单文件
    if (name.endsWith('.json')) continue
    // 排除便携版（安装版程序更新时应下载安装版，而非 portable）
    if (name.includes('portable')) continue
    // Windows: 优先 -setup.exe，其次 .msi
    if (name.endsWith('.msi') || name.endsWith('.exe') || name.includes('setup') || name.includes('windows') || name.includes('win64') || name.includes('x64-setup')) {
      let priority = 0
      if (name.includes('-setup.exe')) priority = 100
      else if (name.endsWith('.msi')) priority = 80
      else if (name.endsWith('.exe')) priority = 50
      else priority = 10
      winCandidates.push({ asset: a, priority })
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
  // Windows：按优先级排序，取最高优先级
  if (winCandidates.length > 0) {
    winCandidates.sort((a, b) => b.priority - a.priority)
    const best = winCandidates[0].asset
    result.windows = { name: best.name, url: best.browser_download_url, size: best.size }
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
