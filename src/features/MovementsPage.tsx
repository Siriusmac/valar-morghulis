import { ArrowLeftRight, CalendarDays, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { DonutChart } from '../components/DonutChart'
import { MovementList } from '../components/MovementList'
import { movementAllocations, movementHasSharedPortion, movementsForMonth, totalsByCategory, visibleMovements } from '../lib/calculations'
import { formatDate, formatMoney, formatMonthYear, selectableMonths, todayISO } from '../lib/format'
import type { AppData, Movement, Transfer, User } from '../types'

interface Props {
  data: AppData
  user: User
  onEdit: (movement: Movement) => void
  onDelete: (id: string) => void
}

export function MovementsPage({ data, user, onEdit, onDelete }: Props) {
  const [section, setSection] = useState<'expense' | 'income' | 'shared' | 'transfer'>('expense')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const visible = useMemo(() => visibleMovements(data, user.id), [data, user.id])
  const visibleAccountIds = useMemo(() => new Set(data.accounts
    .filter((account) => account.scope === 'family' || account.ownerId === user.id)
    .map((account) => account.id)), [data.accounts, user.id])
  const transfers = useMemo(() => data.transfers.filter((transfer) =>
    transfer.authorId === user.id || visibleAccountIds.has(transfer.fromAccountId) || visibleAccountIds.has(transfer.toAccountId)), [data.transfers, user.id, visibleAccountIds])
  const monthOptions = selectableMonths([...visible.map((movement) => movement.date), ...transfers.map((transfer) => transfer.date)], month)
  const monthly = movementsForMonth(visible, month)
  const shared = monthly.filter((item) => movementHasSharedPortion(data, item))
  const chartExpense = totalsByCategory(data, (section === 'shared' ? shared : monthly).filter((item) => item.type === 'expense'), section === 'shared')
  const chartIncome = totalsByCategory(data, (section === 'shared' ? shared : monthly).filter((item) => item.type === 'income'), section === 'shared')
  const list = monthly
    .filter((item) => section === 'shared' ? movementHasSharedPortion(data, item) : item.type === section)
    .filter((item) => {
      const category = movementAllocations(item).map((allocation) => data.categories.find((entry) => entry.id === allocation.categoryId)?.name ?? '').join(' ')
      const beneficiary = data.beneficiaries.find((entry) => entry.id === item.beneficiaryId)?.name ?? ''
      const sender = data.senders.find((entry) => entry.id === item.senderId)?.name ?? ''
      const missingCounterparty = item.type === 'income' && !item.senderId ? 'nessun mittente' : item.type === 'expense' && !item.beneficiaryId ? 'nessun beneficiario' : ''
      const tag = movementAllocations(item).flatMap((allocation) => allocation.tagIds)
        .map((tagId) => data.tags.find((entry) => entry.id === tagId)?.name ?? '').join(' ')
      return `${item.description} ${item.comments ?? ''} ${category} ${beneficiary} ${sender} ${missingCounterparty} ${tag}`.toLowerCase().includes(deferredQuery)
    }).toSorted((a, b) => b.date.localeCompare(a.date))
  const transferList = transfers
    .filter((transfer) => transfer.date.startsWith(month))
    .filter((transfer) => {
      const from = data.accounts.find((account) => account.id === transfer.fromAccountId)?.name ?? 'Conto non visibile'
      const to = data.accounts.find((account) => account.id === transfer.toAccountId)?.name ?? 'Conto non visibile'
      return `${transfer.description} ${from} ${to}`.toLowerCase().includes(deferredQuery)
    })
    .toSorted((a, b) => b.date.localeCompare(a.date))
  const resultCount = section === 'transfer' ? transferList.length : list.length

  return <div className="page movements-page">
    <div className="page-heading"><div><h1>Spese ed Entrate</h1><p>Analizza spese, entrate e giri fondi.</p></div></div>
    <div className="movement-toolbar">
      <div className="tabs movement-tabs"><button className={section === 'expense' ? 'active' : ''} onClick={() => setSection('expense')}>Spese</button><button className={section === 'income' ? 'active tab-income' : 'tab-income'} onClick={() => setSection('income')}>Entrate</button><button className={section === 'shared' ? 'active' : ''} onClick={() => setSection('shared')}>Condivise</button><button className={section === 'transfer' ? 'active tab-transfer' : 'tab-transfer'} onClick={() => setSection('transfer')}>Giri fondi</button></div>
      <label className="month-field"><CalendarDays /><select aria-label="Mese" value={month} onChange={(event) => setMonth(event.target.value)}>{monthOptions.map((option) => <option key={option} value={option}>{formatMonthYear(option)}</option>)}</select></label>
    </div>
    {section === 'transfer'
      ? <section className="transfer-summary"><span><ArrowLeftRight /></span><div><small>Fondi spostati nel mese</small><strong>{formatMoney(transferList.reduce((sum, transfer) => sum + transfer.amount, 0))}</strong></div></section>
      : section === 'shared' ? <div className="shared-donuts"><DonutChart title="Spese condivise" data={chartExpense} tone="expense" compact /><DonutChart title="Entrate condivise" data={chartIncome} tone="income" compact /></div> : <DonutChart title={section === 'expense' ? 'Spese per categoria' : 'Entrate per categoria'} data={section === 'expense' ? chartExpense : chartIncome} tone={section} />}
    <section className="movements-ledger"><div className="section-title-row"><div><h2>Movimenti</h2><p>{resultCount} {resultCount === 1 ? 'risultato' : 'risultati'} nel mese{section === 'shared' ? ' · importi condivisi' : ''}</p></div><label className="search-field"><Search /><input placeholder={section === 'transfer' ? 'Cerca giro fondi o conto' : 'Cerca movimento o tag'} value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>{section === 'transfer' ? <TransferList data={data} transfers={transferList} /> : <MovementList data={data} movements={list} user={user} onEdit={onEdit} onDelete={onDelete} sharedAmountsOnly={section === 'shared'} />}</section>
  </div>
}

function TransferList({ data, transfers }: { data: AppData; transfers: Transfer[] }) {
  if (!transfers.length) return <div className="empty-state"><ArrowLeftRight /><h3>Nessun giro fondi</h3><p>Non ci sono trasferimenti per questa selezione.</p></div>
  return <div className="movement-list transfer-list">{transfers.map((transfer) => {
    const from = data.accounts.find((account) => account.id === transfer.fromAccountId)
    const to = data.accounts.find((account) => account.id === transfer.toAccountId)
    return <article className="movement-row transfer-row" key={transfer.id}>
      <span className="movement-row__icon movement-row__icon--transfer"><ArrowLeftRight /></span>
      <div className="movement-row__name"><strong>{transfer.description}</strong><small>Giro fondi</small></div>
      <div className="movement-row__meta"><small>Dal conto</small><span>{from?.name ?? 'Conto non visibile'}</span></div>
      <div className="movement-row__meta"><small>Al conto</small><span>{to?.name ?? 'Conto non visibile'}</span></div>
      <time>{formatDate(transfer.date)}</time>
      <strong className="movement-row__amount movement-row__amount--transfer">{formatMoney(transfer.amount)}</strong>
    </article>
  })}</div>
}
