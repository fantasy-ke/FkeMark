/**
 * Tauri v2 资源路径转换工具
 *
 * Tauri v2 的 WebView 从 http://tauri.localhost/ 加载页面，
 * <img src="./assets/xxx.png"> 会被浏览器解析为 HTTP 请求而非文件系统路径。
 *
 * 使用 convertFileSrc() 将本地文件路径转为 http://asset.localhost/... 协议 URL，
 * WebView 才能正确加载本地图片。
 */

import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from './tauri'

/** 判断 src 是否为需要 convertFileSrc 的相对路径（非绝对 URL、非 data URI、非 hash） */
function isRelativeAssetPath(src: string): boolean {
  // 已经是绝对 URL 或 data URI → 不需要转换
  if (/^(https?:|data:|#|\/)/.test(src)) return false
  // 其他都是需要转换为 asset 协议 URL 的相对路径
  return true
}

/** 判断 src 是否为 Tauri asset 协议 URL */
export function isAssetUrl(src: string): boolean {
  return src.startsWith('http://asset.localhost/') || src.startsWith('https://asset.localhost/')
}

/**
 * 将相对路径（./assets/xxx）转为 WebView 可加载的 asset URL
 * - 非 Tauri 环境 / 无 docDir / 非相对路径 / 已是 URL → 原样返回
 */
export function toAssetUrl(src: string, docDir: string | null): string {
  if (!isTauri() || !docDir) return src
  if (!isRelativeAssetPath(src)) return src

  const cleanRel = src.replace(/^\.\//, '')
  // 统一用平台分隔符拼接绝对路径
  const isWin = docDir.includes(':') || docDir.includes('\\')
  const sep = isWin ? '\\' : '/'
  const fullPath = docDir + sep + cleanRel.replace(/\//g, sep)
  return convertFileSrc(fullPath)
}

/**
 * 将 WebView asset URL 转回相对路径（./assets/xxx）
 * - 非 asset URL / 无 docDir → 原样返回
 */
export function toRelPath(src: string, docDir: string | null): string {
  if (!isAssetUrl(src)) return src
  if (!docDir) return src

  // 从 URL 提取编码的文件路径
  const encodedPath = src.replace(/^https?:\/\/asset\.localhost\//, '')
  const fullPath = decodeURIComponent(encodedPath)

  // 统一分隔符进行比较
  const isWin = docDir.includes(':') || docDir.includes('\\')
  const sep = isWin ? '\\' : '/'
  const docDirNorm = docDir.replace(/[/\\]/g, sep)
  const fullPathNorm = fullPath.replace(/[/\\]/g, sep)

  if (fullPathNorm.toLowerCase().startsWith(docDirNorm.toLowerCase())) {
    const rel = fullPathNorm.substring(docDirNorm.length).replace(/^[\\\/]+/, '')
    return './' + rel.replace(/\\/g, '/')
  }
  return src
}
