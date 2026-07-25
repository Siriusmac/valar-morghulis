import { CalendarDays, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { DonutChart } from '../components/DonutChart'
import { MovementList } from '../components/MovementList'
import { movementAllocations, movementHasSharedPortion, movementsForMonth, totalsByCategory, visibleMovements } from '../lib/calculations'
import type { AppData, Movement, User } from '../types'

interface Props {
  data: AppData
  user: User
  onEdit: (movement: Movement) => void
  onDelete: (id: string) => void
}

export function MovementsPage({ data, user, onEdit, onDelete }: Props) {
  const [section, setSection] = useState<'expense' | 'income' | 'shared'>('expense')
  const [month, setMonth] = useState('2026-07')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const visible = useMemo(() => visibleMovements(data, user.id), [data, user.id])
  const monthly = movementsForMonth(visible, month)
  const shared = monthly.filter((item) => movementHasSharedPortion(data, item))
  const chartExpense = totalsByCategory(data, (section === 'shared' ? shared : monthly).filter((item) => item.type === 'expense'), section === 'shared')
  const chartIncome = totalsByCategory(data, (section === 'shared' ? shared : monthly).filter((item) => item.type === 'income'), section === 'shared')
  const list = monthly
    .filter((item) => section === 'shared' ? movementHasSharedPortion(data, item) : item.type === section)
    .filter((item) => {
      const category = movementAllocations(item).map((allocation) => data.categories.find((entry) => entry.id === allocation.categoryId)?.name ?? '').join(' ')
      const beneficiary = data.beneficiaries.find((entry) => entry.id === item.beneficiaryId)?.name ?? ''
      const tag = data.tags.find((entry) => entry.id === item.tagId)?.name ?? ''
      return `${item.description} ${item.comments ?? ''} ${category} ${beneficiary} ${tag}`.toLowerCase().includes(deferredQuery)
    }).toSorted((a, b) => b.date.localeCompare(a.date))

  return <div className="page movements-page">
    <div className="page-heading"><div><h1>Spese ed Entrate</h1><p>Analizza i movimenti personali e condivisi.</p></div></div>
    <div className="movement-toolbar">
      <div className="tabs movement-tabs"><button className={section === 'expense' ? 'active' : ''} onClick={() => setSection('expense')}>Spese</button><button className={section === 'income' ? 'active tab-income' : 'tab-income'} onClick={() => setSection('income')}>Entrate</button><button className={section === 'shared' ? 'active' : ''} onClick={() => setSection('shared')}>Condivise</button></div>
      <label className="month-field"><CalendarDays /><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
    </div>
    {section === 'shared' ? <div className="shared-donuts"><DonutChart title="Spese condivise" data={chartExpense} tone="expense" compact /><DonutChart title="Entrate condivise" data={chartIncome} tone="income" compact /></div> : <DonutChart title={section === 'expense' ? 'Spese per categoria' : 'Entrate per categoria'} data={section === 'expense' ? chartExpense : chartIncome} tone={section} />}
    <section className="movements-ledger"><div className="section-title-row"><div><h2>Movimenti</h2><p>{list.length} risultati nel mese{section === 'shared' ? ' · importi condivisi' : ''}</p></div><label className="search-field"><Search /><input placeholder="Cerca movimento o tag" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div><MovementList data={data} movements={list} user={user} onEdit={onEdit} onDelete={onDelete} sharedAmountsOnly={section === 'shared'} /></section>
  </div>
}
