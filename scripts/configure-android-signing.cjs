const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

function findMatchingBrace(source, openIndex) {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function indentAt(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  return source.slice(lineStart, index).match(/^\s*/)?.[0] ?? ''
}

function configureGradleSigning(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const buildTypesMatch = /\bbuildTypes\s*\{/.exec(source)
  if (!buildTypesMatch) throw new Error('未在 app/build.gradle.kts 中找到 buildTypes 配置')

  if (!source.includes('rootProject.file("upload-keystore.jks")')) {
    const buildTypesLineStart = source.lastIndexOf('\n', buildTypesMatch.index - 1) + 1
    const blockIndent = source.slice(buildTypesLineStart, buildTypesMatch.index)
    const itemIndent = `${blockIndent}    `
    const signingBlock = [
      `${blockIndent}signingConfigs {`,
      `${itemIndent}create("release") {`,
      `${itemIndent}    keyAlias = System.getenv("ANDROID_KEY_ALIAS")`,
      `${itemIndent}    keyPassword = System.getenv("ANDROID_KEY_PASSWORD")`,
      `${itemIndent}    storeFile = rootProject.file("upload-keystore.jks")`,
      `${itemIndent}    storePassword = System.getenv("ANDROID_KEY_PASSWORD")`,
      `${itemIndent}}`,
      `${blockIndent}}`,
      '',
    ].join(eol)
    source = `${source.slice(0, buildTypesLineStart)}${signingBlock}${source.slice(buildTypesLineStart)}`
  }

  if (!source.includes('signingConfig = signingConfigs.getByName("release")')) {
    const refreshedBuildTypes = /\bbuildTypes\s*\{/.exec(source)
    const buildOpen = source.indexOf('{', refreshedBuildTypes.index)
    const buildClose = findMatchingBrace(source, buildOpen)
    if (buildClose < 0) throw new Error('buildTypes 配置缺少结束括号')

    const buildBody = source.slice(buildOpen + 1, buildClose)
    const releaseMatch = /(?:getByName\("release"\)|\brelease)\s*\{/.exec(buildBody)
    if (releaseMatch) {
      const releaseOpen = buildOpen + 1 + releaseMatch.index + releaseMatch[0].lastIndexOf('{')
      const releaseIndent = `${indentAt(source, buildOpen + 1 + releaseMatch.index)}    `
      source = `${source.slice(0, releaseOpen + 1)}${eol}${releaseIndent}signingConfig = signingConfigs.getByName("release")${source.slice(releaseOpen + 1)}`
    } else {
      const blockIndent = indentAt(source, refreshedBuildTypes.index)
      const itemIndent = `${blockIndent}    `
      const releaseBlock = [
        '',
        `${itemIndent}getByName("release") {`,
        `${itemIndent}    signingConfig = signingConfigs.getByName("release")`,
        `${itemIndent}}`,
      ].join(eol)
      source = `${source.slice(0, buildOpen + 1)}${releaseBlock}${source.slice(buildOpen + 1)}`
    }
  }

  return source
}

function configureAndroidSigning(androidProjectPath) {
  const androidRoot = androidProjectPath
    ? path.resolve(androidProjectPath)
    : path.resolve(__dirname, '..', 'src-tauri', 'gen', 'android')
  const buildFile = path.join(androidRoot, 'app', 'build.gradle.kts')
  if (!existsSync(buildFile)) {
    throw new Error(`未找到 ${buildFile}，请先执行 npm run tauri:android:init`)
  }

  requiredEnv('ANDROID_KEY_ALIAS')
  requiredEnv('ANDROID_KEY_PASSWORD')
  const normalizedBase64 = requiredEnv('ANDROID_KEY_BASE64').replace(/\s/g, '')
  if (!normalizedBase64 || normalizedBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64)) {
    throw new Error('ANDROID_KEY_BASE64 不是有效的 Base64 内容')
  }
  const keystore = Buffer.from(normalizedBase64, 'base64')
  if (keystore.length === 0) throw new Error('ANDROID_KEY_BASE64 解码结果为空')

  const keystoreFile = path.join(androidRoot, 'upload-keystore.jks')
  writeFileSync(keystoreFile, keystore, { mode: 0o600 })
  const gradleSource = readFileSync(buildFile, 'utf8')
  writeFileSync(buildFile, configureGradleSigning(gradleSource), 'utf8')
  return { buildFile, keystoreFile }
}

if (require.main === module) {
  try {
    const result = configureAndroidSigning(process.argv[2])
    console.log(`[OK] Android 发布签名已配置：${result.buildFile}`)
  } catch (error) {
    console.error(`[错误] Android 签名配置失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

module.exports = { configureAndroidSigning, configureGradleSigning }
