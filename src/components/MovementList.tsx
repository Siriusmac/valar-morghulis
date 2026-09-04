import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Edit3, LockKeyhole, Share2, Trash2 } from 'lucide-react'
import { movementAllocations, movementHasSharedPortion, movementTagIds, sharedMovementAmount } from '../lib/calculations'
import { debtCompensationAccountId, debtCompensationAccountLabel } from '../lib/commissioned'
import { formatDate, formatMoney } from '../lib/format'
import type { AppData, Movement, Transfer, User } from '../types'

interface Props {
  data: AppData
  movements: Movement[]
  user?: User
  onEdit?: (movement: Movement) => void
  onDelete?: (id: string) => void
  onEditTransfer?: (transfer: Transfer) => void
  onDeleteTransfer?: (id: string) => void
  compact?: boolean
  sharedAmountsOnly?: boolean
  transfers?: Transfer[]
  accountId?: string
}

export function MovementList({ data, movements, user, onEdit, onDelete, onEditTransfer, onDeleteTransfer, compact = false, sharedAmountsOnly = false, transfers = [], accountId }: Props) {
  const hasActions = Boolean((onEdit && onDelete) || (onEditTransfer && onDeleteTransfer))
  const entries = [
    ...movements.map((movement) => ({ kind: 'movement' as const, date: movement.date, movement })),
    ...transfers.map((transfer) => ({ kind: 'transfer' as const, date: transfer.date, transfer })),
  ].toSorted((a, b) => b.date.localeCompare(a.date))
  if (!entries.length) return <div className="empty-state"><ArrowUpRight /><h3>Nessun movimento</h3><p>Non ci sono dati per questa selezione.</p></div>
  return <div className={`movement-list ${compact ? 'movement-list--compact' : ''} ${hasActions ? 'movement-list--editable' : ''}`}>
    {entries.map((entry) => {
      if (entry.kind === 'transfer') {
        const transfer = entry.transfer
        const from = data.accounts.find((item) => item.id === transfer.fromAccountId)
        const to = data.accounts.find((item) => item.id === transfer.toAccountId)
        const isOutgoing = transfer.fromAccountId === accountId
        const otherAccount = isOutgoing ? to : from
        const canEdit = user?.id === transfer.authorId
        return <article className="movement-row movement-row--account-transfer" key={`transfer-${transfer.id}`}>
          <span className="movement-row__icon movement-row__icon--transfer"><ArrowLeftRight /></span>
          <div className="movement-row__name"><strong>{transfer.description}</strong><small>{isOutgoing ? `Verso ${otherAccount?.name ?? 'conto non visibile'}` : `Da ${otherAccount?.name ?? 'conto non visibile'}`}{transfer.feeAmount ? ` · spese ${formatMoney(transfer.feeAmount)}` : ''}</small></div>
          <div className="movement-row__meta"><small>Dal conto</small><span>{from?.name ?? 'Conto non visibile'}</span></div>
          <div className="movement-row__meta"><small>Al conto</small><span>{to?.name ?? 'Conto non visibile'}</span></div>
          <span className="scope-label"><ArrowLeftRight />Giro fondi</span>
          <time>{formatDate(transfer.date)}</time>
          <strong className="movement-row__amount movement-row__amount--transfer">{isOutgoing ? '−' : '+'}{formatMoney(transfer.amount)}</strong>
          {onEditTransfer && onDeleteTransfer ? <div className="row-actions"><button className="icon-button" disabled={!canEdit} title={canEdit ? 'Modifica giro fondi' : 'Solo l’autore può modificare'} aria-label={canEdit ? `Modifica ${transfer.description}` : `Non puoi modificare ${transfer.description}`} onClick={() => canEdit && onEditTransfer(transfer)}><Edit3 /></button><button className="icon-button icon-button--danger" disabled={!canEdit} title={canEdit ? 'Elimina giro fondi' : 'Solo l’autore può eliminare'} aria-label={canEdit ? `Elimina ${transfer.description}` : `Non puoi eliminare ${transfer.description}`} onClick={() => canEdit && confirm('Eliminare questo giro fondi? I saldi dei conti verranno aggiornati.') && onDeleteTransfer(transfer.id)}><Trash2 /></button></div> : null}
        </article>
      }
      const movement = entry.movement
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
