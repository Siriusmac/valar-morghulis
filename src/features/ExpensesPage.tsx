import { Edit3, LockKeyhole, ReceiptText, Search, Share2, Trash2 } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { formatDate, formatMoney } from '../lib/format'
import { users } from '../lib/seed'
import type { AppData, Expense, User } from '../types'

interface Props {
  data: AppData
  user: User
  onEdit: (expense: Expense) => void
  onDelete: (id: string) => void
}

export function ExpensesPage({ data, user, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<'all' | 'shared' | 'personal'>('all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const visible = data.expenses
    .filter((item) => item.shared || item.authorId === user.id)
    .filter((item) => filter === 'all' || (filter === 'shared' ? item.shared : !item.shared))
    .filter((item) => {
      const category = data.categories.find((categoryItem) => categoryItem.id === item.categoryId)?.name ?? ''
      const beneficiary = data.beneficiaries.find((beneficiaryItem) => beneficiaryItem.id === item.beneficiaryId)?.name ?? ''
      return `${item.description} ${category} ${beneficiary}`.toLowerCase().includes(deferredQuery)
    })
    .toSorted((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="page">
      <div className="page-heading"><div><h1>Spese</h1><p>Le tue spese personali e quelle della famiglia.</p></div></div>
      <div className="list-toolbar">
        <div className="tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Tutte</button>
          <button className={filter === 'shared' ? 'active' : ''} onClick={() => setFilter('shared')}>Condivise</button>
          <button className={filter === 'personal' ? 'active' : ''} onClick={() => setFilter('personal')}>Personali</button>
        </div>
        <label className="search-field"><Search /><input placeholder="Cerca una spesa" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
      <section className="table-panel">
        {visible.length ? visible.map((expense) => {
          const category = data.categories.find((item) => item.id === expense.categoryId)
          const beneficiary = data.beneficiaries.find((item) => item.id === expense.beneficiaryId)
          const payer = users.find((item) => item.id === expense.payerId)
          const canEdit = expense.authorId === user.id
          return (
            <article className="expense-row expense-row--full" key={expense.id}>
              <span className="expense-row__icon" style={{ color: category?.color }}><ReceiptText /></span>
              <div className="expense-row__name"><strong>{expense.description}</strong><small>{category?.name} · {beneficiary?.name}</small></div>
              <span className={`scope-label ${expense.shared ? 'scope-label--shared' : ''}`}>{expense.shared ? <Share2 /> : <LockKeyhole />}{expense.shared ? 'Condivisa' : 'Personale'}</span>
              <div className="expense-row__payer"><small>Pagato da</small><span>{payer?.name}</span></div>
              <time>{formatDate(expense.date)}</time>
              <strong className="expense-row__amount">{formatMoney(expense.amount)}</strong>
              <div className="row-actions">
                <button className="icon-button" disabled={!canEdit} title={canEdit ? 'Modifica' : 'Solo l’autore può modificare'} onClick={() => onEdit(expense)}><Edit3 /></button>
                <button className="icon-button icon-button--danger" disabled={!canEdit} title={canEdit ? 'Elimina' : 'Solo l’autore può eliminare'} onClick={() => canEdit && confirm('Eliminare questa spesa?') && onDelete(expense.id)}><Trash2 /></button>
              </div>
            </article>
          )
        }) : <div className="empty-state"><ReceiptText /><h3>Nessuna spesa trovata</h3><p>Prova a modificare i filtri o aggiungi una nuova spesa.</p></div>}
      </section>
    </div>
  )
}
