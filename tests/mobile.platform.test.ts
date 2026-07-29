import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { useMobileRuntime } from '../src/hooks/useMobileRuntime'
import { isMobileRuntime, isMobileUserAgent } from '../src/utils/platform'

function readWorkflow(name: string): string {
  return readFileSync(resolve(process.cwd(), '.github/workflows', name), 'utf8')
}

function needsList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

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

  it('窗口跨越移动端断点时更新运行时状态', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    const root = createRoot(container)
    document.body.appendChild(container)

    function RuntimeProbe() {
      return createElement('span', { 'data-mobile': String(useMobileRuntime()) })
    }

    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
      await act(async () => root.render(createElement(RuntimeProbe)))
      expect(container.querySelector('span')?.getAttribute('data-mobile')).toBe('false')

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
      await act(async () => window.dispatchEvent(new Event('resize')))
      expect(container.querySelector('span')?.getAttribute('data-mobile')).toBe('true')
    } finally {
      await act(async () => root.unmount())
      container.remove()
      Object.defineProperty(window, 'innerWidth', originalWidth!)
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
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
    expect(androidConfig.build.beforeDevCommand).toBe('npm run dev')
    expect(androidConfig.build.beforeBuildCommand).toBe('npm run build')

    const wrapperSource = readFileSync(resolve(process.cwd(), 'scripts/tauri-android.cjs'), 'utf8')
    expect(wrapperSource).toContain('result.status !== 0')
    expect(wrapperSource).toContain('命令执行失败')
  })
})

describe('Android workflow artifacts', () => {
  it.each([
    ['dev.yml', 'dev-release', 'dev-build-android-universal', 'dev'],
    ['release.yml', 'create-release', 'release-build-android-universal', 'latest'],
  ])('adds Android package output to %s', (workflowName, upstreamJob, artifactName, updateChannel) => {
    const source = readWorkflow(workflowName)
    const workflow = parse(source) as { jobs: Record<string, any> }
    const androidJob = workflow.jobs['build-android']

    expect(androidJob).toBeTruthy()
    expect(needsList(androidJob.needs)).toContain(upstreamJob)
    expect(needsList(workflow.jobs.publish.needs)).toContain('build-android')
    expect(androidJob['runs-on']).toBe('ubuntu-22.04')
    expect(androidJob['timeout-minutes']).toBe(60)
    expect(String(workflow.jobs.publish.if)).toContain(`needs.${upstreamJob}.result == 'success'`)
    expect(String(workflow.jobs.publish.if)).toContain(`needs.build.result == 'success'`)

    const steps = androidJob.steps as Array<Record<string, any>>
    const checkoutStep = steps.find((step) => step.uses === 'actions/checkout@v4')
    expect(checkoutStep?.with?.['fetch-depth']).toBe(0)
    expect(source).not.toContain('dtolnay/rust-toolchain@stable')
    expect(source).not.toContain('swatinem/rust-cache@v2')
    expect(steps.some((step) => /^dtolnay\/rust-toolchain@[0-9a-f]{40}$/.test(String(step.uses)))).toBe(true)
    expect(steps.some((step) => /^swatinem\/rust-cache@[0-9a-f]{40}$/i.test(String(step.uses)))).toBe(true)
    expect(steps.some((step) => step.uses === 'actions/setup-java@v4')).toBe(true)
    expect(steps.some((step) => String(step.run ?? '').includes('npm run tauri:android:init'))).toBe(true)

    const buildStep = steps.find((step) => String(step.run ?? '').includes('npm run tauri:android:build'))
    expect(buildStep).toBeTruthy()
    expect(buildStep?.env?.VITE_UPDATE_CHANNEL).toBe(updateChannel)

    const uploadStep = steps.find((step) => step.uses === 'actions/upload-artifact@v4' && step.with?.name === artifactName)
    expect(uploadStep?.with?.path).toBe('release-staging/*')
    expect(source).toContain("-name '*.apk' -o -name '*.aab'")
    expect(source).toContain("downloads['android']")
    if (workflowName === 'dev.yml') {
      expect(source).not.toContain('android-${classifier}-${ext}.${ext}')
      expect(source).toContain('suffix=$((suffix + 1))')
    }
  })
})

describe('移动端样式约束', () => {
  it('保留旧视口回退并消除重复抽屉规则和层级冲突', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/styles/mobile.css'), 'utf8')

    expect(source).toMatch(/min-height: 100vh;\s+min-height: 100dvh;/)
    expect(source).toMatch(/height: 100vh;\s+height: 100dvh;/)
    expect(source.match(/^html\.mobile-runtime \.sidebar-wrapper \{$/gm)).toHaveLength(1)
    expect(source.match(/^html\.mobile-runtime \.sidebar-wrapper\.open \{$/gm)).toHaveLength(1)
    expect(source.match(/^html\.mobile-runtime \.ai-chat-sidebar\.open \{$/gm)).toHaveLength(1)

    const actionBarRule = source.match(/html\.mobile-runtime \.mobile-action-bar \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(actionBarRule).toContain('z-index: 180')
    expect(actionBarRule).not.toContain('z-index: 200')
  })
})
