import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}

export function Modal({ title, children, onClose, wide = false }: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()

  useEffect(() => {
    const layer = layerRef.current
    const dialog = dialogRef.current
    if (!layer || !dialog) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = layer.parentElement ? Array.from(layer.parentElement.children).filter((item) => item !== layer) : []
    const previousStates = siblings.map((item) => ({
      item: item as HTMLElement,
      inert: (item as HTMLElement).inert,
      ariaHidden: item.getAttribute('aria-hidden'),
    }))
    previousStates.forEach(({ item }) => {
      item.inert = true
      item.setAttribute('aria-hidden', 'true')
    })

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((item) => !item.hidden)
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus()

    const containFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (focusable()[0] ?? dialog).focus()
    }
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('focusin', containFocus)
      previousStates.forEach(({ item, inert, ariaHidden }) => {
        item.inert = inert
        if (ariaHidden === null) item.removeAttribute('aria-hidden')
        else item.setAttribute('aria-hidden', ariaHidden)
      })
      previouslyFocused?.focus()
    }
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((item) => !item.hidden)
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return (
    <div ref={layerRef} className="modal-layer" role="presentation" onKeyDown={handleKeyDown} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi"><X /></button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  )
}
