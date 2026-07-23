import { useEffect, useMemo, useRef, useState } from 'react'
import { markdownToPreviewHtml } from '../../utils/markdown/engine'
import { splitMarkdownSlides } from '../../utils/markdown/presentation'
import { isAllowedExternalUrl, openExternalUrl } from '../../utils/updater'

type Translate = (key: string, params?: Record<string, string | number>) => string

interface PresentationButtonProps {
  onStart: () => void
  t: Translate
}

interface PresentationModeProps {
  open: boolean
  content: string
  docDir?: string | null
  onClose: () => void
  t: Translate
}

export function PresentationButton({ onStart, t }: PresentationButtonProps) {
  return (
    <button
      className="tb-btn presentation-trigger"
      title={t('toolbar.presentation')}
      aria-label={t('toolbar.presentation')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onStart}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20l4-4 4 4M12 16v4" />
      </svg>
    </button>
  )
}

export function PresentationMode({ open, content, docDir, onClose, t }: PresentationModeProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const slides = useMemo(() => open ? splitMarkdownSlides(content) : [], [content, open])
  const [slideIndex, setSlideIndex] = useState(0)
  const pageCount = slides.length
  const currentIndex = pageCount ? Math.min(slideIndex, pageCount - 1) : 0
  const currentSlide = slides[currentIndex] ?? ''
  const slideHtml = useMemo(
    () => currentSlide ? markdownToPreviewHtml(currentSlide, docDir) : '',
    [currentSlide, docDir],
  )

  useEffect(() => {
    if (!open) return
    setSlideIndex(0)
    overlayRef.current?.focus()
  }, [content, open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isInteractive = target instanceof Element && Boolean(target.closest('button, a'))

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        setSlideIndex(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        setSlideIndex(Math.max(0, pageCount - 1))
        return
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault()
        setSlideIndex((index) => Math.max(0, index - 1))
        return
      }
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !isInteractive)) {
        event.preventDefault()
        setSlideIndex((index) => Math.min(Math.max(0, pageCount - 1), index + 1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, pageCount])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="presentation-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('presentation.title')}
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="presentation-header">
        <div>
          <div className="presentation-title">{t('presentation.title')}</div>
          <div className="presentation-hint">{t('presentation.hint')}</div>
        </div>
        <button className="presentation-close" onClick={onClose} title={t('presentation.close')} aria-label={t('presentation.close')}>
          &times;
        </button>
      </header>

      <div className="presentation-progress" aria-hidden="true">
        <span style={{ width: pageCount ? `${((currentIndex + 1) / pageCount) * 100}%` : '0%' }} />
      </div>

      <main className="presentation-stage">
        <section
          className="presentation-slide"
          aria-live="polite"
          onClickCapture={(event) => {
            const link = event.target instanceof Element
              ? event.target.closest<HTMLAnchorElement>('a[href]')
              : null
            const href = link?.getAttribute('href') || ''
            if (!isAllowedExternalUrl(href)) return
            event.preventDefault()
            void openExternalUrl(href)
          }}
        >
          {pageCount ? (
            <div
              className="editor-inner editor-preview-inner presentation-slide-content"
              dangerouslySetInnerHTML={{ __html: slideHtml }}
            />
          ) : (
            <div className="presentation-empty">{t('presentation.empty')}</div>
          )}
        </section>
      </main>

      <footer className="presentation-controls">
        <button
          className="presentation-nav"
          disabled={currentIndex === 0 || pageCount === 0}
          onClick={() => setSlideIndex((index) => Math.max(0, index - 1))}
        >
          <span aria-hidden="true">&larr;</span> {t('presentation.previous')}
        </button>
        <div className="presentation-page" aria-live="polite">
          {pageCount ? t('presentation.page', { current: currentIndex + 1, total: pageCount }) : t('presentation.pageEmpty')}
        </div>
        <button
          className="presentation-nav"
          disabled={pageCount === 0 || currentIndex >= pageCount - 1}
          onClick={() => setSlideIndex((index) => Math.min(Math.max(0, pageCount - 1), index + 1))}
        >
          {t('presentation.next')} <span aria-hidden="true">&rarr;</span>
        </button>
      </footer>
    </div>
  )
}
