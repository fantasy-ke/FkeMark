import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { createPortal } from 'react-dom'
import { FilePlus2, Library, Pencil, Trash2, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { markdownToHtml } from '../../utils/markdown/engine'
import {
  INSERTABLE_SNIPPETS,
  expandSnippetVariables,
  loadCustomSnippets,
  saveCustomSnippets,
  type CustomSnippet,
} from '../../utils/snippets'

interface SnippetsMenuProps {
  editor: TiptapEditor | null
  docDir?: string | null
  closeWhen?: boolean
  onBeforeOpen?: () => void
}

interface SnippetDraft {
  id: string | null
  name: string
  content: string
}

function createSnippetId(): string {
  return `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function SnippetsMenu({ editor, docDir, closeWhen, onBeforeOpen }: SnippetsMenuProps) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SnippetDraft | null>(null)
  const [customSnippets, setCustomSnippets] = useState<CustomSnippet[]>(loadCustomSnippets)
  const [storageFailed, setStorageFailed] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (closeWhen) setOpen(false)
  }, [closeWhen])

  useEffect(() => {
    if (!open && !draft) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (draft) setDraft(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [draft, open])

  useEffect(() => {
    if (draft) nameInputRef.current?.focus()
  }, [draft])

  function toggleMenu() {
    if (!open) onBeforeOpen?.()
    setOpen((value) => !value)
  }

  function insertSnippet(content: string) {
    if (!editor) return
    const expanded = expandSnippetVariables(content, language)
    editor.chain().focus().insertContent(markdownToHtml(expanded, docDir)).run()
    setOpen(false)
  }

  function openEditor(snippet?: CustomSnippet) {
    setDraft(snippet
      ? { id: snippet.id, name: snippet.name, content: snippet.content }
      : { id: null, name: '', content: '' })
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    const content = draft.content.trim()
    if (!name || !content) return

    const next = draft.id
      ? customSnippets.map((snippet) => snippet.id === draft.id ? { ...snippet, name, content } : snippet)
      : [...customSnippets, { id: createSnippetId(), name, content }]
    setCustomSnippets(next)
    setStorageFailed(!saveCustomSnippets(next))
    setDraft(null)
  }

  function deleteSnippet(snippet: CustomSnippet) {
    if (!window.confirm(t('snippets.deleteConfirm', { name: snippet.name }))) return
    const next = customSnippets.filter((item) => item.id !== snippet.id)
    setCustomSnippets(next)
    setStorageFailed(!saveCustomSnippets(next))
  }

  return (
    <div className="snippets-menu">
      <button
        type="button"
        className={`tb-btn snippets-trigger ${open ? 'active' : ''}`.trim()}
        title={t('snippets.open')}
        aria-label={t('snippets.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleMenu}
      >
        <Library size={16} />
      </button>

      {open && (
        <section className="snippets-popover" role="menu" aria-label={t('snippets.title')}>
          <header className="snippets-header">
            <div>
              <strong>{t('snippets.title')}</strong>
              <span>{t('snippets.subtitle')}</span>
            </div>
            <button type="button" title={t('snippets.close')} onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>

          <div className="snippets-section-label">{t('snippets.builtIn')}</div>
          <div className="snippets-list">
            {INSERTABLE_SNIPPETS.map((snippet) => (
              <button
                type="button"
                className="snippet-item"
                key={snippet.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertSnippet(t(snippet.contentKey))}
              >
                <span className="snippet-item-icon" dangerouslySetInnerHTML={{ __html: snippet.icon }} />
                <span className="snippet-item-copy">
                  <strong>{t(snippet.titleKey)}</strong>
                  <span>{t(snippet.descKey)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="snippets-custom-heading">
            <span className="snippets-section-label">{t('snippets.custom')}</span>
            <button type="button" className="snippet-add-button" onClick={() => openEditor()}>
              <FilePlus2 size={14} />
              {t('snippets.add')}
            </button>
          </div>

          {storageFailed && <div className="snippets-warning">{t('snippets.storageFailed')}</div>}
          {customSnippets.length === 0 ? (
            <div className="snippets-empty">{t('snippets.empty')}</div>
          ) : (
            <div className="snippets-list snippets-custom-list">
              {customSnippets.map((snippet) => (
                <div className="snippet-custom-item" key={snippet.id}>
                  <button
                    type="button"
                    className="snippet-custom-insert"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertSnippet(snippet.content)}
                  >
                    <strong>{snippet.name}</strong>
                    <span>{snippet.content.replace(/\s+/g, ' ').slice(0, 72)}</span>
                  </button>
                  <div className="snippet-custom-actions">
                    <button type="button" title={t('snippets.edit')} onClick={() => openEditor(snippet)}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" title={t('snippets.delete')} onClick={() => deleteSnippet(snippet)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {draft && createPortal(
        <div className="snippet-dialog-overlay">
          <form className="snippet-dialog" role="dialog" aria-modal="true" aria-label={t(draft.id ? 'snippets.editTitle' : 'snippets.addTitle')} onSubmit={saveDraft}>
            <header className="snippet-dialog-header">
              <strong>{t(draft.id ? 'snippets.editTitle' : 'snippets.addTitle')}</strong>
              <button type="button" title={t('snippets.cancel')} onClick={() => setDraft(null)}>
                <X size={17} />
              </button>
            </header>
            <label>
              <span>{t('snippets.name')}</span>
              <input
                ref={nameInputRef}
                value={draft.name}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={t('snippets.namePlaceholder')}
              />
            </label>
            <label>
              <span>{t('snippets.content')}</span>
              <textarea
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder={t('snippets.contentPlaceholder')}
              />
            </label>
            <p className="snippet-dialog-hint">{t('snippets.variablesHint')}</p>
            <footer className="snippet-dialog-actions">
              <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>{t('snippets.cancel')}</button>
              <button type="submit" className="btn-primary" disabled={!draft.name.trim() || !draft.content.trim()}>{t('snippets.save')}</button>
            </footer>
          </form>
        </div>,
        document.body
      )}
    </div>
  )
}