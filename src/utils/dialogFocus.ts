export function trapDialogTab(event: KeyboardEvent, dialog: HTMLElement) {
  if (event.key !== 'Tab' || event.defaultPrevented) return
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, a[href], [tabindex]',
  )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const active = document.activeElement
  if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target.focus()
  }
}
