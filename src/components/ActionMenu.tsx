import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface ActionMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [open])

  return <details ref={rootRef} className="action-menu" open={open} onClick={(event) => event.stopPropagation()}>
    <summary role="button" className="action-menu__trigger" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.preventDefault(); setOpen((current) => !current) }}><MoreHorizontal /></summary>
    {open ? <div className="action-menu__panel" role="menu">{items.map((item) => <button key={item.label} type="button" role="menuitem" className={item.danger ? 'action-menu__danger' : undefined} disabled={item.disabled} onClick={() => {
      setOpen(false)
      item.onSelect()
    }}>{item.label}</button>)}</div> : null}
  </details>
}
