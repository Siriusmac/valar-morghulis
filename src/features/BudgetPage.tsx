import { Gauge, Plus, Share2, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ActionMenu } from '../components/ActionMenu'
import { CreatableLookup } from '../components/CreatableLookup'
import { categoryBudgetForMonth, categorySpentForMonth } from '../lib/calculations'
import { formatMoney, makeId, todayISO } from '../lib/format'
import type { AppData, Category, Scope, User } from '../types'

interface Props {
  data: AppData
  user: User
  onAdd: (category: Category) => void
  onUpdate: (category: Category) => void
}

const normalizedName = (value: string) => value.trim().toLocaleLowerCase('it-IT')
const byName = (left: Category, right: Category) => left.name.localeCompare(right.name, 'it-IT', { sensitivity: 'base', numeric: true })

export function BudgetPage({ data, user, onAdd, onUpdate }: Props) {
  const month = todayISO().slice(0, 7)
  const [formOpen, setFormOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [amount, setAmount] = useState('')
  const [scope, setScope] = useState<Scope>('personal')
  const [editingId, setEditingId] = useState('')
  const categories = useMemo(() => data.categories
    .filter((item) => item.movementType === 'expense' && (item.scope === 'family' || item.ownerId === user.id))
    .toSorted(byName), [data.categories, user.id])
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

  return <div className="page budget-page">
    <header className="page-heading">
      <div><h1>Budget</h1><p>Controlla quanto hai speso rispetto ai limiti mensili delle categorie.</p></div>
      <button className="button button--primary" type="button" onClick={() => { closeForm(); setFormOpen(true) }}><Plus />Aggiungi budget</button>
    </header>
    {formOpen ? <form className="budget-editor" onSubmit={saveBudget}>
      <div><strong>{editingId ? 'Modifica budget' : 'Aggiungi budget'}</strong><p>Scegli una categoria di spesa o aggiungine una nuova.</p></div>
      <CreatableLookup label="Categoria" value={categoryQuery} options={availableCategories} placeholder="Cerca o aggiungi categoria" onChange={setCategoryQuery} />
      {creatingCategory ? <label>Visibilità<select value={scope} onChange={(event) => setScope(event.target.value as Scope)}><option value="personal">Personale</option><option value="family">Famiglia</option></select></label> : null}
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
          <div className="budget-row__body"><div><strong>{category.name}</strong><small>{category.scope === 'family' ? <><Share2 /> Famiglia</> : <><WalletCards /> Personale</>}</small></div><div className="budget-progress"><span><i style={{ width: `${Math.min(percentage, 100)}%` }} /></span><small>{percentage}% utilizzato</small></div></div>
          <div className="budget-row__amount"><strong>{formatMoney(spent)}</strong><small>su {formatMoney(budget)}</small></div>
          <ActionMenu label={`Azioni per il budget ${category.name}`} items={[{ label: 'Modifica budget', onSelect: () => editBudget(category) }, { label: 'Elimina budget', danger: true, onSelect: () => onUpdate({ ...category, monthlyBudget: undefined, budgetCarryovers: undefined }) }]} />
        </article>
      })}
    </section> : <section className="empty-state"><Gauge /><h3>Nessun budget impostato</h3><p>Aggiungi un budget mensile a una categoria di spesa.</p></section>}
  </div>
}
