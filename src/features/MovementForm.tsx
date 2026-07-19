import { Check, Landmark, LockKeyhole, Plus, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { makeId, todayISO } from '../lib/format'
import type { AppData, Beneficiary, Category, Movement, MovementType, Tag, User } from '../types'

interface Props {
  data: AppData
  user: User
  onSave: (movement: Movement, additions: { category?: Category; beneficiary?: Beneficiary; tag?: Tag }) => void
  onCancel: () => void
  initial?: Movement
}

export function MovementForm({ data, user, onSave, onCancel, initial }: Props) {
  const [type, setType] = useState<MovementType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial?.amount.toString() ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [shared, setShared] = useState(initial?.shared ?? true)
  const availableAccounts = useMemo(() => data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id), [data.accounts, user.id])
  const [accountId, setAccountId] = useState(initial?.accountId ?? availableAccounts[0]?.id ?? '')
  const categories = data.categories.filter((item) => item.movementType === type && (item.scope === 'family' || item.ownerId === user.id))
  const beneficiaries = data.beneficiaries.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const tags = data.tags.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '')
  const [beneficiaryId, setBeneficiaryId] = useState(initial?.beneficiaryId ?? beneficiaries[0]?.id ?? '')
  const [tagId, setTagId] = useState(initial?.tagId ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [newBeneficiary, setNewBeneficiary] = useState('')
  const [newTag, setNewTag] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const otherName = user.id === 'simone' ? 'Anna' : 'Simone'
  const selectedAccount = data.accounts.find((item) => item.id === accountId)
  const effectivelyShared = selectedAccount?.scope === 'family' || shared

  const changeType = (nextType: MovementType) => {
    setType(nextType)
    setCategoryId(data.categories.find((item) => item.movementType === nextType)?.id ?? '')
    setNewCategory('')
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const numericAmount = Number(amount.replace(',', '.'))
    if (!numericAmount || numericAmount <= 0 || !accountId || (!categoryId && !newCategory.trim())) return
    const category = newCategory.trim() ? { id: makeId('category'), name: newCategory.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, movementType: type, color: type === 'income' ? '#3f7650' : '#c64e2f' } : undefined
    const beneficiary = newBeneficiary.trim() ? { id: makeId('beneficiary'), name: newBeneficiary.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id } : undefined
    const tag = newTag.trim() ? { id: makeId('tag'), name: newTag.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, color: '#c64e2f' } : undefined
    onSave({
      id: initial?.id ?? makeId('movement'), type, authorId: initial?.authorId ?? user.id, memberId: user.id,
      amount: numericAmount, date, description: description.trim() || (category?.name ?? data.categories.find((item) => item.id === categoryId)?.name ?? 'Movimento'),
      categoryId: category?.id ?? categoryId, beneficiaryId: beneficiary?.id ?? beneficiaryId, accountId,
      tagId: tag?.id ?? (tagId || undefined), shared: effectivelyShared, createdAt: initial?.createdAt ?? new Date().toISOString(),
    }, { category, beneficiary, tag })
  }

  return (
    <form className="expense-form movement-form" onSubmit={submit}>
      <div className="movement-type" aria-label="Tipo di movimento">
        <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => changeType('expense')}>Spesa</button>
        <button type="button" className={type === 'income' ? 'active movement-type__income' : 'movement-type__income'} onClick={() => changeType('income')}>Entrata</button>
      </div>
      <div className={`amount-field ${type === 'income' ? 'amount-field--income' : ''}`}>
        <label htmlFor="amount">Importo</label><div><span>€</span><input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        {submitted && (!Number(amount.replace(',', '.')) || Number(amount.replace(',', '.')) <= 0) ? <small>Inserisci un importo valido.</small> : null}
      </div>
      <label>Descrizione<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'income' ? 'Es. Stipendio luglio' : 'Es. Spesa settimanale'} /></label>
      <div className="form-grid">
        <label>Categoria<select value={newCategory ? '__new' : categoryId} onChange={(e) => e.target.value === '__new' ? setNewCategory('Nuova categoria') : (setNewCategory(''), setCategoryId(e.target.value))}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuova categoria</option></select></label>
        {newCategory ? <label>Nome nuova categoria<input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /></label> : null}
        <label>Beneficiario<select value={newBeneficiary ? '__new' : beneficiaryId} onChange={(e) => e.target.value === '__new' ? setNewBeneficiary('Nuovo beneficiario') : (setNewBeneficiary(''), setBeneficiaryId(e.target.value))}>{beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuovo beneficiario</option></select></label>
        {newBeneficiary ? <label>Nome nuovo beneficiario<input value={newBeneficiary} onChange={(e) => setNewBeneficiary(e.target.value)} /></label> : null}
        <label>Conto<select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{availableAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.scope === 'family' ? ' · condiviso' : ''}</option>)}</select></label>
        <label>Tag<select value={newTag ? '__new' : tagId} onChange={(e) => e.target.value === '__new' ? setNewTag('Nuovo tag') : (setNewTag(''), setTagId(e.target.value))}><option value="">Nessun tag</option>{tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuovo tag</option></select></label>
        {newTag ? <label>Nome nuovo tag<input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Es. Vacanza a Parigi" /></label> : null}
        <label>Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {selectedAccount?.scope === 'family' ? <div className="family-account-note"><Landmark /><span><strong>Conto condiviso</strong><small>Questo movimento non modifica il debito o credito tra voi.</small></span></div> : <button type="button" className={`share-toggle ${shared ? 'share-toggle--active' : ''}`} onClick={() => setShared((value) => !value)}><span className="share-toggle__icon">{shared ? <Scale /> : <LockKeyhole />}</span><span><strong>{shared ? `${type === 'income' ? 'Entrata' : 'Spesa'} condivisa con ${otherName}` : `${type === 'income' ? 'Entrata' : 'Spesa'} personale`}</strong><small>{shared ? `Verrà divisa al 50% con ${otherName}.` : 'Sarà visibile soltanto a te.'}</small></span><i aria-hidden="true"><span /></i></button>}
      <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">{initial ? <Check /> : <Plus />}{initial ? 'Salva modifiche' : 'Salva movimento'}</button></div>
    </form>
  )
}
