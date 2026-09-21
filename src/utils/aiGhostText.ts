// Tab 半自动续写（幽灵建议）的纯规则：触发判定、上下文长度与去重清洗。
// 与 ProseMirror 渲染、网络请求解耦，便于单测。

/** 停止输入多久后请求续写建议。 */
export const GHOST_TEXT_IDLE_DELAY_MS = 800
/** 单条建议的最大字符数，超出时回退到最近的断句位置。 */
export const GHOST_TEXT_MAX_CHARS = 240
/** 送给模型的前文最大字符数。 */
export const GHOST_TEXT_CONTEXT_CHARS = 4000
/** 接受建议后短暂抑制再次请求，避免连续触发。 */
export const GHOST_TEXT_ACCEPT_COOLDOWN_MS = 1200

const SENTENCE_BOUNDARY = /[\s，。！？；：、,.!?;:）)】」”’]/

// 光标前必须是空白、标点或中日韩文字才触发：拉丁文本停在词中时不打扰输入。
const GHOST_TEXT_TRIGGER_RE = /(?:[\s\p{P}]|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af])$/u

const EMPTY_ANSWER_RE = /^(?:none|n\/a|nil|null|无|没有)$/i

/**
 * 判断光标前文是否适合触发续写。
 * 需要存在实际内容，且结尾是空白、标点或中日韩文字。
 */
export function shouldRequestGhostText(textBefore: string): boolean {
  if (!textBefore.trim()) return false
  return GHOST_TEXT_TRIGGER_RE.test(textBefore)
}

/**
 * 截取光标前文作为续写上下文：只保留末尾若干字符，避免整篇文档进入请求。
 */
export function takeGhostTextContext(textBefore: string, maxChars = GHOST_TEXT_CONTEXT_CHARS): string {
  return textBefore.length > maxChars ? textBefore.slice(-maxChars) : textBefore
}

function stripFence(text: string): string {
  const match = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/)
  return match ? match[1].trim() : text
}

function stripWrappingQuotes(text: string): string {
  const match = text.match(/^(["'“”‘’])([\s\S]*)\1$/)
  return match ? match[2].trim() : text
}

/**
 * 去掉模型复述的前文尾部。返回去掉后的文本，找不到重叠时原样返回。
 */
function stripRepeatedPrefix(text: string, context: string): string {
  const limit = Math.min(80, text.length, context.length)
  for (let length = limit; length >= 8; length -= 1) {
    if (context.endsWith(text.slice(0, length))) return text.slice(length).trim()
  }
  return text
}

function truncateAtBoundary(text: string, maxChars: number): string {
  const cut = text.slice(0, maxChars)
  for (let index = cut.length - 1; index >= maxChars / 2; index -= 1) {
    if (SENTENCE_BOUNDARY.test(cut[index])) return cut.slice(0, index + 1).trim()
  }
  return cut.trim()
}

/**
 * 清洗模型返回的续写结果。返回 null 表示不应展示建议。
 * 幽灵建议是行内文本，因此只保留第一行非空内容。
 */
export function sanitizeAiCompletion(
  raw: string,
  context: string,
  maxChars = GHOST_TEXT_MAX_CHARS,
): string | null {
  let text = stripFence(raw.replace(/\r\n?/g, '\n').trim())
  if (!text || EMPTY_ANSWER_RE.test(text)) return null

  text = text.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  if (!text) return null

  text = stripWrappingQuotes(text)
  if (!text || EMPTY_ANSWER_RE.test(text)) return null

  text = stripRepeatedPrefix(text, context)
  if (!text) return null

  if (text.length > maxChars) text = truncateAtBoundary(text, maxChars)
  return text || null
}
