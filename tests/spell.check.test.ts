import { describe, expect, it } from 'vitest'
import { DICTS } from '../src/i18n/locales'
import {
  analyzeWriting,
  applySpellIssue,
  applySpellIssues,
  segmentChineseWords,
} from '../src/utils/spellCheck'

describe('spell check writing analysis', () => {
  it('segments Chinese and reports mixed-language quality issues', () => {
    const analysis = analyzeWriting('\u6211\u559c\u6b22\u559c\u6b22\u5199\u4f5c\uff0c\u6309\u6b65\u5c31\u73ed\u3002This is teh teh draft.')

    expect(analysis.chineseWordCount).toBeGreaterThan(3)
    expect(analysis.englishWordCount).toBe(5)
    expect(analysis.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'zh-typo',
        original: '\u6309\u6b65\u5c31\u73ed',
        replacement: '\u6309\u90e8\u5c31\u73ed',
      }),
      expect.objectContaining({
        kind: 'en-spelling',
        original: 'teh',
        replacement: 'the',
      }),
      expect.objectContaining({ kind: 'duplicate-word', replacement: '' }),
    ]))
    expect(analysis.issues.filter((issue) => issue.kind === 'duplicate-word')).toHaveLength(2)
  })

  it('ignores Markdown code, link targets, URLs, and HTML tags', () => {
    const source = [
      '`teh \u6309\u6b65\u5c31\u73ed`',
      '[link](https://teh.example.com/\u6309\u6b65\u5c31\u73ed)',
      '<span data-name="teh">correct content</span>',
      '```text',
      'recieve \u518d\u63a5\u518d\u52b1',
      '```',
    ].join('\n')

    expect(analyzeWriting(source).issues).toEqual([])
  })

  it('applies individual and batch corrections without shifting offsets', () => {
    const source = '\u6309\u6b65\u5c31\u73ed\uff0cwe recieve teh.'
    const analysis = analyzeWriting(source)

    expect(applySpellIssues(source, analysis.issues)).toBe('\u6309\u90e8\u5c31\u73ed\uff0cwe receive the.')

    const duplicateSource = 'the the draft'
    const duplicate = analyzeWriting(duplicateSource).issues.find(
      (issue) => issue.kind === 'duplicate-word',
    )
    expect(duplicate).toBeDefined()
    expect(applySpellIssue(duplicateSource, duplicate!)).toBe('the draft')
  })

  it('collapses repeated Chinese punctuation', () => {
    const source = '\u68c0\u67e5\u5b8c\u6210\uff01\uff01\uff01'
    const analysis = analyzeWriting(source)

    expect(analysis.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'duplicate-punctuation',
        original: '\uff01\uff01\uff01',
        replacement: '\uff01',
      }),
    ]))
    expect(applySpellIssues(source, analysis.issues)).toBe('\u68c0\u67e5\u5b8c\u6210\uff01')
  })

  it('preserves common English casing in suggestions', () => {
    const issues = analyzeWriting('Teh TEH teh').issues.filter(
      (issue) => issue.kind === 'en-spelling',
    )

    expect(issues.map((issue) => issue.replacement)).toEqual(['The', 'THE', 'the'])
  })

  it('provides spell-check translations for both interface languages', () => {
    expect(DICTS['zh-CN']['spell.title']).toBeTruthy()
    expect(DICTS.en['spell.title']).toBe('Writing quality check')
    expect(DICTS['zh-CN']['settings.spellCheck.hint']).toBeTruthy()
    expect(DICTS.en['settings.spellCheck.hint']).toBeTruthy()
  })

  it('exposes Chinese word segments with source offsets', () => {
    expect(segmentChineseWords('\u5f00\u59cb\u5199\u4f5c')).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '\u5199\u4f5c', index: 2 }),
    ]))
  })
})
