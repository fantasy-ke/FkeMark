// 构建者专用：隔离 Python 环境及原生 onedir 冻结，运行用户不需要 Python。
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const CONVERTER = path.join(ROOT, 'converter')
const VENV = path.join(CONVERTER, '.venv-build')
const PYTHON = path.join(VENV, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const BUILD = path.join(CONVERTER, '.build')
const OUTPUT = path.join(BUILD, 'dist', 'converter')
const PACKAGE_SCRIPT = path.join(CONVERTER, 'package_component.py')
const EXECUTABLE = path.join(OUTPUT, process.platform === 'win32' ? 'document-converter.exe' : 'document-converter')
const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
for (const key of ['PYTHONPATH', 'PYTHONHOME', 'PYTHONSTARTUP']) delete env[key]

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: ROOT, env, shell: false, windowsHide: true,
    stdio: capture ? 'pipe' : 'inherit', encoding: capture ? 'utf-8' : undefined,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`转换器构建步骤失败：${path.basename(command)} ${args.slice(0, 2).join(' ')}${capture ? `\n${result.stderr || ''}` : ''}`, { cause: result.error })
  }
  return capture ? result.stdout.trim() : ''
}

function nativeTarget(target) {
  const targets = {
    'x86_64-pc-windows-msvc': ['win32', 'x64'],
    'x86_64-unknown-linux-gnu': ['linux', 'x64'],
    'x86_64-apple-darwin': ['darwin', 'x64'],
    'aarch64-apple-darwin': ['darwin', 'arm64'],
  }
  target ??= Object.keys(targets).find(key => targets[key][0] === process.platform && targets[key][1] === process.arch)
  const native = targets[target]
  if (!native || native[0] !== process.platform || native[1] !== process.arch) {
    throw new Error('Python 转换器必须在目标平台和架构上原生冻结，不能交叉构建')
  }
  return target
}

function resolveBuildPython() {
  const candidates = process.env.FKEMARK_BUILD_PYTHON
    ? [process.env.FKEMARK_BUILD_PYTHON]
    : ['python3.12', 'python3', 'python']
  for (const candidate of candidates) {
    try {
      const version = run(candidate, ['-I', '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], true)
      if (version === '3.12') return candidate
    } catch {
      // 构建工具候选不可用时继续检查；绝不作为应用运行时回退。
    }
  }
  throw new Error('构建转换器需要 CPython 3.12；构建者可用 FKEMARK_BUILD_PYTHON 指定可执行文件')
}

function testSource() {
  if (!fs.existsSync(PYTHON)) throw new Error('尚未准备构建环境，请先由构建者运行 npm run converter:build')
  run(PYTHON, [path.join(CONVERTER, 'test_converter.py')])
}

function main(args = process.argv.slice(2)) {
  const targetIndex = args.indexOf('--target')
  const target = nativeTarget(targetIndex >= 0 ? args[targetIndex + 1] : process.env.FKEMARK_CONVERTER_TARGET)
  if (args.includes('--test')) return testSource()
  if (args.includes('--smoke')) return run(PYTHON, [path.join(CONVERTER, 'smoke_test.py'), EXECUTABLE])
  if (args.includes('--verify')) return run(PYTHON, [path.join(CONVERTER, 'verify_bundle.py'), OUTPUT])
  if (args.includes('--package')) {
    return run(PYTHON, [PACKAGE_SCRIPT, 'package', OUTPUT, path.join(BUILD, `FkeMark-converter-v1-${target}.tar.gz`)])
  }
  if (!fs.existsSync(PYTHON)) run(resolveBuildPython(), ['-I', '-m', 'venv', VENV])
  const version = run(PYTHON, ['-I', '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], true)
  if (version !== '3.12') throw new Error('隔离构建环境不是 CPython 3.12，请构建者重新建立 converter/.venv-build')
  run(PYTHON, ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', '-r', path.join(CONVERTER, 'requirements.txt'), '-r', path.join(CONVERTER, 'requirements-test.txt')])
  if (process.platform === 'darwin') {
    // NumPy 同版还提供 macOS 14 Accelerate wheel；不能让新 runner 自动选中高最低版本的变体。
    const wheelPlatform = process.arch === 'arm64' ? 'macosx_11_0_arm64' : 'macosx_10_13_x86_64'
    const wheelRoot = path.join(CONVERTER, '.compatible-wheels')
    fs.mkdirSync(wheelRoot, { recursive: true })
    const wheelDirectory = fs.mkdtempSync(path.join(wheelRoot, 'download-'))
    try {
      run(PYTHON, ['-I', '-m', 'pip', 'download', '--disable-pip-version-check', '--no-deps', '--only-binary=:all:',
        '--platform', wheelPlatform, '--implementation', 'cp', '--python-version', '3.12', '--abi', 'cp312',
        '--dest', wheelDirectory, 'numpy==2.5.5'])
      const wheel = path.join(wheelDirectory, `numpy-2.5.5-cp312-cp312-${wheelPlatform}.whl`)
      if (!fs.existsSync(wheel)) throw new Error('未找到保留 macOS 最低版本的 NumPy wheel')
      run(PYTHON, ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-deps', '--force-reinstall', wheel])
    } finally {
      fs.rmSync(wheelDirectory, { recursive: true, force: true })
    }
  }
  const tessdata = path.join(BUILD, 'tessdata')
  run(PYTHON, [PACKAGE_SCRIPT, 'models', tessdata])
  if (target === 'x86_64-apple-darwin') {
    run(PYTHON, [path.join(CONVERTER, 'build_legacy_ocr.py'), tessdata])
  }
  run(PYTHON, ['-I', '-m', 'pip', 'check'])
  testSource()
  run(PYTHON, ['-I', '-m', 'PyInstaller', '--noconfirm', '--clean', '--distpath', path.dirname(OUTPUT), '--workpath', path.join(BUILD, 'work'), path.join(CONVERTER, 'document-converter.spec')])
  run(PYTHON, [path.join(CONVERTER, 'verify_bundle.py'), OUTPUT])
  run(PYTHON, [path.join(CONVERTER, 'smoke_test.py'), EXECUTABLE])
  console.log('已构建并验证离线文档转换器完整目录')
}

module.exports = { nativeTarget }
if (require.main === module) {
  try { main() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
