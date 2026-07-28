/**
 * 从统一的 SVG 品牌源生成桌面端与 Windows 所需应用图标。
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const sourceIcon = path.join(rootDir, 'public', 'logo.svg')
const tempDir = path.join(rootDir, '.tmp-fkemark-icons')
const tauriIconsDir = path.join(rootDir, 'src-tauri', 'icons')
const rootIconsDir = path.join(rootDir, 'icons')
const tauriCli = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

const desktopIcons = [
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
  'icon.ico',
  'icon.icns'
]

const windowsStoreIcons = [
  'Square30x30Logo.png',
  'Square44x44Logo.png',
  'Square71x71Logo.png',
  'Square89x89Logo.png',
  'Square107x107Logo.png',
  'Square142x142Logo.png',
  'Square150x150Logo.png',
  'Square284x284Logo.png',
  'Square310x310Logo.png',
  'StoreLogo.png'
]

function copyIcons(names, destination) {
  fs.mkdirSync(destination, { recursive: true })
  for (const name of names) {
    fs.copyFileSync(path.join(tempDir, name), path.join(destination, name))
  }
}

if (!fs.existsSync(sourceIcon)) {
  throw new Error(`Logo source not found: ${sourceIcon}`)
}

fs.rmSync(tempDir, { recursive: true, force: true })
fs.mkdirSync(tempDir, { recursive: true })

try {
  const result = spawnSync(process.execPath, [tauriCli, 'icon', sourceIcon, '--output', tempDir], {
    cwd: rootDir,
    stdio: 'inherit'
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Tauri icon generation failed with exit code ${result.status ?? 1}`)
  }

  copyIcons(desktopIcons, tauriIconsDir)
  copyIcons([...desktopIcons, ...windowsStoreIcons], rootIconsDir)
  console.log('FkeMark icons generated from public/logo.svg')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
