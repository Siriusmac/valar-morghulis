import { ArrowDownLeft, ArrowUpRight, Edit3, LockKeyhole, Share2, Trash2 } from 'lucide-react'
import { formatDate, formatMoney } from '../lib/format'
import type { AppData, Movement, User } from '../types'

interface Props {
  data: AppData
  movements: Movement[]
  user?: User
  onEdit?: (movement: Movement) => void
  onDelete?: (id: string) => void
  compact?: boolean
}

export function MovementList({ data, movements, user, onEdit, onDelete, compact = false }: Props) {
  if (!movements.length) return <div className="empty-state"><ArrowUpRight /><h3>Nessun movimento</h3><p>Non ci sono dati per questa selezione.</p></div>
  return <div className={`movement-list ${compact ? 'movement-list--compact' : ''}`}>
    {movements.map((movement) => {
      const category = data.categories.find((item) => item.id === movement.categoryId)
      const account = data.accounts.find((item) => item.id === movement.accountId)
      const beneficiary = data.beneficiaries.find((item) => item.id === movement.beneficiaryId)
      const tag = data.tags.find((item) => item.id === movement.tagId)
      const canEdit = user?.id === movement.authorId
      return <article className="movement-row" key={movement.id}>
        <span className={`movement-row__icon movement-row__icon--${movement.type}`}>{movement.type === 'income' ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
        <div className="movement-row__name"><strong>{movement.description}</strong><small>{beneficiary?.name}{tag ? ` · #${tag.name}` : ''}</small></div>
        <div className="movement-row__meta"><small>Categoria</small><span><i style={{ background: category?.color }} />{category?.name}</span></div>
        <div className="movement-row__meta"><small>Conto</small><span>{account?.name}</span></div>
        <span className={`scope-label ${movement.shared || account?.scope === 'family' ? 'scope-label--shared' : ''}`}>{movement.shared || account?.scope === 'family' ? <Share2 /> : <LockKeyhole />}{movement.shared || account?.scope === 'family' ? 'Condiviso' : 'Personale'}</span>
        <time>{formatDate(movement.date)}</time>
        <strong className={`movement-row__amount movement-row__amount--${movement.type}`}>{movement.type === 'income' ? '+' : '−'}{formatMoney(movement.amount)}</strong>
        {onEdit && onDelete ? <div className="row-actions"><button className="icon-button" disabled={!canEdit} title={canEdit ? 'Modifica' : 'Solo l’autore può modificare'} onClick={() => canEdit && onEdit(movement)}><Edit3 /></button><button className="icon-button icon-button--danger" disabled={!canEdit} title={canEdit ? 'Elimina' : 'Solo l’autore può eliminare'} onClick={() => canEdit && confirm('Eliminare questo movimento?') && onDelete(movement.id)}><Trash2 /></button></div> : null}
      </article>
    })}
  </div>
}
