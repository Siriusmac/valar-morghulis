import { ArrowDownLeft, ArrowUpRight, Edit3, LockKeyhole, Share2, Trash2 } from 'lucide-react'
import { movementAllocations, movementHasSharedPortion, movementTagIds, sharedMovementAmount } from '../lib/calculations'
import { debtCompensationAccountId, debtCompensationAccountLabel } from '../lib/commissioned'
import { formatDate, formatMoney } from '../lib/format'
import type { AppData, Movement, User } from '../types'

interface Props {
  data: AppData
  movements: Movement[]
  user?: User
  onEdit?: (movement: Movement) => void
  onDelete?: (id: string) => void
  compact?: boolean
  sharedAmountsOnly?: boolean
}

export function MovementList({ data, movements, user, onEdit, onDelete, compact = false, sharedAmountsOnly = false }: Props) {
  if (!movements.length) return <div className="empty-state"><ArrowUpRight /><h3>Nessun movimento</h3><p>Non ci sono dati per questa selezione.</p></div>
  return <div className={`movement-list ${compact ? 'movement-list--compact' : ''}`}>
    {movements.map((movement) => {
      const category = data.categories.find((item) => item.id === movement.categoryId)
      const account = data.accounts.find((item) => item.id === movement.accountId)
      const accountName = movement.accountId === debtCompensationAccountId ? debtCompensationAccountLabel : account?.name
      const beneficiary = data.beneficiaries.find((item) => item.id === movement.beneficiaryId)
      const sender = data.senders.find((item) => item.id === movement.senderId)
      const counterparty = movement.type === 'income'
        ? sender?.name ?? 'Nessun mittente'
        : beneficiary?.name ?? 'Nessun beneficiario'
      const allocations = movementAllocations(movement)
      const tagNames = [...new Set([
        ...movementTagIds(movement),
        ...allocations.flatMap((allocation) => allocation.tagIds),
      ])]
        .map((tagId) => data.tags.find((item) => item.id === tagId)?.name)
        .filter((name): name is string => Boolean(name))
      const canEdit = user?.id === movement.authorId
      const hasSharedPortion = movementHasSharedPortion(data, movement)
      const isMixed = account?.scope !== 'family' && allocations.some((item) => item.shared) && allocations.some((item) => !item.shared)
      const displayedAmount = sharedAmountsOnly && account?.scope !== 'family' ? sharedMovementAmount(movement) : movement.amount
      return <article className="movement-row" key={movement.id}>
        <span className={`movement-row__icon movement-row__icon--${movement.type}`}>{movement.type === 'income' ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
        <div className="movement-row__name"><strong>{movement.description}</strong><small>{counterparty}{tagNames.length ? `${counterparty ? ' · ' : ''}${tagNames.map((name) => `#${name}`).join(' · ')}` : ''}{movement.comments ? `${counterparty || tagNames.length ? ' · ' : ''}${movement.comments}` : ''}</small></div>
        <div className="movement-row__meta"><small>Categoria</small><span><i style={{ background: category?.color }} />{movement.splits?.length ? `${allocations.length} categorie` : category?.name}</span></div>
        <div className="movement-row__meta"><small>Conto</small><span>{accountName}</span></div>
        <span className={`scope-label ${hasSharedPortion ? 'scope-label--shared' : ''}`}>{hasSharedPortion ? <Share2 /> : <LockKeyhole />}{isMixed ? 'Misto' : hasSharedPortion ? 'Condiviso' : 'Personale'}</span>
        <time>{formatDate(movement.date)}</time>
        <strong className={`movement-row__amount movement-row__amount--${movement.type}`} title={sharedAmountsOnly ? 'Quota condivisa del movimento' : undefined}>{movement.type === 'income' ? '+' : '−'}{formatMoney(displayedAmount)}</strong>
        {onEdit && onDelete ? <div className="row-actions"><button className="icon-button" disabled={!canEdit} title={canEdit ? 'Modifica' : 'Solo l’autore può modificare'} aria-label={canEdit ? `Modifica ${movement.description}` : `Non puoi modificare ${movement.description}`} onClick={() => canEdit && onEdit(movement)}><Edit3 /></button><button className="icon-button icon-button--danger" disabled={!canEdit} title={canEdit ? 'Elimina' : 'Solo l’autore può eliminare'} aria-label={canEdit ? `Elimina ${movement.description}` : `Non puoi eliminare ${movement.description}`} onClick={() => canEdit && confirm(movement.installmentPlanId && movement.installmentNumber === 1 ? 'Eliminare questo acquisto e tutte le rate collegate?' : 'Eliminare questo movimento?') && onDelete(movement.id)}><Trash2 /></button></div> : null}
      </article>
    })}
  </div>
}
