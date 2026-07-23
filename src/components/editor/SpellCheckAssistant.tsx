import { useEffect, useMemo, useState } from 'react'
import type { SpellIssue, SpellIssueKind, WritingAnalysis } from '../../utils/spellCheck'
import { analyzeWriting, applySpellIssue, applySpellIssues } from '../../utils/spellCheck'

type Translator = (key: string, params?: Record<string, string | number>) => string

interface SpellCheckOptions {
  content: string
  enabled: boolean
  onChange: (content: string) => void
}

export interface SpellCheckController {
  panelOpen: boolean
  analysis: WritingAnalysis
  openPanel: () => void
  closePanel: () => void
  replaceIssue: (issue: SpellIssue) => void
  replaceAll: () => void
}

const EMPTY_ANALYSIS: WritingAnalysis = {
  issues: [],
  chineseWordCount: 0,
  englishWordCount: 0,
}

const ISSUE_LABEL_KEYS: Record<SpellIssueKind, string> = {
  'zh-typo': 'spell.issue.zhTypo',
  'en-spelling': 'spell.issue.enSpelling',
  'duplicate-word': 'spell.issue.duplicateWord',
  'duplicate-punctuation': 'spell.issue.duplicatePunctuation',
}

export function useSpellCheckAssistant({ content, enabled, onChange }: SpellCheckOptions): SpellCheckController {
  const [panelOpen, setPanelOpen] = useState(false)
  const analysis = useMemo(
    () => (panelOpen ? analyzeWriting(content) : EMPTY_ANALYSIS),
    [content, panelOpen],
  )

  useEffect(() => {
    if (!enabled) setPanelOpen(false)
  }, [enabled])

  return {
    panelOpen,
    analysis,
    openPanel: () => setPanelOpen(true),
    closePanel: () => setPanelOpen(false),
    replaceIssue: (issue) => onChange(applySpellIssue(content, issue)),
    replaceAll: () => onChange(applySpellIssues(content, analysis.issues)),
  }
}

interface SpellCheckButtonProps {
  spellCheck: SpellCheckController
  t: Translator
  onBeforeOpen: () => void
}

export function SpellCheckButton({ spellCheck, t, onBeforeOpen }: SpellCheckButtonProps) {
  return (
    <button
      type="button"
      className={`tb-btn spell-check-trigger ${spellCheck.panelOpen ? 'active' : ''}`}
      title={t('toolbar.spellCheck')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (spellCheck.panelOpen) {
          spellCheck.closePanel()
          return
        }
        onBeforeOpen()
        spellCheck.openPanel()
      }}
    >
      {'Aa\u2713'}
    </button>
  )
}

interface SpellCheckPanelProps {
  spellCheck: SpellCheckController
  t: Translator
}

export function SpellCheckPanel({ spellCheck, t }: SpellCheckPanelProps) {
  useEffect(() => {
    if (!spellCheck.panelOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') spellCheck.closePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [spellCheck])

  if (!spellCheck.panelOpen) return null

  const { analysis } = spellCheck
  return (
    <div className="ai-assistant-panel-overlay" onMouseDown={(event) => event.stopPropagation()}>
      <div className="ai-assistant-panel spell-check-panel" role="dialog" aria-modal="true" aria-label={t('spell.title')}>
        <div className="ai-assistant-panel-header">
          <div className="ai-assistant-panel-title">{t('spell.title')}</div>
          <button type="button" className="ai-assistant-close" onClick={spellCheck.closePanel} title={t('spell.close')}>&times;</button>
        </div>

        <div className="spell-check-summary">
          <div><strong>{analysis.chineseWordCount}</strong><span>{t('spell.stat.chinese')}</span></div>
          <div><strong>{analysis.englishWordCount}</strong><span>{t('spell.stat.english')}</span></div>
          <div><strong>{analysis.issues.length}</strong><span>{t('spell.stat.issues')}</span></div>
        </div>
        <div className="spell-check-native-hint">{t('spell.nativeHint')}</div>

        {analysis.issues.length === 0 ? (
          <div className="spell-check-empty">{t('spell.noIssues')}</div>
        ) : (
          <div className="spell-check-list">
            {analysis.issues.map((issue) => (
              <div className="spell-check-item" key={issue.id}>
                <div className="spell-check-item-header">
                  <span className="spell-check-kind">{t(ISSUE_LABEL_KEYS[issue.kind])}</span>
                  <span className="spell-check-location">{t('spell.location', { line: issue.line, column: issue.column })}</span>
                </div>
                <div className="spell-check-correction">
                  <code>{issue.original.trim()}</code>
                  <span aria-hidden="true">&rarr;</span>
                  <code>{issue.replacement || t('spell.remove')}</code>
                </div>
                <button type="button" className="link-dialog-btn" onClick={() => spellCheck.replaceIssue(issue)}>
                  {t('spell.replace')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="ai-assistant-panel-actions">
          <button
            type="button"
            className="link-dialog-btn ok"
            disabled={analysis.issues.length === 0}
            onClick={spellCheck.replaceAll}
          >
            {t('spell.replaceAll')}
          </button>
          <button type="button" className="link-dialog-btn cancel" onClick={spellCheck.closePanel}>{t('spell.close')}</button>
        </div>
      </div>
    </div>
  )
}
