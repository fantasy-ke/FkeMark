const { spawnSync } = require('node:child_process')
const path = require('node:path')

const action = process.argv[2]
const actionArguments = {
  init: ['android', 'init', '--ci'],
  dev: ['android', 'dev'],
  build: ['android', 'build', '--apk', '--aab'],
}

if (!actionArguments[action]) {
  console.error('用法: node scripts/tauri-android.cjs [init|dev|build]')
  process.exitCode = 1
} else {
  if (action === 'build') {
    try {
      require('./configure-android-signing.cjs').configureAndroidSigning()
    } catch (error) {
      console.error(`[错误] Android 签名配置失败：${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  const tauriArgs = ['--prefix', '..', 'tauri', ...actionArguments[action]]
  const windows = process.platform === 'win32'
  const tauriCommand = windows ? (process.env.ComSpec || 'cmd.exe') : 'npx'
  const commandArgs = windows
    ? ['/d', '/s', '/c', ['npx.cmd', ...tauriArgs].join(' ')]
    : tauriArgs
  const result = spawnSync(
    tauriCommand,
    commandArgs,
    {
      cwd: path.resolve(__dirname, '..', 'src-tauri'),
      stdio: 'inherit',
    },
  )

  if (result.error) throw result.error
  if (result.status !== 0) {
    const reason = result.status === null
      ? `信号 ${result.signal ?? 'unknown'}`
      : `退出码 ${result.status}`
    console.error(`[错误] tauri ${action} 命令执行失败（${reason}）`)
  }
  process.exitCode = result.status ?? 1
}
