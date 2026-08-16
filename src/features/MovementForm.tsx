import { CalendarClock, Check, Landmark, LockKeyhole, Plus, Scale, ShoppingBag, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CreatableLookup } from '../components/CreatableLookup'
import { MovementTypeSelector } from '../components/MovementTypeSelector'
import { addMonthsISO, makeId, splitAllocationsAcrossInstallments, splitAmount, todayISO } from '../lib/format'
import type { AppData, Beneficiary, Category, Contact, Movement, MovementSplit, MovementType, ScheduledPayment, Sender, Tag, User } from '../types'

export interface CommissionedPurchaseDraft {
  id: string
  movementId: string
  recipientId?: string
  inviteEmail?: string
  amount: number
  purchaseDate: string
  description: string
}

interface Props {
  data: AppData
  user: User
  otherName?: string
  memberCount?: number
  onSave: (movement: Movement, additions: { category?: Category; categories?: Category[]; beneficiary?: Beneficiary; beneficiaries?: Beneficiary[]; sender?: Sender; tag?: Tag; scheduledPayments?: ScheduledPayment[] }) => void
  onCancel: () => void
  onDelete?: (id: string) => void
  initial?: Movement
  personalOnly?: boolean
  initialType?: MovementType
  onSelectTransfer?: () => void
  contacts?: Contact[]
  onCommissionedPurchase?: (draft: CommissionedPurchaseDraft) => Promise<void>
}

const providers = ['PayPal', 'Klarna', 'Scalapay', 'Amazon', 'Altro']
type SplitDraft = Omit<MovementSplit, 'amount'> & {
  amount: string
  categoryQuery: string
  beneficiaryQuery: string
}

function findByName<T extends { name: string }>(items: T[], value: string) {
  const normalized = value.trim().toLocaleLowerCase('it-IT')
  return items.find((item) => item.name.toLocaleLowerCase('it-IT') === normalized)
}

export function MovementForm({ data, user, otherName = 'la famiglia', memberCount = 2, onSave, onCancel, onDelete, initial, personalOnly = false, initialType = 'expense', onSelectTransfer, contacts = [], onCommissionedPurchase }: Props) {
  const [type, setType] = useState<MovementType>(initial?.type ?? initialType)
  const [amount, setAmount] = useState(initial?.amount.toString() ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [comments, setComments] = useState(initial?.comments ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [shared, setShared] = useState(personalOnly ? false : initial?.shared ?? (initial ? false : true))
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
  const senders = data.senders.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const tags = data.tags.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [categoryQuery, setCategoryQuery] = useState(() => data.categories.find((item) => item.id === initial?.categoryId)?.name ?? '')
  const [beneficiaryId, setBeneficiaryId] = useState(initial?.beneficiaryId ?? '')
  const [beneficiaryQuery, setBeneficiaryQuery] = useState(() => data.beneficiaries.find((item) => item.id === initial?.beneficiaryId)?.name ?? '')
  const [senderId, setSenderId] = useState(initial?.senderId ?? '')
  const [senderQuery, setSenderQuery] = useState(() => data.senders.find((item) => item.id === initial?.senderId)?.name ?? '')
  const [tagId, setTagId] = useState(initial?.tagId ?? '')
  const [newTag, setNewTag] = useState('')
  const [splitsEnabled, setSplitsEnabled] = useState(Boolean(initial?.splits?.length))
  const [splits, setSplits] = useState<SplitDraft[]>(() => (initial?.splits ?? []).map((item) => ({
    ...item,
    amount: item.amount.toString(),
    categoryQuery: data.categories.find((category) => category.id === item.categoryId)?.name ?? '',
    beneficiaryQuery: data.beneficiaries.find((beneficiary) => beneficiary.id === item.beneficiaryId)?.name ?? '',
  })))
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false)
  const [installmentCount, setInstallmentCount] = useState(3)
  const [provider, setProvider] = useState('PayPal')
  const [customProvider, setCustomProvider] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [commissioned, setCommissioned] = useState(false)
  const [commissionedRecipientId, setCommissionedRecipientId] = useState('')
  const [commissionedInviteEmail, setCommissionedInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestError, setRequestError] = useState('')
  const selectedAccount = data.accounts.find((item) => item.id === accountId)
  const effectivelyShared = !commissioned && !personalOnly && (selectedAccount?.scope === 'family' || shared)
  const isBeforeOpeningBalance = Boolean(date && selectedAccount?.openingBalanceDate && date < selectedAccount.openingBalanceDate)
  const sharedWithLabel = memberCount > 2 ? 'la famiglia' : otherName
  const splitPercentage = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 }).format(1 / Math.max(memberCount, 1))
  const numericAmount = Number(amount.replace(',', '.')) || 0
  const splitTotal = splits.reduce((sum, item) => sum + (Number(item.amount.replace(',', '.')) || 0), 0)
  const mainRemainder = Math.max(0, Math.round((numericAmount - splitTotal) * 100) / 100)
  const beneficiaryMissing = type === 'expense' && !beneficiaryQuery.trim() && (!initial || initial.type !== 'expense')
  const senderMissing = type === 'income' && !senderQuery.trim() && (!initial || initial.type !== 'income')
  const commissionedTargetMissing = commissioned && !commissionedRecipientId && !commissionedInviteEmail.trim()
  const displayedAccounts = commissioned ? personalAccounts : availableAccounts

  const addSplit = () => {
    setSplits((items) => [...items, {
      id: makeId('movement-split'),
      amount: '',
      categoryId: '',
      categoryQuery: '',
      beneficiaryId: undefined,
      beneficiaryQuery: '',
      shared: false,
    }])
  }

  const changeCategoryQuery = (value: string) => {
    setCategoryQuery(value)
    setCategoryId(findByName(categories, value)?.id ?? '')
  }

  const changeBeneficiaryQuery = (value: string) => {
    setBeneficiaryQuery(value)
    setBeneficiaryId(findByName(beneficiaries, value)?.id ?? '')
  }

  const changeSenderQuery = (value: string) => {
    setSenderQuery(value)
    setSenderId(findByName(senders, value)?.id ?? '')
  }

  const updateSplit = (id: string, patch: Partial<SplitDraft>) => {
    setSplits((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const changeSplitCategoryQuery = (id: string, value: string) => {
    updateSplit(id, { categoryQuery: value, categoryId: findByName(categories, value)?.id ?? '' })
  }

  const changeSplitBeneficiaryQuery = (id: string, value: string) => {
    updateSplit(id, { beneficiaryQuery: value, beneficiaryId: findByName(beneficiaries, value)?.id })
  }

  const changeType = (nextType: MovementType) => {
    setType(nextType)
    setCategoryId('')
    setCategoryQuery('')
    setBeneficiaryId('')
    setBeneficiaryQuery('')
    setSenderId('')
    setSenderQuery('')
    setInstallmentsEnabled(false)
    setSplitsEnabled(false)
    setSplits([])
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

  const setMovementSharing = (nextShared: boolean) => {
    if (personalOnly) { setShared(false); return }
    setShared(nextShared)
    if (initial && splits.length) setSplits((items) => items.map((item) => ({ ...item, shared: nextShared })))
    if (type === 'income') {
      const nextAccountId = nextShared ? familyAccounts[0]?.id ?? '' : personalAccounts[0]?.id ?? ''
      setAccountId(nextAccountId)
      const nextAccount = data.accounts.find((item) => item.id === nextAccountId)
      setAffectsAccountBalance(!(nextAccount?.openingBalanceDate && date < nextAccount.openingBalanceDate))
    }
  }

  const toggleShared = () => setMovementSharing(!shared)

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const categoryName = categoryQuery.trim()
    const beneficiaryName = beneficiaryQuery.trim()
    const senderName = senderQuery.trim()
    const invalidSplits = splitsEnabled && (
      splits.length === 0
      || splits.some((item) => !item.categoryQuery.trim() || !Number(item.amount.replace(',', '.')) || Number(item.amount.replace(',', '.')) <= 0)
      || splitTotal > numericAmount
    )
    if (!numericAmount || numericAmount <= 0 || !accountId || !categoryName || beneficiaryMissing || senderMissing || invalidSplits || commissionedTargetMissing || (commissioned && !description.trim())) return
    const categoryMatch = findByName(categories, categoryName)
    const beneficiaryMatch = findByName(beneficiaries, beneficiaryName)
    const senderMatch = findByName(senders, senderName)
    const category = categoryMatch ? undefined : { id: makeId('category'), name: categoryName, scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, movementType: type, color: type === 'income' ? '#3f7650' : '#c64e2f' }
    const userBeneficiaryId = `beneficiary-user-${user.id}`
    const beneficiary = type === 'income'
      ? (data.beneficiaries.some((item) => item.id === userBeneficiaryId) ? undefined : { id: userBeneficiaryId, name: user.name, scope: 'personal' as const, ownerId: user.id })
      : (beneficiaryName && !beneficiaryMatch ? { id: makeId('beneficiary'), name: beneficiaryName, scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id } : undefined)
    const sender = type === 'income' && senderName && !senderMatch
      ? { id: makeId('sender'), name: senderName, scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id }
      : undefined
    const tag = newTag.trim() ? { id: makeId('tag'), name: newTag.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, color: '#c64e2f' } : undefined
    const resolvedCategoryId = category?.id ?? categoryMatch?.id ?? categoryId
    const resolvedBeneficiaryId = type === 'income'
      ? userBeneficiaryId
      : beneficiaryName ? beneficiary?.id ?? beneficiaryMatch?.id ?? beneficiaryId : undefined
    const resolvedSenderId = type === 'income' && senderName ? sender?.id ?? senderMatch?.id ?? senderId : undefined
    const resolvedTagId = tag?.id ?? (tagId || undefined)
    const resolvedDescription = description.trim() || categoryName || 'Movimento'
    const resolvedComments = comments.trim() || undefined
    const shouldInstall = type === 'expense' && installmentsEnabled && !initial && !commissioned
    const planId = shouldInstall ? makeId('installment-plan') : undefined
    const amounts = shouldInstall ? splitAmount(numericAmount, installmentCount) : [numericAmount]
    const resolvedProvider = shouldInstall ? (provider === 'Altro' ? customProvider.trim() || 'Altro' : provider) : undefined
    const matchesInitialMovement = (item: Movement) => item.id === initial?.id
      || Boolean(initial && item.authorId === initial.authorId && item.createdAt === initial.createdAt)
    const editedInstallmentSettlementAmount = initial?.installmentPlanId && initial.installmentNumber === 1 && effectivelyShared
      ? [
        { amount: numericAmount },
        ...data.movements.filter((item) => item.installmentPlanId === initial.installmentPlanId && !matchesInitialMovement(item)),
        ...data.scheduledPayments.filter((item) => item.planId === initial.installmentPlanId && item.status === 'scheduled'),
      ]
        .reduce((total, item) => total + item.amount, 0)
      : initial?.sharedSettlementAmount
    const newSplitCategories: Category[] = []
    const newSplitBeneficiaries: Beneficiary[] = []
    const resolvedSplits = type === 'expense' && splitsEnabled
      ? splits.map((item) => {
        const categoryName = item.categoryQuery.trim()
        const beneficiaryName = item.beneficiaryQuery.trim()
        let resolvedSplitCategory = findByName(categories, categoryName) ?? findByName(newSplitCategories, categoryName)
        if (!resolvedSplitCategory && category?.name.toLocaleLowerCase('it-IT') === categoryName.toLocaleLowerCase('it-IT')) resolvedSplitCategory = category
        if (!resolvedSplitCategory) {
          resolvedSplitCategory = {
            id: makeId('category'),
            name: categoryName,
            scope: selectedAccount?.scope === 'family' || item.shared ? 'family' : 'personal',
            ownerId: selectedAccount?.scope === 'family' || item.shared ? undefined : user.id,
            movementType: 'expense',
            color: '#c64e2f',
          }
          newSplitCategories.push(resolvedSplitCategory)
        }
        let resolvedSplitBeneficiary = beneficiaryName
          ? findByName(beneficiaries, beneficiaryName) ?? findByName(newSplitBeneficiaries, beneficiaryName)
          : undefined
        if (!resolvedSplitBeneficiary && beneficiary?.name.toLocaleLowerCase('it-IT') === beneficiaryName.toLocaleLowerCase('it-IT')) resolvedSplitBeneficiary = beneficiary
        if (beneficiaryName && !resolvedSplitBeneficiary) {
          resolvedSplitBeneficiary = {
            id: makeId('beneficiary'),
            name: beneficiaryName,
            scope: selectedAccount?.scope === 'family' || item.shared ? 'family' : 'personal',
            ownerId: selectedAccount?.scope === 'family' || item.shared ? undefined : user.id,
          }
          newSplitBeneficiaries.push(resolvedSplitBeneficiary)
        }
        return {
          id: item.id,
          amount: Math.round(Number(item.amount.replace(',', '.')) * 100) / 100,
          categoryId: resolvedSplitCategory.id,
          beneficiaryId: resolvedSplitBeneficiary?.id,
          shared: selectedAccount?.scope === 'family' || item.shared,
        }
      })
      : undefined
    const installmentAllocations = shouldInstall && resolvedSplits
      ? splitAllocationsAcrossInstallments([mainRemainder, ...resolvedSplits.map((item) => item.amount)], amounts)
      : undefined
    const splitsForInstallment = (index: number) => resolvedSplits?.map((item, splitIndex) => ({
      ...item,
      amount: installmentAllocations?.[index]?.[splitIndex + 1] ?? item.amount,
    }))
    const sharedPurchaseAmount = Math.round((
      (effectivelyShared ? mainRemainder : 0)
      + (resolvedSplits ?? []).filter((item) => item.shared).reduce((sum, item) => sum + item.amount, 0)
    ) * 100) / 100
    const scheduledPayments: ScheduledPayment[] = shouldInstall ? amounts.slice(1).map((installmentAmount, index) => {
      const dueDate = addMonthsISO(date, index + 1)
      return {
        id: makeId('scheduled-payment'),
        planId: planId!,
        authorId: user.id,
        memberId: user.id,
        amount: installmentAmount,
        dueDate,
        description: resolvedDescription,
        categoryId: resolvedCategoryId,
        beneficiaryId: resolvedBeneficiaryId,
        accountId,
        tagId: resolvedTagId,
        comments: resolvedComments,
        shared: effectivelyShared,
        splits: splitsForInstallment(index + 1),
        provider: resolvedProvider,
        installmentNumber: index + 2,
        installmentCount,
        status: 'scheduled',
        ...(selectedAccount?.openingBalanceDate && dueDate < selectedAccount.openingBalanceDate ? { affectsAccountBalance } : {}),
      }
    }) : []
    const movementId = initial?.id ?? makeId('movement')
    const purchaseId = commissioned ? makeId('commissioned-purchase') : undefined
    const movement: Movement = {
      id: movementId,
      type,
      authorId: initial?.authorId ?? user.id,
      memberId: user.id,
      amount: amounts[0],
      date,
      description: shouldInstall ? `${resolvedDescription} · rata 1/${installmentCount}` : resolvedDescription,
      categoryId: resolvedCategoryId,
      beneficiaryId: resolvedBeneficiaryId,
      senderId: resolvedSenderId,
      accountId,
      tagId: resolvedTagId,
      comments: resolvedComments,
      shared: commissioned ? false : effectivelyShared,
      splits: shouldInstall ? splitsForInstallment(0) : resolvedSplits,
      installmentPlanId: planId ?? initial?.installmentPlanId,
      installmentProvider: resolvedProvider ?? initial?.installmentProvider,
      installmentNumber: shouldInstall ? 1 : initial?.installmentNumber,
      installmentCount: shouldInstall ? installmentCount : initial?.installmentCount,
      sharedSettlementAmount: shouldInstall && sharedPurchaseAmount > 0 ? sharedPurchaseAmount : editedInstallmentSettlementAmount,
      affectsAccountBalance: isBeforeOpeningBalance ? affectsAccountBalance : undefined,
      commissionedPurchaseId: purchaseId,
      excludeFromReports: commissioned || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }
    if (commissioned && purchaseId && onCommissionedPurchase) {
      setSaving(true)
      try {
        setRequestError('')
        await onCommissionedPurchase({ id: purchaseId, movementId, recipientId: commissionedRecipientId || undefined, inviteEmail: commissionedInviteEmail.trim() || undefined, amount: numericAmount, purchaseDate: date, description: description.trim() })
      } catch (reason) {
        setRequestError(reason instanceof Error ? reason.message : 'Non è stato possibile inviare la richiesta.')
        setSaving(false)
        return
      } finally { setSaving(false) }
    }
    onSave(movement, { category, categories: newSplitCategories, beneficiary, beneficiaries: newSplitBeneficiaries, sender, tag, scheduledPayments })
  }

  return <form className="expense-form movement-form" onSubmit={submit}>
    <MovementTypeSelector value={type} includeTransfer={!initial && Boolean(onSelectTransfer)} onChange={(nextType) => nextType === 'transfer' ? onSelectTransfer?.() : changeType(nextType)} />
    <div className={`amount-field ${type === 'income' ? 'amount-field--income' : ''}`}>
      <label htmlFor="amount">Importo {installmentsEnabled ? 'totale' : ''}</label><div><span>€</span><input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
      {submitted && (!Number(amount.replace(',', '.')) || Number(amount.replace(',', '.')) <= 0) ? <small>Inserisci un importo valido.</small> : null}
    </div>
    <label>Descrizione<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'income' ? 'Es. Stipendio luglio' : 'Es. Spesa settimanale'} /></label>
    <label>Commenti<textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Dettagli facoltativi sul movimento" rows={3} /></label>
    <div className="form-grid">
      <CreatableLookup label="Categoria" value={categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={changeCategoryQuery} error={submitted && !categoryQuery.trim() ? 'Inserisci una categoria.' : undefined} />
      {type === 'expense' ? <CreatableLookup label="Beneficiario" value={beneficiaryQuery} options={beneficiaries} placeholder="Inserisci beneficiario" onChange={changeBeneficiaryQuery} error={submitted && beneficiaryMissing ? 'Inserisci un beneficiario.' : undefined} /> : null}
      {type === 'income' ? <CreatableLookup label="Mittente" value={senderQuery} options={senders} placeholder="Inserisci mittente" onChange={changeSenderQuery} error={submitted && senderMissing ? 'Inserisci un mittente.' : undefined} /> : null}
      <label>Conto<select value={accountId} onChange={(e) => selectAccount(e.target.value)}>{displayedAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.scope === 'family' ? ' · famiglia' : ` · ${user.name}`}</option>)}</select></label>
      <label>Tag<select value={newTag ? '__new' : tagId} onChange={(e) => e.target.value === '__new' ? setNewTag('Nuovo tag') : (setNewTag(''), setTagId(e.target.value))}><option value="">Nessun tag</option>{tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuovo tag</option></select></label>
      {newTag ? <label>Nome nuovo tag<input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Es. Vacanza a Parigi" /></label> : null}
      <label>Data<input type="date" value={date} onChange={(e) => changeDate(e.target.value)} required /></label>
    </div>
    {type === 'expense' && !initial && onCommissionedPurchase ? <section className={`installment-box commissioned-box ${commissioned ? 'installment-box--active' : ''}`}>
      <button type="button" className="installment-toggle" onClick={() => {
        setCommissioned((value) => !value); setShared(false); setInstallmentsEnabled(false); setSplitsEnabled(false); setSplits([])
        if (selectedAccount?.scope === 'family') selectAccount(personalAccounts[0]?.id ?? '')
      }}><ShoppingBag /><span><strong>Acquisto per conto di un’altra persona</strong><small>Paghi tu, il destinatario riceve una richiesta e lo cataloga nella propria contabilità.</small></span><i aria-hidden="true"><span /></i></button>
      {commissioned ? <div className="installment-fields"><label>Destinatario<select value={commissionedRecipientId} onChange={(event) => { setCommissionedRecipientId(event.target.value); setCommissionedInviteEmail('') }}><option value="">Invita un nuovo contatto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.source === 'family' ? ' · famiglia' : ''}</option>)}</select></label>{!commissionedRecipientId ? <label>Email da invitare<input type="email" value={commissionedInviteEmail} onChange={(event) => setCommissionedInviteEmail(event.target.value)} placeholder="nome@email.it" required /></label> : null}<small>Questa uscita modifica il saldo del tuo conto ma non le tue statistiche di spesa. Il destinatario dovrà confermarla.</small>{submitted && commissionedTargetMissing ? <small className="field-error">Scegli un contatto o inserisci l’email da invitare.</small> : null}{submitted && !description.trim() ? <small className="field-error">La descrizione è obbligatoria per permettere al destinatario di riconoscere l’acquisto.</small> : null}{requestError ? <small className="field-error">{requestError}</small> : null}</div> : null}
    </section> : null}
    {type === 'expense' && !commissioned ? <section className={`split-box ${splitsEnabled ? 'split-box--active' : ''}`}>
      <label className="split-selector">Suddivisione per categorie<select value={splitsEnabled ? 'split' : 'single'} onChange={(e) => {
        const enabled = e.target.value === 'split'
        setSplitsEnabled(enabled)
        if (enabled) {
          if (!splits.length) addSplit()
        } else {
          setSplits([])
        }
      }}><option value="single">Categoria unica</option><option value="split">Aggiungi parziali</option></select></label>
      {splitsEnabled ? <div className="split-editor">
        <div className="split-editor__intro"><div><strong>Parziali dello scontrino</strong><small>Ogni parziale viene sottratto dalla categoria principale.</small></div><button className="button button--ghost" type="button" onClick={addSplit}><Plus />Aggiungi parziale</button></div>
        {splits.map((item, index) => <div className="split-row" key={item.id}>
          <label className="split-row__amount">Importo parziale<input aria-label={`Importo parziale ${index + 1}`} inputMode="decimal" placeholder="0,00" value={item.amount} onChange={(e) => updateSplit(item.id, { amount: e.target.value })} /></label>
          <CreatableLookup className="split-row__category" label={`Categoria parziale ${index + 1}`} value={item.categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={(value) => changeSplitCategoryQuery(item.id, value)} />
          <CreatableLookup className="split-row__beneficiary" label={`Beneficiario parziale ${index + 1}`} value={item.beneficiaryQuery} options={beneficiaries} placeholder="Inserisci beneficiario" onChange={(value) => changeSplitBeneficiaryQuery(item.id, value)} />
          <label className="split-row__sharing">Movimenti condivisi<select aria-label={`Movimenti condivisi parziale ${index + 1}`} value={selectedAccount?.scope === 'family' || item.shared ? 'family' : 'personal'} disabled={selectedAccount?.scope === 'family'} onChange={(e) => updateSplit(item.id, { shared: e.target.value === 'family' })}><option value="personal">No, solo personale</option><option value="family">Sì, condiviso</option></select></label>
          <button className="icon-button icon-button--danger split-row__remove" type="button" title={`Elimina parziale ${index + 1}`} onClick={() => setSplits((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 /></button>
        </div>)}
        <div className={`split-remainder ${splitTotal > numericAmount ? 'split-remainder--error' : ''}`}><span>Residuo nella categoria principale</span><strong>€ {mainRemainder.toFixed(2).replace('.', ',')}</strong></div>
        {submitted && splits.length === 0 ? <small className="field-error">Aggiungi almeno un parziale.</small> : null}
        {submitted && splits.some((item) => !item.categoryQuery.trim() || !Number(item.amount.replace(',', '.')) || Number(item.amount.replace(',', '.')) <= 0) ? <small className="field-error">Completa tutti i parziali con categoria e importo valido.</small> : null}
        {splitTotal > numericAmount ? <small className="field-error">La somma dei parziali non può superare l’importo totale.</small> : null}
      </div> : null}
    </section> : null}
    {isBeforeOpeningBalance ? <fieldset className="balance-impact-choice">
      <legend>Questo movimento è precedente al saldo iniziale del conto</legend>
      <p>Resterà sempre nelle statistiche. Scegli se deve modificare anche il saldo calcolato.</p>
      <label><input type="radio" name="balance-impact" checked={!affectsAccountBalance} onChange={() => setAffectsAccountBalance(false)} /><span><strong>Solo statistiche</strong><small>Non modifica il saldo del conto (consigliato).</small></span></label>
      <label><input type="radio" name="balance-impact" checked={affectsAccountBalance} onChange={() => setAffectsAccountBalance(true)} /><span><strong>Includi nel saldo</strong><small>Somma o sottrae l’importo anche dal saldo calcolato.</small></span></label>
    </fieldset> : null}
    {type === 'expense' && !initial && !commissioned ? <section className={`installment-box ${installmentsEnabled ? 'installment-box--active' : ''}`}>
      <button type="button" className="installment-toggle" onClick={() => {
        setInstallmentsEnabled((value) => !value)
      }}><CalendarClock /><span><strong>Rateizza</strong><small>Registra oggi la prima rata e programma le successive.</small></span><i aria-hidden="true"><span /></i></button>
      {installmentsEnabled ? <div className="installment-fields"><label>Intermediario<select value={provider} onChange={(e) => setProvider(e.target.value)}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label>{provider === 'Altro' ? <label>Nome intermediario<input value={customProvider} onChange={(e) => setCustomProvider(e.target.value)} placeholder="Es. carta del negozio" /></label> : null}<label>Numero di rate<select value={installmentCount} onChange={(e) => setInstallmentCount(Number(e.target.value))}><option value={3}>3 rate</option><option value={5}>5 rate</option></select></label></div> : null}
    </section> : null}
    {commissioned ? <div className="family-account-note"><ShoppingBag /><span><strong>Spesa per conto terzi</strong><small>Non è una spesa condivisa e non modifica i saldi familiari.</small></span></div> : personalOnly ? <div className="family-account-note"><LockKeyhole /><span><strong>Movimento personale</strong><small>In questa vista i movimenti restano privati e non partecipano a saldi familiari.</small></span></div> : initial ? <section className="sharing-edit-box">
      <label>Condivisione del movimento<select value={effectivelyShared ? 'family' : 'personal'} disabled={selectedAccount?.scope === 'family'} onChange={(event) => setMovementSharing(event.target.value === 'family')}><option value="personal">Movimento personale</option><option value="family">Movimento condiviso</option></select></label>
      <small>{selectedAccount?.scope === 'family' ? 'Il movimento resta condiviso perché utilizza un conto della famiglia.' : splits.length ? 'La scelta viene applicata anche a tutti i parziali del movimento.' : effectivelyShared ? `La quota viene ripartita al ${splitPercentage} tra i ${memberCount} membri.` : `Il movimento resta visibile soltanto a ${user.name}.`}</small>
    </section> : selectedAccount?.scope === 'family' ? <div className="family-account-note"><Landmark /><span><strong>{type === 'income' ? 'Entrata della famiglia' : 'Conto condiviso'}</strong><small>{type === 'income' ? 'L’entrata viene assegnata alla famiglia e accreditata sul conto condiviso.' : 'Questo movimento non modifica il debito o credito tra i membri.'}</small></span></div> : <button type="button" className={`share-toggle ${shared ? 'share-toggle--active' : ''}`} onClick={toggleShared}><span className="share-toggle__icon">{shared ? <Scale /> : <LockKeyhole />}</span><span><strong>{shared ? `${type === 'income' ? 'Entrata della famiglia' : 'Spesa condivisa con ' + sharedWithLabel}` : `${type === 'income' ? `Entrata di ${user.name}` : 'Spesa personale'}`}</strong><small>{shared ? (type === 'income' ? 'Verrà assegnata automaticamente al conto condiviso.' : `Verrà ripartita al ${splitPercentage} per ciascuno dei ${memberCount} membri.`) : `Verrà assegnata a ${user.name} e sarà visibile soltanto a te.`}</small></span><i aria-hidden="true"><span /></i></button>}
    <div className={`form-actions ${initial ? 'form-actions--edit' : ''}`}>{initial && onDelete ? <button className="button button--danger form-actions__delete" type="button" onClick={() => confirm(initial.installmentPlanId && initial.installmentNumber === 1 ? 'Eliminare questo acquisto e tutte le rate collegate?' : 'Eliminare definitivamente questo movimento?') && onDelete(initial.id)}><Trash2 />Elimina movimento</button> : null}<button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={saving}>{initial ? <Check /> : <Plus />}{saving ? 'Invio richiesta…' : initial ? 'Salva modifiche' : 'Salva movimento'}</button></div>
  </form>
}
