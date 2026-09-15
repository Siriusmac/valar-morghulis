import { ChevronRight, Gauge, Plus, Share2, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ActionMenu } from '../components/ActionMenu'
import { CreatableLookup } from '../components/CreatableLookup'
import { categoryBudgetForMonth, categorySpentForMonth, movementAllocations } from '../lib/calculations'
import { formatMoney, makeId, todayISO } from '../lib/format'
import type { AppData, Category, Scope, User } from '../types'

interface Props {
  data: AppData
  user: User
  personalOnly?: boolean
  onAdd: (category: Category) => void
  onUpdate: (category: Category) => void
  onShowMovements: (
    title: string,
    filter: (movement: AppData['movements'][number]) => boolean,
    amount?: (movement: AppData['movements'][number]) => number,
    accountId?: string,
    transferFilter?: (transfer: AppData['transfers'][number]) => boolean,
    transferAmount?: (transfer: AppData['transfers'][number]) => number,
  ) => void
}

const normalizedName = (value: string) => value.trim().toLocaleLowerCase('it-IT')
const byName = (left: Category, right: Category) => left.name.localeCompare(right.name, 'it-IT', { sensitivity: 'base', numeric: true })

function BudgetGauge({ categoryName, percentage }: { categoryName: string; percentage: number }) {
  const cappedPercentage = Math.min(Math.max(percentage, 0), 100)
  const level = percentage >= 90 ? 'danger' : percentage >= 70 ? 'warning' : 'safe'
  const needleRotation = cappedPercentage * 1.8 - 90

  return <div
    className={`budget-gauge budget-gauge--${level}`}
    role="meter"
    aria-label={`Budget ${categoryName}`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={cappedPercentage}
    aria-valuetext={`${percentage}% utilizzato`}
  >
    <svg viewBox="0 0 120 66" aria-hidden="true">
      <path className="budget-gauge__track" d="M 10 58 A 50 50 0 0 1 110 58" pathLength="100" />
      <path className="budget-gauge__segment budget-gauge__segment--safe" d="M 10 58 A 50 50 0 0 1 110 58" pathLength="100" />
      <path className="budget-gauge__segment budget-gauge__segment--warning" d="M 10 58 A 50 50 0 0 1 110 58" pathLength="100" />
      <path className="budget-gauge__segment budget-gauge__segment--danger" d="M 10 58 A 50 50 0 0 1 110 58" pathLength="100" />
      <line className="budget-gauge__needle" x1="60" y1="58" x2="60" y2="18" style={{ transform: `rotate(${needleRotation}deg)` }} />
      <circle className="budget-gauge__pivot" cx="60" cy="58" r="5" />
    </svg>
    <span><strong>{percentage}%</strong><small>utilizzato</small></span>
  </div>
}

export function BudgetPage({ data, user, personalOnly = false, onAdd, onUpdate, onShowMovements }: Props) {
  const month = todayISO().slice(0, 7)
  const [formOpen, setFormOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [amount, setAmount] = useState('')
  const [scope, setScope] = useState<Scope>('personal')
  const [editingId, setEditingId] = useState('')
  const categories = useMemo(() => data.categories
    .filter((item) => item.movementType === 'expense' && ((!personalOnly && item.scope === 'family') || item.ownerId === user.id))
    .toSorted(byName), [data.categories, personalOnly, user.id])
  const budgetCategories = categories.filter((item) => (item.monthlyBudget ?? 0) > 0)
  const availableCategories = categories.filter((item) => !item.monthlyBudget || item.id === editingId)
  const selectedCategory = categories.find((item) => normalizedName(item.name) === normalizedName(categoryQuery))
  const creatingCategory = Boolean(categoryQuery.trim() && !selectedCategory)

  const closeForm = () => {
    setFormOpen(false)
    setEditingId('')
    setCategoryQuery('')
    setAmount('')
    setScope('personal')
  }
  const editBudget = (category: Category) => {
    setFormOpen(true)
    setEditingId(category.id)
    setCategoryQuery(category.name)
    setAmount(category.monthlyBudget?.toFixed(2).replace('.', ',') ?? '')
    setScope(category.scope)
  }
  const saveBudget = (event: React.FormEvent) => {
    event.preventDefault()
    const value = Math.round((Number(amount.replace(',', '.')) || 0) * 100) / 100
    if (!categoryQuery.trim() || value <= 0) return
    if (selectedCategory) onUpdate({ ...selectedCategory, monthlyBudget: value })
    else onAdd({
      id: makeId('category'),
      name: categoryQuery.trim(),
      scope,
      ownerId: scope === 'personal' ? user.id : undefined,
      movementType: 'expense',
      color: '#c64e2f',
      monthlyBudget: value,
    })
    closeForm()
  }
  const showBudgetMovements = (category: Category) => onShowMovements(
    `Movimenti · ${category.name}`,
    (movement) => movementAllocations(movement).some((allocation) => allocation.categoryId === category.id),
    (movement) => movementAllocations(movement).filter((allocation) => allocation.categoryId === category.id).reduce((sum, allocation) => sum + allocation.amount, 0),
    undefined,
    (transfer) => transfer.feeCategoryId === category.id && Boolean(transfer.feeAmount),
    (transfer) => transfer.feeAmount ?? 0,
  )

  return <div className="page budget-page">
    <header className="page-heading">
      <div><h1>Budget</h1><p>Controlla quanto hai speso rispetto ai limiti mensili delle categorie.</p></div>
      <button className="button button--primary" type="button" onClick={() => { closeForm(); setFormOpen(true) }}><Plus />Aggiungi budget</button>
    </header>
    {formOpen ? <form className="budget-editor" onSubmit={saveBudget}>
      <div><strong>{editingId ? 'Modifica budget' : 'Aggiungi budget'}</strong><p>Scegli una categoria di spesa o aggiungine una nuova.</p></div>
      <CreatableLookup label="Categoria" value={categoryQuery} options={availableCategories} placeholder="Cerca o aggiungi categoria" onChange={setCategoryQuery} />
      {creatingCategory ? personalOnly ? <label>Visibilità<output>Personale</output></label> : <label>Visibilità<select value={scope} onChange={(event) => setScope(event.target.value as Scope)}><option value="personal">Personale</option><option value="family">Famiglia</option></select></label> : null}
      <label>Importo mensile<div className="money-input"><span>€</span><input aria-label="Importo mensile" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></div></label>
      <div className="budget-editor__actions"><button type="button" className="button button--ghost" onClick={closeForm}>Annulla</button><button type="submit" className="button button--primary">Salva budget</button></div>
    </form> : null}
    {budgetCategories.length ? <section className="budget-list" aria-label="Budget impostati">
      {budgetCategories.map((category) => {
        const budget = categoryBudgetForMonth(category, month)
        const spent = categorySpentForMonth(data, category.id, month, user.id)
        const percentage = budget > 0 ? Math.round((spent / budget) * 100) : 0
        return <article className="budget-row" key={category.id}>
          <span className="budget-row__icon"><Gauge /></span>
          <div className="budget-row__body"><div><strong>{category.name}</strong><small>{category.scope === 'family' ? <><Share2 /> Famiglia</> : <><WalletCards /> Personale</>}</small></div><BudgetGauge categoryName={category.name} percentage={percentage} /></div>
          <div className="budget-row__amount"><strong>{formatMoney(spent)}</strong><small>su {formatMoney(budget)}</small></div>
          <div className="budget-row__actions"><ActionMenu label={`Azioni per il budget ${category.name}`} items={[{ label: 'Modifica budget', onSelect: () => editBudget(category) }, { label: 'Elimina budget', danger: true, onSelect: () => onUpdate({ ...category, monthlyBudget: undefined, budgetCarryovers: undefined }) }]} /><button className="row-disclosure" type="button" aria-label={`Vedi movimenti del budget ${category.name}`} onClick={() => showBudgetMovements(category)}><ChevronRight /></button></div>
        </article>
      })}
    </section> : <section className="empty-state"><Gauge /><h3>Nessun budget impostato</h3><p>Aggiungi un budget mensile a una categoria di spesa.</p></section>}
  </div>
}
