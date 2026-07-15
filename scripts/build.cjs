/**
 * FkeMark 自动化构建脚本
 * 用法: node scripts/build.cjs [portable|msi|nsis|all]
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release')
const TARGET_DIR = path.join(PROJECT_ROOT, 'src-tauri', 'target')
const BINARY_PATH = path.join(TARGET_DIR, 'x86_64-pc-windows-msvc', 'release', 'fke-mark.exe')

function run(cmd, options = {}) {
  console.log(`▶ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT, ...options })
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function buildFrontend() {
  console.log('\n📦 构建前端...')
  run('npm run build')
}

function buildRust() {
  console.log('\n🦀 构建 Rust 后端...')
  run('cargo build --release --manifest-path src-tauri/Cargo.toml')
}

function createPortable() {
  console.log('\n🍃 创建绿色便携版...')
  ensureDir(RELEASE_DIR)
  
  // 复制 exe
  const destExe = path.join(RELEASE_DIR, 'FkeMark.exe')
  fs.copyFileSync(BINARY_PATH, destExe)
  console.log(`  ✅ 复制 exe: ${destExe}`)
  
  // 创建 zip
  const zipPath = path.join(RELEASE_DIR, 'FkeMark-0.1.0-windows-portable.zip')
  try {
    fs.unlinkSync(zipPath)
  } catch {}
  
  run(`powershell Compress-Archive -Path "${destExe}" -DestinationPath "${zipPath}" -Force`)
  console.log(`  ✅ 创建 zip: ${zipPath}`)
  
  // 显示文件信息
  const exeSize = (fs.statSync(destExe).size / 1024 / 1024).toFixed(2)
  const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)
  console.log(`  📊 exe: ${exeSize} MB, zip: ${zipSize} MB`)
}

function createMSI() {
  console.log('\n📦 创建 MSI 安装包...')
  try {
    run('npx tauri build --ci --bundles msi')
    console.log('  ✅ MSI 构建完成')
    
    // 查找生成的 MSI 文件
    const bundleDir = path.join(TARGET_DIR, 'release', 'bundle', 'msi')
    if (fs.existsSync(bundleDir)) {
      const msis = fs.readdirSync(bundleDir).filter(f => f.endsWith('.msi'))
      if (msis.length > 0) {
        const srcMsi = path.join(bundleDir, msis[0])
        const destMsi = path.join(RELEASE_DIR, msis[0])
        fs.copyFileSync(srcMsi, destMsi)
        console.log(`  ✅ 复制 MSI: ${destMsi}`)
      }
    }
  } catch (e) {
    console.log('  ❌ MSI 构建失败，尝试用 cargo tauri...')
    try {
      run('cargo tauri build --ci --bundles msi')
      console.log('  ✅ MSI 构建完成 (cargo tauri)')
    } catch (e2) {
      console.log('  ❌ MSI 构建失败。请使用绿色便携版。')
    }
  }
}

function createNSIS() {
  console.log('\n📦 创建 NSIS 安装包...')
  try {
    run('npx tauri build --ci --bundles nsis')
    console.log('  ✅ NSIS 构建完成')
  } catch (e) {
    console.log('  ❌ NSIS 构建失败，尝试用 cargo tauri...')
    try {
      run('cargo tauri build --ci --bundles nsis')
      console.log('  ✅ NSIS 构建完成 (cargo tauri)')
    } catch (e2) {
      console.log('  ❌ NSIS 构建失败。请使用绿色便携版。')
    }
  }
}

// 主流程
const target = process.argv[2] || 'all'

console.log('🔨 FkeMark 构建脚本')
console.log(`目标: ${target}`)
console.log('========================')

buildFrontend()
buildRust()

switch (target) {
  case 'portable':
    createPortable()
    break
  case 'msi':
    createMSI()
    break
  case 'nsis':
    createNSIS()
    break
  case 'all':
  default:
    createPortable()
    createMSI()
    createNSIS()
    break
}

console.log('\n✅ 构建完成!')
console.log(`产物目录: ${RELEASE_DIR}`)

// 列出产物
if (fs.existsSync(RELEASE_DIR)) {
  const files = fs.readdirSync(RELEASE_DIR)
  console.log('\n产物列表:')
  files.forEach(f => {
    const filePath = path.join(RELEASE_DIR, f)
    const stat = fs.statSync(filePath)
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2)
    console.log(`  ${f} (${sizeMB} MB)`)
  })
}
