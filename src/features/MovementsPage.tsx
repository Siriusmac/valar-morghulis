import { CalendarDays, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { DonutChart } from '../components/DonutChart'
import { MovementList } from '../components/MovementList'
import { movementAllocations, movementHasSharedPortion, movementsForMonth, totalsByCategory, visibleMovements } from '../lib/calculations'
import { formatMonthYear, selectableMonths, todayISO } from '../lib/format'
import type { AppData, Movement, User } from '../types'

interface Props {
  data: AppData
  user: User
  onEdit: (movement: Movement) => void
  onDelete: (id: string) => void
}

export function MovementsPage({ data, user, onEdit, onDelete }: Props) {
  const [section, setSection] = useState<'expense' | 'income' | 'shared'>('expense')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const visible = useMemo(() => visibleMovements(data, user.id), [data, user.id])
  const monthOptions = selectableMonths(visible.map((movement) => movement.date), month)
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

  return <div className="page movements-page">
    <div className="page-heading"><div><h1>Spese ed Entrate</h1><p>Analizza i movimenti personali e condivisi.</p></div></div>
    <div className="movement-toolbar">
      <div className="tabs movement-tabs"><button className={section === 'expense' ? 'active' : ''} onClick={() => setSection('expense')}>Spese</button><button className={section === 'income' ? 'active tab-income' : 'tab-income'} onClick={() => setSection('income')}>Entrate</button><button className={section === 'shared' ? 'active' : ''} onClick={() => setSection('shared')}>Condivise</button></div>
      <label className="month-field"><CalendarDays /><select aria-label="Mese" value={month} onChange={(event) => setMonth(event.target.value)}>{monthOptions.map((option) => <option key={option} value={option}>{formatMonthYear(option)}</option>)}</select></label>
    </div>
    {section === 'shared' ? <div className="shared-donuts"><DonutChart title="Spese condivise" data={chartExpense} tone="expense" compact /><DonutChart title="Entrate condivise" data={chartIncome} tone="income" compact /></div> : <DonutChart title={section === 'expense' ? 'Spese per categoria' : 'Entrate per categoria'} data={section === 'expense' ? chartExpense : chartIncome} tone={section} />}
    <section className="movements-ledger"><div className="section-title-row"><div><h2>Movimenti</h2><p>{list.length} risultati nel mese{section === 'shared' ? ' · importi condivisi' : ''}</p></div><label className="search-field"><Search /><input placeholder="Cerca movimento o tag" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div><MovementList data={data} movements={list} user={user} onEdit={onEdit} onDelete={onDelete} sharedAmountsOnly={section === 'shared'} /></section>
  </div>
}
