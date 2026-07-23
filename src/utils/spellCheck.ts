export type SpellIssueKind =
  | 'zh-typo'
  | 'en-spelling'
  | 'duplicate-word'
  | 'duplicate-punctuation'

export interface SpellIssue {
  id: string
  kind: SpellIssueKind
  from: number
  to: number
  original: string
  replacement: string
  line: number
  column: number
}

export interface WritingAnalysis {
  issues: SpellIssue[]
  chineseWordCount: number
  englishWordCount: number
}

interface WordToken {
  text: string
  normalized: string
  index: number
  end: number
}

interface SegmentPart {
  segment: string
  index: number
  isWordLike?: boolean
}

interface SegmenterLike {
  segment(input: string): Iterable<SegmentPart>
}

type SegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity: 'word' },
) => SegmenterLike

const CHINESE_TYPOS: Readonly<Record<string, string>> = {
  '\u6309\u6b65\u5c31\u73ed': '\u6309\u90e8\u5c31\u73ed',
  '\u518d\u63a5\u518d\u52b1': '\u518d\u63a5\u518d\u5389',
  '\u4e00\u6101\u83ab\u5c55': '\u4e00\u7b79\u83ab\u5c55',
  '\u8feb\u4e0d\u6025\u5f85': '\u8feb\u4e0d\u53ca\u5f85',
  '\u8d70\u5934\u65e0\u8def': '\u8d70\u6295\u65e0\u8def',
  '\u76f8\u5f62\u89c1\u62d9': '\u76f8\u5f62\u89c1\u7ecc',
  '\u7518\u8d25\u4e0b\u98ce': '\u7518\u62dc\u4e0b\u98ce',
  '\u9ed8\u5b88\u6210\u89c4': '\u58a8\u5b88\u6210\u89c4',
  '\u8c08\u7b11\u98ce\u58f0': '\u8c08\u7b11\u98ce\u751f',
  '\u540d\u5217\u524d\u77db': '\u540d\u5217\u524d\u8305',
  '\u4e16\u5916\u6843\u56ed': '\u4e16\u5916\u6843\u6e90',
  '\u4e00\u5982\u7ee7\u5f80': '\u4e00\u5982\u65e2\u5f80',
  '\u86db\u4e1d\u8682\u8ff9': '\u86db\u4e1d\u9a6c\u8ff9',
  '\u9b3c\u9b3c\u5d07\u5d07': '\u9b3c\u9b3c\u795f\u795f',
  '\u6709\u6301\u65e0\u6050': '\u6709\u6043\u65e0\u6050',
  '\u65e2\u5f80\u4e0d\u7a76': '\u65e2\u5f80\u4e0d\u548e',
}

const ENGLISH_TYPOS: Readonly<Record<string, string>> = {
  teh: 'the',
  recieve: 'receive',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  adress: 'address',
  wierd: 'weird',
  untill: 'until',
  becuase: 'because',
  enviroment: 'environment',
  writting: 'writing',
  langauge: 'language',
  sucess: 'success',
  responce: 'response',
  dependancy: 'dependency',
  maintainance: 'maintenance',
  goverment: 'government',
  acheive: 'achieve',
}

const HAN_CHARACTER = /\p{Script=Han}/u
const ENGLISH_WORD = /[A-Za-z]+(?:['?][A-Za-z]+)*/g

function maskValue(value: string): string {
  return value.replace(/[^\r\n]/g, ' ')
}

function maskMarkdown(text: string): string {
  return text
    .replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, maskValue)
    .replace(/`[^`\r\n]*`/g, maskValue)
    .replace(/(\]\()([^)\r\n]+)(\))/g, (_, open: string, target: string, close: string) => (
      `${open}${maskValue(target)}${close}`
    ))
    .replace(/https?:\/\/[^\s<>)]+/g, maskValue)
    .replace(/<[^>\r\n]+>/g, maskValue)
}

function getPosition(text: string, index: number): Pick<SpellIssue, 'line' | 'column'> {
  const before = text.slice(0, index)
  const lines = before.split(/\r?\n/)
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

function makeIssue(
  text: string,
  kind: SpellIssueKind,
  from: number,
  to: number,
  replacement: string,
): SpellIssue {
  const original = text.slice(from, to)
  const { line, column } = getPosition(text, from)
  return {
    id: `${kind}:${from}:${to}:${replacement}`,
    kind,
    from,
    to,
    original,
    replacement,
    line,
    column,
  }
}

function preserveEnglishCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase()
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }
  return replacement
}

function toEnglishTokens(text: string): WordToken[] {
  return Array.from(text.matchAll(ENGLISH_WORD), (match) => ({
    text: match[0],
    normalized: match[0].toLocaleLowerCase('en-US'),
    index: match.index,
    end: match.index + match[0].length,
  }))
}

export function segmentChineseWords(text: string): Array<{ text: string; index: number }> {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter
  if (Segmenter) {
    return Array.from(new Segmenter('zh-CN', { granularity: 'word' }).segment(text))
      .filter((part) => part.isWordLike && HAN_CHARACTER.test(part.segment))
      .map((part) => ({ text: part.segment, index: part.index }))
  }

  return Array.from(text.matchAll(/\p{Script=Han}+/gu), (match) => ({
    text: match[0],
    index: match.index,
  }))
}

function addDuplicateWordIssues(
  source: string,
  masked: string,
  tokens: WordToken[],
  issues: SpellIssue[],
): void {
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1]
    const current = tokens[index]
    const gap = masked.slice(previous.end, current.index)
    if (previous.normalized === current.normalized && /^[ \t]*$/.test(gap)) {
      issues.push(makeIssue(source, 'duplicate-word', previous.end, current.end, ''))
    }
  }
}

function issuePriority(issue: SpellIssue): number {
  return issue.kind === 'duplicate-word' ? 0 : 1
}

function overlaps(left: SpellIssue, right: SpellIssue): boolean {
  return left.from < right.to && right.from < left.to
}

export function analyzeWriting(text: string): WritingAnalysis {
  const masked = maskMarkdown(text)
  const issues: SpellIssue[] = []
  const chineseSegments = segmentChineseWords(masked)
  const chineseTokens = chineseSegments.map((part) => ({
    text: part.text,
    normalized: part.text,
    index: part.index,
    end: part.index + part.text.length,
  }))
  const englishTokens = toEnglishTokens(masked)

  for (const [typo, replacement] of Object.entries(CHINESE_TYPOS)) {
    let from = masked.indexOf(typo)
    while (from >= 0) {
      issues.push(makeIssue(text, 'zh-typo', from, from + typo.length, replacement))
      from = masked.indexOf(typo, from + typo.length)
    }
  }

  for (const token of englishTokens) {
    const replacement = ENGLISH_TYPOS[token.normalized]
    if (replacement) {
      issues.push(makeIssue(
        text,
        'en-spelling',
        token.index,
        token.end,
        preserveEnglishCase(token.text, replacement),
      ))
    }
  }

  addDuplicateWordIssues(text, masked, chineseTokens, issues)
  addDuplicateWordIssues(text, masked, englishTokens, issues)

  for (const match of masked.matchAll(/([\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])\1+/g)) {
    issues.push(makeIssue(text, 'duplicate-punctuation', match.index, match.index + match[0].length, match[1]))
  }

  issues.sort((left, right) => left.from - right.from || issuePriority(left) - issuePriority(right))
  return {
    issues,
    chineseWordCount: chineseSegments.length,
    englishWordCount: englishTokens.length,
  }
}

export function applySpellIssue(text: string, issue: SpellIssue): string {
  if (text.slice(issue.from, issue.to) !== issue.original) return text
  return text.slice(0, issue.from) + issue.replacement + text.slice(issue.to)
}

export function applySpellIssues(text: string, issues: SpellIssue[]): string {
  const selected: SpellIssue[] = []
  const ordered = [...issues].sort((left, right) => (
    left.from - right.from
    || issuePriority(left) - issuePriority(right)
    || right.to - left.to
  ))

  for (const issue of ordered) {
    if (text.slice(issue.from, issue.to) !== issue.original) continue
    if (!selected.some((selectedIssue) => overlaps(selectedIssue, issue))) {
      selected.push(issue)
    }
  }

  return selected
    .sort((left, right) => right.from - left.from)
    .reduce((result, issue) => applySpellIssue(result, issue), text)
}
