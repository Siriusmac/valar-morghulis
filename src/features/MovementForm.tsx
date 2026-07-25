import { CalendarClock, Check, Landmark, LockKeyhole, Plus, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addMonthsISO, makeId, splitAmount, todayISO } from '../lib/format'
import type { AppData, Beneficiary, Category, Movement, MovementType, ScheduledPayment, Tag, User } from '../types'

interface Props {
  data: AppData
  user: User
  otherName?: string
  memberCount?: number
  onSave: (movement: Movement, additions: { category?: Category; beneficiary?: Beneficiary; tag?: Tag; scheduledPayments?: ScheduledPayment[] }) => void
  onCancel: () => void
  initial?: Movement
}

const providers = ['PayPal', 'Klarna', 'Scalapay', 'Amazon', 'Altro']

export function MovementForm({ data, user, otherName = 'la famiglia', memberCount = 2, onSave, onCancel, initial }: Props) {
  const [type, setType] = useState<MovementType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial?.amount.toString() ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [comments, setComments] = useState(initial?.comments ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [shared, setShared] = useState(initial?.shared ?? (initial ? false : true))
  const personalAccounts = useMemo(() => data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === user.id), [data.accounts, user.id])
  const familyAccounts = useMemo(() => data.accounts.filter((item) => item.scope === 'family'), [data.accounts])
  const availableAccounts = useMemo(() => [...personalAccounts, ...familyAccounts], [personalAccounts, familyAccounts])
  const defaultAccount = type === 'income' && !initial ? personalAccounts[0]?.id : availableAccounts[0]?.id
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccount ?? '')
  const initialAccount = data.accounts.find((item) => item.id === (initial?.accountId ?? defaultAccount))
  const [affectsAccountBalance, setAffectsAccountBalance] = useState(
    initial?.affectsAccountBalance ?? !(initialAccount?.openingBalanceDate && (initial?.date ?? todayISO()) < initialAccount.openingBalanceDate),
  )
  const categories = data.categories.filter((item) => item.movementType === type && (item.scope === 'family' || item.ownerId === user.id))
  const beneficiaries = data.beneficiaries.filter((item) => !item.id.startsWith('beneficiary-user-') && (item.scope === 'family' || item.ownerId === user.id))
  const tags = data.tags.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '')
  const [beneficiaryId, setBeneficiaryId] = useState(initial?.beneficiaryId ?? beneficiaries[0]?.id ?? '')
  const [tagId, setTagId] = useState(initial?.tagId ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [newBeneficiary, setNewBeneficiary] = useState('')
  const [creatingBeneficiary, setCreatingBeneficiary] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false)
  const [installmentCount, setInstallmentCount] = useState(3)
  const [provider, setProvider] = useState('PayPal')
  const [customProvider, setCustomProvider] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const selectedAccount = data.accounts.find((item) => item.id === accountId)
  const effectivelyShared = selectedAccount?.scope === 'family' || shared
  const isBeforeOpeningBalance = Boolean(date && selectedAccount?.openingBalanceDate && date < selectedAccount.openingBalanceDate)
  const sharedWithLabel = memberCount > 2 ? 'la famiglia' : otherName
  const splitPercentage = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 }).format(1 / Math.max(memberCount, 1))

  const changeType = (nextType: MovementType) => {
    setType(nextType)
    setCategoryId(data.categories.find((item) => item.movementType === nextType)?.id ?? '')
    setNewCategory('')
    setCreatingBeneficiary(false)
    setNewBeneficiary('')
    setInstallmentsEnabled(false)
    const nextAccountId = nextType === 'income'
      ? personalAccounts[0]?.id ?? ''
      : personalAccounts[0]?.id ?? availableAccounts[0]?.id ?? ''
    if (nextType === 'income') {
      setShared(false)
      setAccountId(nextAccountId)
    } else {
      setShared(true)
      setAccountId(nextAccountId)
    }
    const nextAccount = data.accounts.find((item) => item.id === nextAccountId)
    setAffectsAccountBalance(!(nextAccount?.openingBalanceDate && date < nextAccount.openingBalanceDate))
  }

  const toggleShared = () => {
    const nextShared = !shared
    setShared(nextShared)
    if (type === 'income') {
      const nextAccountId = nextShared ? familyAccounts[0]?.id ?? '' : personalAccounts[0]?.id ?? ''
      setAccountId(nextAccountId)
      const nextAccount = data.accounts.find((item) => item.id === nextAccountId)
      setAffectsAccountBalance(!(nextAccount?.openingBalanceDate && date < nextAccount.openingBalanceDate))
    }
  }

  const selectAccount = (nextAccountId: string) => {
    setAccountId(nextAccountId)
    const nextAccount = data.accounts.find((item) => item.id === nextAccountId)
    setAffectsAccountBalance(!(nextAccount?.openingBalanceDate && date < nextAccount.openingBalanceDate))
    if (type === 'income') setShared(data.accounts.find((item) => item.id === nextAccountId)?.scope === 'family')
  }

  const changeDate = (nextDate: string) => {
    setDate(nextDate)
    setAffectsAccountBalance(!(selectedAccount?.openingBalanceDate && nextDate < selectedAccount.openingBalanceDate))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const numericAmount = Number(amount.replace(',', '.'))
    const beneficiaryMissing = type === 'expense' && (creatingBeneficiary ? !newBeneficiary.trim() : !beneficiaryId)
    if (!numericAmount || numericAmount <= 0 || !accountId || (!categoryId && !newCategory.trim()) || beneficiaryMissing) return
    const category = newCategory.trim() ? { id: makeId('category'), name: newCategory.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, movementType: type, color: type === 'income' ? '#3f7650' : '#c64e2f' } : undefined
    const userBeneficiaryId = `beneficiary-user-${user.id}`
    const beneficiary = type === 'income'
      ? (data.beneficiaries.some((item) => item.id === userBeneficiaryId) ? undefined : { id: userBeneficiaryId, name: user.name, scope: 'personal' as const, ownerId: user.id })
      : (creatingBeneficiary ? { id: makeId('beneficiary'), name: newBeneficiary.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id } : undefined)
    const tag = newTag.trim() ? { id: makeId('tag'), name: newTag.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, color: '#c64e2f' } : undefined
    const resolvedCategoryId = category?.id ?? categoryId
    const resolvedBeneficiaryId = type === 'income' ? userBeneficiaryId : beneficiary?.id ?? beneficiaryId
    const resolvedTagId = tag?.id ?? (tagId || undefined)
    const resolvedDescription = description.trim() || (category?.name ?? data.categories.find((item) => item.id === categoryId)?.name ?? 'Movimento')
    const resolvedComments = comments.trim() || undefined
    const shouldInstall = type === 'expense' && installmentsEnabled && !initial
    const planId = shouldInstall ? makeId('installment-plan') : undefined
    const amounts = shouldInstall ? splitAmount(numericAmount, installmentCount) : [numericAmount]
    const resolvedProvider = shouldInstall ? (provider === 'Altro' ? customProvider.trim() || 'Altro' : provider) : undefined
    const scheduledPayments: ScheduledPayment[] = shouldInstall ? amounts.slice(1).map((installmentAmount, index) => ({
      id: makeId('scheduled-payment'),
      planId: planId!,
      authorId: user.id,
      memberId: user.id,
      amount: installmentAmount,
      dueDate: addMonthsISO(date, index + 1),
      description: resolvedDescription,
      categoryId: resolvedCategoryId,
      beneficiaryId: resolvedBeneficiaryId,
      accountId,
      tagId: resolvedTagId,
      comments: resolvedComments,
      shared: effectivelyShared,
      provider: resolvedProvider,
      installmentNumber: index + 2,
      installmentCount,
      status: 'scheduled',
    })) : []
    onSave({
      id: initial?.id ?? makeId('movement'),
      type,
      authorId: initial?.authorId ?? user.id,
      memberId: user.id,
      amount: amounts[0],
      date,
      description: shouldInstall ? `${resolvedDescription} · rata 1/${installmentCount}` : resolvedDescription,
      categoryId: resolvedCategoryId,
      beneficiaryId: resolvedBeneficiaryId,
      accountId,
      tagId: resolvedTagId,
      comments: resolvedComments,
      shared: effectivelyShared,
      installmentPlanId: planId ?? initial?.installmentPlanId,
      installmentProvider: resolvedProvider ?? initial?.installmentProvider,
      installmentNumber: shouldInstall ? 1 : initial?.installmentNumber,
      installmentCount: shouldInstall ? installmentCount : initial?.installmentCount,
      sharedSettlementAmount: shouldInstall && effectivelyShared ? numericAmount : initial?.sharedSettlementAmount,
      affectsAccountBalance: isBeforeOpeningBalance ? affectsAccountBalance : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }, { category, beneficiary, tag, scheduledPayments })
  }

  return <form className="expense-form movement-form" onSubmit={submit}>
    <div className="movement-type" aria-label="Tipo di movimento">
      <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => changeType('expense')}>Spesa</button>
      <button type="button" className={type === 'income' ? 'active movement-type__income' : 'movement-type__income'} onClick={() => changeType('income')}>Entrata</button>
    </div>
    <div className={`amount-field ${type === 'income' ? 'amount-field--income' : ''}`}>
      <label htmlFor="amount">Importo {installmentsEnabled ? 'totale' : ''}</label><div><span>€</span><input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
      {submitted && (!Number(amount.replace(',', '.')) || Number(amount.replace(',', '.')) <= 0) ? <small>Inserisci un importo valido.</small> : null}
    </div>
    <label>Descrizione<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'income' ? 'Es. Stipendio luglio' : 'Es. Spesa settimanale'} /></label>
    <label>Commenti<textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Dettagli facoltativi sul movimento" rows={3} /></label>
    <div className="form-grid">
      <label>Categoria<select value={newCategory ? '__new' : categoryId} onChange={(e) => e.target.value === '__new' ? setNewCategory('Nuova categoria') : (setNewCategory(''), setCategoryId(e.target.value))}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuova categoria</option></select></label>
      {newCategory ? <label>Nome nuova categoria<input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /></label> : null}
      {type === 'expense' ? <label>Beneficiario<select value={creatingBeneficiary ? '__new' : beneficiaryId} onChange={(e) => {
        if (e.target.value === '__new') { setCreatingBeneficiary(true); setNewBeneficiary('') }
        else { setCreatingBeneficiary(false); setNewBeneficiary(''); setBeneficiaryId(e.target.value) }
      }}><option value="" disabled>Scegli un beneficiario</option>{beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Aggiungi beneficiario</option></select></label> : null}
      {type === 'expense' && creatingBeneficiary ? <label>Nome nuovo beneficiario<input value={newBeneficiary} onChange={(e) => setNewBeneficiary(e.target.value)} placeholder="Es. Lidl, Amazon" autoFocus required />{submitted && !newBeneficiary.trim() ? <small className="field-error">Inserisci il nome del beneficiario.</small> : null}</label> : null}
      <label>Conto<select value={accountId} onChange={(e) => selectAccount(e.target.value)}>{availableAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.scope === 'family' ? ' · famiglia' : ` · ${user.name}`}</option>)}</select></label>
      <label>Tag<select value={newTag ? '__new' : tagId} onChange={(e) => e.target.value === '__new' ? setNewTag('Nuovo tag') : (setNewTag(''), setTagId(e.target.value))}><option value="">Nessun tag</option>{tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuovo tag</option></select></label>
      {newTag ? <label>Nome nuovo tag<input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Es. Vacanza a Parigi" /></label> : null}
      <label>Data<input type="date" value={date} onChange={(e) => changeDate(e.target.value)} required /></label>
    </div>
    {isBeforeOpeningBalance ? <fieldset className="balance-impact-choice">
      <legend>Questo movimento è precedente al saldo iniziale del conto</legend>
      <p>Resterà sempre nelle statistiche. Scegli se deve modificare anche il saldo calcolato.</p>
      <label><input type="radio" name="balance-impact" checked={!affectsAccountBalance} onChange={() => setAffectsAccountBalance(false)} /><span><strong>Solo statistiche</strong><small>Non modifica il saldo del conto (consigliato).</small></span></label>
      <label><input type="radio" name="balance-impact" checked={affectsAccountBalance} onChange={() => setAffectsAccountBalance(true)} /><span><strong>Includi nel saldo</strong><small>Somma o sottrae l’importo anche dal saldo calcolato.</small></span></label>
    </fieldset> : null}
    {type === 'expense' && !initial ? <section className={`installment-box ${installmentsEnabled ? 'installment-box--active' : ''}`}>
      <button type="button" className="installment-toggle" onClick={() => setInstallmentsEnabled((value) => !value)}><CalendarClock /><span><strong>Rateizza</strong><small>Registra oggi la prima rata e programma le successive.</small></span><i aria-hidden="true"><span /></i></button>
      {installmentsEnabled ? <div className="installment-fields"><label>Intermediario<select value={provider} onChange={(e) => setProvider(e.target.value)}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label>{provider === 'Altro' ? <label>Nome intermediario<input value={customProvider} onChange={(e) => setCustomProvider(e.target.value)} placeholder="Es. carta del negozio" /></label> : null}<label>Numero di rate<select value={installmentCount} onChange={(e) => setInstallmentCount(Number(e.target.value))}><option value={3}>3 rate</option><option value={5}>5 rate</option></select></label></div> : null}
    </section> : null}
    {selectedAccount?.scope === 'family' ? <div className="family-account-note"><Landmark /><span><strong>{type === 'income' ? 'Entrata della famiglia' : 'Conto condiviso'}</strong><small>{type === 'income' ? 'L’entrata viene assegnata alla famiglia e accreditata sul conto condiviso.' : 'Questo movimento non modifica il debito o credito tra i membri.'}</small></span></div> : <button type="button" className={`share-toggle ${shared ? 'share-toggle--active' : ''}`} onClick={toggleShared}><span className="share-toggle__icon">{shared ? <Scale /> : <LockKeyhole />}</span><span><strong>{shared ? `${type === 'income' ? 'Entrata della famiglia' : 'Spesa condivisa con ' + sharedWithLabel}` : `${type === 'income' ? `Entrata di ${user.name}` : 'Spesa personale'}`}</strong><small>{shared ? (type === 'income' ? 'Verrà assegnata automaticamente al conto condiviso.' : `Verrà ripartita al ${splitPercentage} per ciascuno dei ${memberCount} membri.`) : `Verrà assegnata a ${user.name} e sarà visibile soltanto a te.`}</small></span><i aria-hidden="true"><span /></i></button>}
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">{initial ? <Check /> : <Plus />}{initial ? 'Salva modifiche' : 'Salva movimento'}</button></div>
  </form>
}
