import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
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

    const steps = androidJob.steps as Array<Record<string, any>>
    expect(steps.some((step) => step.uses === 'actions/setup-java@v4')).toBe(true)
    expect(steps.some((step) => String(step.run ?? '').includes('npm run tauri:android:init'))).toBe(true)

    const buildStep = steps.find((step) => String(step.run ?? '').includes('npm run tauri:android:build'))
    expect(buildStep).toBeTruthy()
    expect(buildStep?.env?.VITE_UPDATE_CHANNEL).toBe(updateChannel)

    const uploadStep = steps.find((step) => step.uses === 'actions/upload-artifact@v4' && step.with?.name === artifactName)
    expect(uploadStep?.with?.path).toBe('release-staging/*')
    expect(source).toContain("-name '*.apk' -o -name '*.aab'")
    expect(source).toContain("downloads['android']")
  })
})
