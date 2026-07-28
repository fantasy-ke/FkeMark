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
  process.exitCode = result.status ?? 1
}
