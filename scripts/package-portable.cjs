// 本地构建与 CI 共用：按完整目录组装便携包，不能只复制应用或转换器 exe。
const fs = require('node:fs')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')
const { Readable } = require('node:stream')
const JSZip = require('jszip')

const ROOT = path.resolve(__dirname, '..')
const CONVERTER = path.join(ROOT, 'src-tauri/resources/converter')

function copyPortable(binary, directory, converter = CONVERTER) {
  if (!fs.statSync(binary).isFile()) throw new Error('没有找到应用可执行文件')
  if (!fs.existsSync(path.join(converter, 'document-converter.exe')) || !fs.existsSync(path.join(converter, '_internal'))) {
    throw new Error('没有找到完整 Windows 转换器目录，不能生成残缺便携包')
  }
  if (fs.existsSync(directory) && fs.readdirSync(directory).length) {
    throw new Error('便携组装目录必须是新目录或空目录，拒绝覆盖已有内容')
  }
  fs.mkdirSync(directory, { recursive: true })
  fs.copyFileSync(binary, path.join(directory, 'FkeMark.exe'))
  fs.cpSync(converter, path.join(directory, 'resources/converter'), { recursive: true, dereference: false })
  fs.writeFileSync(path.join(directory, 'README.txt'), [
    'FkeMark 便携包 / portable package', '',
    '直接运行 FkeMark.exe；请保留 resources/converter 完整目录。',
    '无需安装 Python。设置、缓存、版本历史和回收站保存在 Windows AppData 中。',
    'Run FkeMark.exe directly and keep the entire resources/converter directory.',
    'Python is not required. Settings, cache, history and trash remain in Windows AppData.', '',
  ].join('\r\n'), 'utf-8')
}

async function zipPortable(directory, destination) {
  const zip = new JSZip()
  function include(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name)
      const relative = prefix + entry.name
      if (entry.isSymbolicLink()) throw new Error('Windows 便携目录不能包含符号链接')
      if (entry.isDirectory()) include(filename, relative + '/')
      else if (entry.isFile()) {
        // 顺序按需打开文件，完整 onedir 的上千文件不能同时占用文件描述符。
        zip.file(relative, Readable.from((async function* () { yield* fs.createReadStream(filename) })()))
      }
    }
  }
  include(directory)
  await pipeline(zip.generateNodeStream({ streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } }), fs.createWriteStream(destination))
}

async function main() {
  const args = process.argv.slice(2)
  function argument(name) {
    const index = args.indexOf(name)
    if (index < 0 || !args[index + 1]) throw new Error(`缺少 ${name} 构建参数`)
    return path.resolve(args[index + 1])
  }
  const binary = argument('--binary')
  const directory = argument('--directory')
  const zip = argument('--zip')
  copyPortable(binary, directory)
  await zipPortable(directory, zip)
  console.log(`已生成包含完整离线转换器的便携包：${zip}`)
}

module.exports = { copyPortable, zipPortable }
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
