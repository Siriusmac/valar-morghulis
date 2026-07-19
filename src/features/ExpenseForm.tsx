import { Check, LockKeyhole, Plus, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { makeId, todayISO } from '../lib/format'
import type { AppData, Beneficiary, Category, Expense, User, UserId } from '../types'

interface Props {
  data: AppData
  user: User
  onSave: (expense: Expense, additions: { category?: Category; beneficiary?: Beneficiary }) => void
  onCancel: () => void
  initial?: Expense
}

export function ExpenseForm({ data, user, onSave, onCancel, initial }: Props) {
  const [amount, setAmount] = useState(initial?.amount.toString() ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [shared, setShared] = useState(initial?.shared ?? true)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? 'alimentari')
  const [beneficiaryId, setBeneficiaryId] = useState(initial?.beneficiaryId ?? 'lidl')
  const accounts = useMemo(() => data.accounts.filter((item) => item.ownerId === user.id), [data.accounts, user.id])
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [newBeneficiary, setNewBeneficiary] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const otherName = user.id === 'simone' ? 'Anna' : 'Simone'

  const categories = data.categories.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const beneficiaries = data.beneficiaries.filter((item) => item.scope === 'family' || item.ownerId === user.id)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const numericAmount = Number(amount.replace(',', '.'))
    if (!numericAmount || numericAmount <= 0 || !accountId) return

    const category = newCategory.trim()
      ? { id: makeId('category'), name: newCategory.trim(), scope: shared ? 'family' as const : 'personal' as const, ownerId: shared ? undefined : user.id, color: '#c64e2f' }
      : undefined
    const beneficiary = newBeneficiary.trim()
      ? { id: makeId('beneficiary'), name: newBeneficiary.trim(), scope: shared ? 'family' as const : 'personal' as const, ownerId: shared ? undefined : user.id }
      : undefined

    onSave({
      id: initial?.id ?? makeId('expense'),
      authorId: initial?.authorId ?? user.id,
      payerId: user.id as UserId,
      amount: numericAmount,
      date,
      description: description.trim() || (category?.name ?? data.categories.find((item) => item.id === categoryId)?.name ?? 'Spesa'),
      categoryId: category?.id ?? categoryId,
      beneficiaryId: beneficiary?.id ?? beneficiaryId,
      accountId,
      shared,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }, { category, beneficiary })
  }

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="amount-field">
        <label htmlFor="amount">Importo</label>
        <div><span>€</span><input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        {submitted && (!Number(amount.replace(',', '.')) || Number(amount.replace(',', '.')) <= 0) ? <small>Inserisci un importo valido.</small> : null}
      </div>
      <label>Descrizione<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Es. Spesa settimanale" /></label>
      <div className="form-grid">
        <label>Categoria
          <select value={newCategory ? '__new' : categoryId} onChange={(e) => e.target.value === '__new' ? setNewCategory('Nuova categoria') : (setNewCategory(''), setCategoryId(e.target.value))}>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="__new">+ Crea nuova categoria</option>
          </select>
        </label>
        {newCategory ? <label>Nome nuova categoria<input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /></label> : null}
        <label>Beneficiario
          <select value={newBeneficiary ? '__new' : beneficiaryId} onChange={(e) => e.target.value === '__new' ? setNewBeneficiary('Nuovo beneficiario') : (setNewBeneficiary(''), setBeneficiaryId(e.target.value))}>
            {beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="__new">+ Crea nuovo beneficiario</option>
          </select>
        </label>
        {newBeneficiary ? <label>Nome nuovo beneficiario<input value={newBeneficiary} onChange={(e) => setNewBeneficiary(e.target.value)} /></label> : null}
        <label>Conto
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <button type="button" className={`share-toggle ${shared ? 'share-toggle--active' : ''}`} onClick={() => setShared((value) => !value)}>
        <span className="share-toggle__icon">{shared ? <Scale /> : <LockKeyhole />}</span>
        <span><strong>{shared ? `Spesa condivisa con ${otherName}` : 'Spesa personale'}</strong><small>{shared ? `Verrà divisa al 50% con ${otherName}.` : 'Sarà visibile soltanto a te.'}</small></span>
        <i aria-hidden="true"><span /></i>
      </button>
      <div className="form-actions">
        <button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button>
        <button className="button button--primary" type="submit">{initial ? <Check /> : <Plus />}{initial ? 'Salva modifiche' : 'Salva spesa'}</button>
      </div>
    </form>
  )
}
