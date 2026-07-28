import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isMobileRuntime, isMobileUserAgent } from '../src/utils/platform'

describe('移动端运行时识别', () => {
  it('识别 Android、iPhone 与触控 iPad 用户代理', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 15)')).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0', 'MacIntel', 5)).toBe(true)
  })

  it('不将桌面用户代理识别为移动端', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0)).toBe(false)
  })

  it('在窄屏视口使用移动端布局', () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })

    try {
      expect(isMobileRuntime()).toBe(true)
    } finally {
      Object.defineProperty(window, 'innerWidth', originalWidth!)
    }
  })
})

describe('Android 打包入口', () => {
  it('保留初始化、调试和产物构建命令', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
    const androidConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri/tauri.android.conf.json'), 'utf8'))

    expect(packageJson.scripts['tauri:android:init']).toContain('scripts/tauri-android.cjs init')
    expect(packageJson.scripts['tauri:android:dev']).toContain('scripts/tauri-android.cjs dev')
    expect(packageJson.scripts['tauri:android:build']).toContain('scripts/tauri-android.cjs build')
    expect(androidConfig.build.beforeBuildCommand).toBe('npm --prefix .. run build')
  })
})
