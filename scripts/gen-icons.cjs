/**
 * 生成 FkeMark 应用图标源文件
 * 使用 Node.js 内置 zlib 模块创建一个 512x512 的 PNG 文件
 * 然后通过 Tauri CLI 生成所有平台所需的图标格式
 */

const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

// PNG CRC32 计算
const crc32Table = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1)
      } else {
        c = c >>> 1
      }
      table[n] = c >>> 0
    }
  }
  return table
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lengthBuf = Buffer.alloc(4)
  lengthBuf.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf])
}

/**
 * 创建一个 PNG 图片
 * @param {number} width 图片宽度
 * @param {number} height 图片高度
 * @param {(x: number, y: number) => [number, number, number, number]} colorFn 颜色函数，返回 [R, G, B, A]
 */
function createPNG(width, height, colorFn) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 6  // color type: RGBA
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace
  const ihdr = createChunk('IHDR', ihdrData)

  // 像素数据（每行前面有一个 filter 字节）
  const rowSize = 1 + width * 4
  const rawData = Buffer.alloc(height * rowSize)
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize
    rawData[rowOffset] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorFn(x, y)
      const px = rowOffset + 1 + x * 4
      rawData[px] = r
      rawData[px + 1] = g
      rawData[px + 2] = b
      rawData[px + 3] = a
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 })
  const idat = createChunk('IDAT', compressed)

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

// === 生成 FkeMark 图标 ===
// 设计：深色圆角方块背景 + 白色 "F" 字母

const SIZE = 512
const CENTER = SIZE / 2
const RADIUS = SIZE * 0.42 // 圆角半径

// 深色背景 #2D3748 (45, 55, 72)
// 浅色前景 #CBD5E0 (203, 213, 224)

function iconColor(x, y) {
  // 圆角矩形判定
  const dx = Math.abs(x - CENTER)
  const dy = Math.abs(y - CENTER)
  const margin = SIZE * 0.05

  // 检查是否在圆角矩形内
  const rectHalf = RADIUS
  const cornerRadius = SIZE * 0.12

  let inRect = false
  if (dx <= rectHalf && dy <= rectHalf) {
    // 在矩形范围内，检查圆角
    const cornerDx = Math.max(0, dx - (rectHalf - cornerRadius))
    const cornerDy = Math.max(0, dy - (rectHalf - cornerRadius))
    const cornerDist = Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy)
    if (cornerDist <= cornerRadius) {
      inRect = true
    }
  }

  if (!inRect) {
    return [0, 0, 0, 0] // 透明
  }

  // 背景：深色渐变
  const gradient = (y / SIZE) * 0.3 + 0.7
  const bgR = Math.round(45 * gradient)
  const bgG = Math.round(55 * gradient)
  const bgB = Math.round(72 * gradient)

  // 绘制 "F" 字母
  const letterTop = SIZE * 0.28
  const letterBottom = SIZE * 0.72
  const letterLeft = SIZE * 0.35
  const letterRight = SIZE * 0.65
  const stroke = SIZE * 0.06

  // 垂直线 (F 的左侧)
  if (x >= letterLeft && x <= letterLeft + stroke &&
      y >= letterTop && y <= letterBottom) {
    return [230, 235, 240, 255] // 白色
  }

  // 上横线
  if (y >= letterTop && y <= letterTop + stroke &&
      x >= letterLeft && x <= letterRight) {
    return [230, 235, 240, 255]
  }

  // 中横线
  const midY = (letterTop + letterBottom) / 2
  if (y >= midY - stroke / 2 && y <= midY + stroke / 2 &&
      x >= letterLeft && x <= letterLeft + (letterRight - letterLeft) * 0.7) {
    return [230, 235, 240, 255]
  }

  return [bgR, bgG, bgB, 255]
}

// 创建图标目录
const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons')
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// 生成 512x512 源图标
const sourceIcon = createPNG(SIZE, SIZE, iconColor)
const sourcePath = path.join(iconsDir, 'icon.png')
fs.writeFileSync(sourcePath, sourceIcon)
console.log(`✅ 源图标已生成: ${sourcePath} (${sourceIcon.length} bytes)`)

console.log('\n现在运行以下命令生成所有平台图标:')
console.log('npx tauri icon src-tauri/icons/icon.png')
