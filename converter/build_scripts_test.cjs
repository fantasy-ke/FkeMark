// 便携完整目录、原生架构与普通前端构建隔离的回归测试。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const JSZip = require('jszip')
const YAML = require('yaml')
const { copyPortable, zipPortable } = require('../scripts/package-portable.cjs')
const { nativeTarget } = require('../scripts/build-converter.cjs')
const ROOT = path.resolve(__dirname, '..')

function temporaryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fkemark-portable-test-'))
  const binary = path.join(root, 'app.exe')
  fs.writeFileSync(binary, 'app')
  const converter = path.join(root, 'converter')
  for (const name of ['document-converter.exe', '_internal/numpy.libs/runtime.dll', '_internal/pdfminer/cmap/sample.pickle.gz', '_internal/pypdfium2_raw/pdfium.dll', 'licenses/Python-LICENSE.txt']) {
    const file = path.join(converter, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, name)
  }
  return { root, binary, converter }
}

test('便携包保留完整资源目录，压缩包不扁平化', async () => {
  const fixture = temporaryFixture()
  try {
    const directory = path.join(fixture.root, 'portable')
    copyPortable(fixture.binary, directory, fixture.converter)
    const destination = path.join(fixture.root, 'portable.zip')
    await zipPortable(directory, destination)
    const archive = await JSZip.loadAsync(fs.readFileSync(destination))
    assert.ok(archive.file('FkeMark.exe'))
    assert.ok(archive.file('resources/converter/document-converter.exe'))
    assert.ok(archive.file('resources/converter/_internal/numpy.libs/runtime.dll'))
    assert.ok(archive.file('resources/converter/_internal/pdfminer/cmap/sample.pickle.gz'))
    assert.ok(archive.file('resources/converter/_internal/pypdfium2_raw/pdfium.dll'))
    assert.ok(archive.file('resources/converter/licenses/Python-LICENSE.txt'))
    assert.equal(archive.file('runtime.dll'), null)
    assert.equal(archive.file('document-converter.exe'), null)
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }) }
})

test('缺少内部资源时拒绝组装，不覆盖非空目录', () => {
  const fixture = temporaryFixture()
  try {
    const directory = path.join(fixture.root, 'portable')
    fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, 'user.txt'), '保留')
    assert.throws(() => copyPortable(fixture.binary, directory, fixture.converter), /拒绝覆盖/)
    assert.equal(fs.readFileSync(path.join(directory, 'user.txt'), 'utf-8'), '保留')
    fs.rmSync(path.join(fixture.converter, '_internal'), { recursive: true })
    assert.throws(() => copyPortable(fixture.binary, path.join(fixture.root, 'new'), fixture.converter), /完整 Windows/)
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }) }
})

test('转换器不允许跨平台冻结', () => {
  const targets = {
    win32: process.arch === 'x64' ? 'x86_64-pc-windows-msvc' : null,
    linux: process.arch === 'x64' ? 'x86_64-unknown-linux-gnu' : null,
    darwin: process.arch === 'x64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin',
  }
  assert.doesNotThrow(() => nativeTarget(targets[process.platform]))
  assert.throws(() => nativeTarget('unsupported-target'), /原生冻结/)
  const foreign = process.platform === 'win32' ? 'x86_64-unknown-linux-gnu' : 'x86_64-pc-windows-msvc'
  assert.throws(() => nativeTarget(foreign), /原生冻结/)
})

test('本地便携构建使用 Tauri 生产入口启用内嵌资源', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/build.cjs'), 'utf-8')
  assert.match(source, /run\('npx tauri build --ci --no-bundle --target x86_64-pc-windows-msvc'\)/)
  assert.doesNotMatch(source, /build --release --manifest-path src-tauri\/Cargo\.toml/)
})

test('普通 npm test/build 不安装 Python，Tauri 打包保留资源层级', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  assert.equal(pkg.scripts.build, 'tsc && vite build')
  assert.equal(pkg.scripts.test, 'vitest run')
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf-8'))
  assert.deepEqual(config.bundle.resources, ['resources/converter/'])
  assert.equal(config.bundle.macOS.minimumSystemVersion, '10.15')
  assert.ok(config.build.beforeBuildCommand.startsWith('npm run converter:prepare &&'))
  assert.ok(config.build.beforeDevCommand.startsWith('npm run converter:prepare &&'))
})

test('两条发布流水线使用原生 Python 架构与共享便携组装脚本', () => {
  for (const file of ['dev.yml', 'release.yml']) {
    const source = fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf-8')
    const workflow = YAML.parse(source)
    const build = workflow.jobs.build
    const intel = build.strategy.matrix.include.find(entry => entry.target === 'x86_64-apple-darwin')
    assert.equal(intel.platform, 'macos-15-intel')
    assert.ok(build.steps.some(step => step.uses === 'actions/setup-python@v5' && step.with['python-version'] === '3.12.13'))
    assert.ok(build.steps.some(step => step.run === 'npm run converter:build'))
    assert.match(source, /node scripts\/package-portable\.cjs/)
    assert.doesNotMatch(source, /cp "\$PORTABLE" "\$PORTABLE_DIR\/FkeMark.exe"/)
  }
})
