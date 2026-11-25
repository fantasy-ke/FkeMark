// 便携包内容以及原生转换组件独立发布的回归测试。
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
  return { root, binary }
}

test('Windows 便携包不包含独立转换组件', async () => {
  const fixture = temporaryFixture()
  try {
    const directory = path.join(fixture.root, 'portable')
    copyPortable(fixture.binary, directory)
    const destination = path.join(fixture.root, 'portable.zip')
    await zipPortable(directory, destination)
    const archive = await JSZip.loadAsync(fs.readFileSync(destination))
    assert.deepEqual(Object.keys(archive.files).sort(), ['FkeMark.exe', 'README.txt'])
    assert.match(await archive.file('README.txt').async('string'), /下载文档转换组件/)
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }) }
})

test('便携组装不覆盖非空目录', () => {
  const fixture = temporaryFixture()
  try {
    const directory = path.join(fixture.root, 'portable')
    fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, 'user.txt'), '保留')
    assert.throws(() => copyPortable(fixture.binary, directory), /拒绝覆盖/)
    assert.equal(fs.readFileSync(path.join(directory, 'user.txt'), 'utf-8'), '保留')
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }) }
})

test('转换器不允许跨平台冻结', () => {
  const targets = {
    win32: process.arch === 'x64' ? 'x86_64-pc-windows-msvc' : null,
    linux: process.arch === 'x64' ? 'x86_64-unknown-linux-gnu' : null,
    darwin: process.arch === 'x64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin',
  }
  assert.equal(nativeTarget(), targets[process.platform])
  assert.throws(() => nativeTarget('unsupported-target'), /原生冻结/)
  const foreign = process.platform === 'win32' ? 'x86_64-unknown-linux-gnu' : 'x86_64-pc-windows-msvc'
  assert.throws(() => nativeTarget(foreign), /原生冻结/)
})

test('本地便携构建使用 Tauri 生产入口启用内嵌资源', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/build.cjs'), 'utf-8')
  assert.match(source, /run\('npx tauri build --ci --no-bundle --target x86_64-pc-windows-msvc'\)/)
  assert.doesNotMatch(source, /build --release --manifest-path src-tauri\/Cargo\.toml/)
})

test('Tauri 构建不依赖 Python 且不打包转换组件', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  assert.equal(pkg.scripts.build, 'tsc && vite build')
  assert.equal(pkg.scripts.test, 'vitest run')
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf-8'))
  assert.ok(!(config.bundle.resources ?? []).some(resource => resource.includes('converter')))
  assert.equal(config.bundle.macOS.minimumSystemVersion, '10.15')
  assert.equal(config.build.beforeBuildCommand, 'npm run build')
  assert.equal(config.build.beforeDevCommand, 'npm run dev')
})

test('发布组件按原生目标打包，不覆盖应用最新版本', () => {
  const workflow = YAML.parse(fs.readFileSync(path.join(ROOT, '.github/workflows/converter.yml'), 'utf-8'))
  const build = workflow.jobs.build
  assert.deepEqual(workflow.on.push.tags, ['converter-v[0-9]+.[0-9]+.[0-9]+'])
  assert.deepEqual(build.strategy.matrix.include.map(({ target }) => target), [
    'x86_64-pc-windows-msvc', 'x86_64-apple-darwin', 'aarch64-apple-darwin', 'x86_64-unknown-linux-gnu',
  ])
  assert.equal(build.strategy.matrix.include[1].runner, 'macos-15-intel')
  const python = build.steps.find(step => step.uses === 'actions/setup-python@v5')
  assert.equal(python.with['python-version'], '3.12')
  assert.equal(python.with.architecture, '${{ matrix.arch }}')
  assert.match(workflow.jobs.publish.steps.at(-1).run, /--latest=false --prerelease/)
})
