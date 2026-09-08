import { MoreHorizontal } from 'lucide-react'

export interface ActionMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  return <details className="action-menu" onClick={(event) => event.stopPropagation()}>
    <summary role="button" className="action-menu__trigger" aria-label={label} title={label}><MoreHorizontal /></summary>
    <div className="action-menu__panel" role="menu">{items.map((item) => <button key={item.label} type="button" role="menuitem" className={item.danger ? 'action-menu__danger' : undefined} disabled={item.disabled} onClick={(event) => {
      event.currentTarget.closest('details')?.removeAttribute('open')
      item.onSelect()
    }}>{item.label}</button>)}</div>
  </details>
}
