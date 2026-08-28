import { CalendarClock, Check, Landmark, LockKeyhole, Plus, Scale, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CreatableLookup } from '../components/CreatableLookup'
import { MovementTypeSelector } from '../components/MovementTypeSelector'
import { reimbursementPlan } from '../lib/calculations'
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
  splitId?: string
  reimbursementId?: string
  accountId?: string
}

interface Props {
  data: AppData
  user: User
  memberCount?: number
  familyName?: string
  onSave: (movement: Movement, additions: { category?: Category; categories?: Category[]; beneficiary?: Beneficiary; beneficiaries?: Beneficiary[]; sender?: Sender; tag?: Tag; scheduledPayments?: ScheduledPayment[] }) => void
  onCancel: () => void
  onDelete?: (id: string) => void
  initial?: Movement
  personalOnly?: boolean
  initialType?: MovementType
  onSelectTransfer?: () => void
  contacts?: Contact[]
  members?: User[]
  onCommissionedPurchase?: (draft: CommissionedPurchaseDraft) => Promise<void>
}

const providers = ['PayPal', 'Klarna', 'Scalapay', 'Amazon', 'Altro']
type PurchaseExpenseMode = 'personal' | 'shared' | 'commissioned' | 'reimbursement'
type SplitDraft = Omit<MovementSplit, 'amount'> & {
  amount: string
  categoryQuery: string
  beneficiaryQuery: string
  commissioned: boolean
  reimbursement: boolean
  commissionedRecipientId: string
  commissionedInviteEmail: string
}

function findByName<T extends { name: string }>(items: T[], value: string) {
  const normalized = value.trim().toLocaleLowerCase('it-IT')
  return items.find((item) => item.name.toLocaleLowerCase('it-IT') === normalized)
}

export function MovementForm({ data, user, memberCount = 2, familyName = 'Famiglia attiva', onSave, onCancel, onDelete, initial, personalOnly = false, initialType = 'expense', onSelectTransfer, contacts = [], members = [], onCommissionedPurchase }: Props) {
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
    commissioned: Boolean(item.commissionedPurchaseId),
    reimbursement: false,
    commissionedRecipientId: '',
    commissionedInviteEmail: '',
  })))
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false)
  const [installmentCount, setInstallmentCount] = useState(3)
  const [provider, setProvider] = useState('PayPal')
  const [customProvider, setCustomProvider] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [commissioned, setCommissioned] = useState(false)
  const [reimbursementPurchase, setReimbursementPurchase] = useState(false)
  const [commissionedRecipientId, setCommissionedRecipientId] = useState('')
  const [commissionedInviteEmail, setCommissionedInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestError, setRequestError] = useState('')
  const selectedAccount = data.accounts.find((item) => item.id === accountId)
  const effectivelyShared = !commissioned && !personalOnly && (selectedAccount?.scope === 'family' || shared)
  const isBeforeOpeningBalance = Boolean(date && selectedAccount?.openingBalanceDate && date < selectedAccount.openingBalanceDate)
  const splitPercentage = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 }).format(1 / Math.max(memberCount, 1))
  const numericAmount = Number(amount.replace(',', '.')) || 0
  const splitTotal = splits.reduce((sum, item) => sum + (Number(item.amount.replace(',', '.')) || 0), 0)
  const mainRemainder = Math.max(0, Math.round((numericAmount - splitTotal) * 100) / 100)
  const expenseBeneficiaryRequired = type === 'expense' && (
    !splitsEnabled
      ? !commissioned
      : splits.some((item) => !item.commissioned) || (mainRemainder > 0 && !commissioned)
  )
  const beneficiaryMissing = expenseBeneficiaryRequired && !beneficiaryQuery.trim() && (!initial || initial.type !== 'expense')
  const senderMissing = type === 'income' && !senderQuery.trim() && (!initial || initial.type !== 'income')
  const commissionedTargetMissing = commissioned && !commissionedRecipientId && !commissionedInviteEmail.trim()
  const hasCommissionedAllocation = commissioned || splits.some((item) => item.commissioned)
  const splitCommissionedTargetMissing = splits.some((item) => item.commissioned && !item.commissionedRecipientId && !item.commissionedInviteEmail.trim())
  const displayedAccounts = hasCommissionedAllocation ? personalAccounts : availableAccounts
  const reimbursementOptions = useMemo(
    () => personalOnly ? [] : reimbursementPlan(data, user.id, members.map((member) => member.id)),
    [data, members, personalOnly, user.id],
  )
  const reimbursementLimits = useMemo(
    () => new Map(reimbursementOptions.map((item) => [item.memberId, item.availableCredit])),
    [reimbursementOptions],
  )
  const reimbursementTotals = useMemo(() => {
    const totals = new Map<string, number>()
    if (commissioned && reimbursementPurchase && commissionedRecipientId) {
      totals.set(commissionedRecipientId, splitsEnabled ? mainRemainder : numericAmount)
    }
    for (const item of splits) {
      if (!item.reimbursement || !item.commissionedRecipientId) continue
      totals.set(item.commissionedRecipientId, (totals.get(item.commissionedRecipientId) ?? 0) + (Number(item.amount.replace(',', '.')) || 0))
    }
    return totals
  }, [commissioned, commissionedRecipientId, mainRemainder, numericAmount, reimbursementPurchase, splits, splitsEnabled])
  const reimbursementAmountsInvalid = [...reimbursementTotals].some(([memberId, value]) => value > (reimbursementLimits.get(memberId) ?? 0) + 0.001)

  const addSplit = () => {
    setSplits((items) => [...items, {
      id: makeId('movement-split'),
      amount: '',
      categoryId: '',
      categoryQuery: '',
      beneficiaryId: undefined,
      beneficiaryQuery: '',
      shared: false,
      commissioned: false,
      reimbursement: false,
      commissionedRecipientId: '',
      commissionedInviteEmail: '',
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

  const setMainPurchaseMode = (mode: PurchaseExpenseMode) => {
    const external = mode === 'commissioned' || mode === 'reimbursement'
    setCommissioned(external)
    setReimbursementPurchase(mode === 'reimbursement')
    setShared(mode === 'shared')
    setCommissionedRecipientId(mode === 'reimbursement' ? reimbursementOptions[0]?.memberId ?? '' : '')
    setCommissionedInviteEmail('')
    if (mode !== 'shared' && selectedAccount?.scope === 'family') selectAccount(personalAccounts[0]?.id ?? '')
  }

  const changeSplitCategoryQuery = (id: string, value: string) => {
    updateSplit(id, { categoryQuery: value, categoryId: findByName(categories, value)?.id ?? '' })
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
    setCommissioned(false)
    setReimbursementPurchase(false)
    setCommissionedRecipientId('')
    setCommissionedInviteEmail('')
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
    const mainCommissionedContact = contacts.find((contact) => contact.id === commissionedRecipientId)
    const resolvedMainCategoryName = commissioned ? 'Acquisti per conto terzi' : categoryName
    const resolvedMainBeneficiaryName = commissioned ? mainCommissionedContact?.name ?? 'Contatto' : beneficiaryName
    const invalidSplits = splitsEnabled && (
      splits.length === 0
      || splits.some((item) => (!item.commissioned && !item.categoryQuery.trim()) || !Number(item.amount.replace(',', '.')) || Number(item.amount.replace(',', '.')) <= 0)
      || splitTotal > numericAmount
    )
    const mainAllocationRequired = !splitsEnabled || mainRemainder > 0
    if (!numericAmount || numericAmount <= 0 || !accountId || (mainAllocationRequired && !commissioned && !categoryName) || beneficiaryMissing || senderMissing || invalidSplits || commissionedTargetMissing || splitCommissionedTargetMissing || reimbursementAmountsInvalid || (hasCommissionedAllocation && !description.trim())) return
    const categoryMatch = findByName(categories, resolvedMainCategoryName)
    const beneficiaryMatch = findByName(beneficiaries, resolvedMainBeneficiaryName)
    const senderMatch = findByName(senders, senderName)
    const category = resolvedMainCategoryName && !categoryMatch ? { id: makeId('category'), name: resolvedMainCategoryName, scope: commissioned ? 'personal' as const : effectivelyShared ? 'family' as const : 'personal' as const, ownerId: commissioned || !effectivelyShared ? user.id : undefined, movementType: type, color: type === 'income' ? '#3f7650' : '#c64e2f' } : undefined
    const userBeneficiaryId = `beneficiary-user-${user.id}`
    const beneficiary = type === 'income'
      ? (data.beneficiaries.some((item) => item.id === userBeneficiaryId) ? undefined : { id: userBeneficiaryId, name: user.name, scope: 'personal' as const, ownerId: user.id })
      : (resolvedMainBeneficiaryName && !beneficiaryMatch ? { id: makeId('beneficiary'), name: resolvedMainBeneficiaryName, scope: commissioned ? 'personal' as const : effectivelyShared ? 'family' as const : 'personal' as const, ownerId: commissioned || !effectivelyShared ? user.id : undefined } : undefined)
    const sender = type === 'income' && senderName && !senderMatch
      ? { id: makeId('sender'), name: senderName, scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id }
      : undefined
    const tag = newTag.trim() ? { id: makeId('tag'), name: newTag.trim(), scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, color: '#c64e2f' } : undefined
    const resolvedCategoryId = category?.id ?? categoryMatch?.id ?? categoryId
    const resolvedBeneficiaryId = type === 'income'
      ? userBeneficiaryId
      : resolvedMainBeneficiaryName ? beneficiary?.id ?? beneficiaryMatch?.id ?? beneficiaryId : undefined
    const resolvedSenderId = type === 'income' && senderName ? sender?.id ?? senderMatch?.id ?? senderId : undefined
    const resolvedTagId = tag?.id ?? (tagId || undefined)
    const resolvedDescription = description.trim() || categoryName || 'Movimento'
    const resolvedComments = comments.trim() || undefined
    const shouldInstall = type === 'expense' && installmentsEnabled && !initial
    const planId = shouldInstall ? makeId('installment-plan') : undefined
    const amounts = shouldInstall ? splitAmount(numericAmount, installmentCount) : [numericAmount]
    const movementId = initial?.id ?? makeId('movement')
    const mainCommissionedAmount = commissioned ? (splitsEnabled ? mainRemainder : numericAmount) : 0
    const purchaseId = mainCommissionedAmount > 0 ? makeId('commissioned-purchase') : undefined
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
    const commissionedDrafts: CommissionedPurchaseDraft[] = []
    const resolvedSplits = type === 'expense' && splitsEnabled
      ? splits.map((item) => {
        const categoryName = item.commissioned ? 'Acquisti per conto terzi' : item.categoryQuery.trim()
        const selectedContact = contacts.find((contact) => contact.id === item.commissionedRecipientId)
        const splitBeneficiaryName = item.commissioned ? selectedContact?.name ?? 'Contatto' : beneficiaryName
        let resolvedSplitCategory = findByName(categories, categoryName) ?? findByName(newSplitCategories, categoryName)
        if (!resolvedSplitCategory && category?.name.toLocaleLowerCase('it-IT') === categoryName.toLocaleLowerCase('it-IT')) resolvedSplitCategory = category
        if (!resolvedSplitCategory) {
          resolvedSplitCategory = {
            id: makeId('category'),
            name: categoryName,
            scope: !item.commissioned && (selectedAccount?.scope === 'family' || item.shared) ? 'family' : 'personal',
            ownerId: !item.commissioned && (selectedAccount?.scope === 'family' || item.shared) ? undefined : user.id,
            movementType: 'expense',
            color: '#c64e2f',
          }
          newSplitCategories.push(resolvedSplitCategory)
        }
        let resolvedSplitBeneficiary = item.commissioned && splitBeneficiaryName
          ? findByName(beneficiaries, splitBeneficiaryName) ?? findByName(newSplitBeneficiaries, splitBeneficiaryName)
          : beneficiary ?? beneficiaryMatch
        if (!resolvedSplitBeneficiary && beneficiary?.name.toLocaleLowerCase('it-IT') === splitBeneficiaryName.toLocaleLowerCase('it-IT')) resolvedSplitBeneficiary = beneficiary
        if (item.commissioned && splitBeneficiaryName && !resolvedSplitBeneficiary) {
          resolvedSplitBeneficiary = {
            id: makeId('beneficiary'),
            name: splitBeneficiaryName,
            scope: !item.commissioned && (selectedAccount?.scope === 'family' || item.shared) ? 'family' : 'personal',
            ownerId: !item.commissioned && (selectedAccount?.scope === 'family' || item.shared) ? undefined : user.id,
          }
          newSplitBeneficiaries.push(resolvedSplitBeneficiary)
        }
        const commissionedPurchaseId = item.commissioned ? makeId('commissioned-purchase') : undefined
        if (commissionedPurchaseId) commissionedDrafts.push({
          id: commissionedPurchaseId,
          movementId: '',
          recipientId: item.commissionedRecipientId || undefined,
          inviteEmail: item.reimbursement ? undefined : item.commissionedInviteEmail.trim() || undefined,
          amount: Math.round(Number(item.amount.replace(',', '.')) * 100) / 100,
          purchaseDate: date,
          description: description.trim(),
          splitId: item.id,
          reimbursementId: item.reimbursement ? makeId('reimbursement') : undefined,
          accountId,
        })
        return {
          id: item.id,
          amount: Math.round(Number(item.amount.replace(',', '.')) * 100) / 100,
          categoryId: resolvedSplitCategory.id,
          beneficiaryId: resolvedSplitBeneficiary?.id,
          tagId: item.tagId,
          shared: !item.commissioned && (selectedAccount?.scope === 'family' || item.shared),
          commissionedPurchaseId,
          excludeFromReports: item.commissioned || undefined,
        }
      })
      : undefined
    const primaryCategoryId = resolvedCategoryId || resolvedSplits?.[0]?.categoryId || ''
    const primaryBeneficiaryId = resolvedBeneficiaryId || resolvedSplits?.[0]?.beneficiaryId
    const installmentAllocations = shouldInstall && resolvedSplits
      ? splitAllocationsAcrossInstallments([mainRemainder, ...resolvedSplits.map((item) => item.amount)], amounts)
      : undefined
    const splitsForInstallment = (index: number) => resolvedSplits?.map((item, splitIndex) => ({
      ...item,
      amount: installmentAllocations?.[index]?.[splitIndex + 1] ?? item.amount,
    }))
    const sharedPurchaseAmount = Math.round((
      (effectivelyShared ? mainRemainder : 0)
      + (resolvedSplits ?? []).filter((item) => item.shared && !item.excludeFromReports).reduce((sum, item) => sum + item.amount, 0)
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
        categoryId: primaryCategoryId,
        beneficiaryId: primaryBeneficiaryId,
        accountId,
        tagId: resolvedTagId,
        comments: resolvedComments,
        shared: effectivelyShared,
        splits: splitsForInstallment(index + 1),
        provider: resolvedProvider,
        installmentNumber: index + 2,
        installmentCount,
        status: 'scheduled',
        commissionedPurchaseId: purchaseId,
        ...(selectedAccount?.openingBalanceDate && dueDate < selectedAccount.openingBalanceDate ? { affectsAccountBalance } : {}),
      }
    }) : []
    // Il rimborso tramite acquisto riusa la richiesta commissionata: l'ID collega conferma e compensazione.
    if (purchaseId) commissionedDrafts.unshift({
      id: purchaseId, movementId, recipientId: commissionedRecipientId || undefined,
      inviteEmail: reimbursementPurchase ? undefined : commissionedInviteEmail.trim() || undefined, amount: mainCommissionedAmount,
      purchaseDate: date, description: description.trim(),
      reimbursementId: reimbursementPurchase ? makeId('reimbursement') : undefined,
      accountId,
    })
    commissionedDrafts.forEach((draft) => { draft.movementId = movementId })
    const allAllocationsCommissioned = (mainRemainder === 0 || Boolean(purchaseId)) && (resolvedSplits ?? []).every((item) => item.excludeFromReports)
    const movement: Movement = {
      id: movementId,
      type,
      authorId: initial?.authorId ?? user.id,
      memberId: user.id,
      amount: amounts[0],
      date,
      description: shouldInstall ? `${resolvedDescription} · rata 1/${installmentCount}` : resolvedDescription,
      categoryId: primaryCategoryId,
      beneficiaryId: primaryBeneficiaryId,
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
      excludeFromReports: allAllocationsCommissioned || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }
    if (commissionedDrafts.length && onCommissionedPurchase) {
      setSaving(true)
      try {
        setRequestError('')
        for (const draft of commissionedDrafts) await onCommissionedPurchase(draft)
      } catch (reason) {
        setRequestError(reason instanceof Error ? reason.message : 'Non è stato possibile inviare la richiesta.')
        setSaving(false)
        return
      } finally { setSaving(false) }
    }
    onSave(movement, { category, categories: newSplitCategories, beneficiary, beneficiaries: newSplitBeneficiaries, sender, tag, scheduledPayments })
  }

  const mainTagField = <><label>Tag<select value={newTag ? '__new' : tagId} onChange={(event) => event.target.value === '__new' ? setNewTag('Nuovo tag') : (setNewTag(''), setTagId(event.target.value))}><option value="">Nessun tag</option>{tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new">+ Crea nuovo tag</option></select></label>{newTag ? <label>Nome nuovo tag<input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Es. Vacanza a Parigi" /></label> : null}</>
  const mainSharingField = <label>Spesa condivisa con<select value="family" onChange={() => setMovementSharing(true)}><option value="family">{familyName}</option></select>{selectedAccount?.scope === 'family' ? <small>Il conto appartiene alla famiglia selezionata.</small> : null}</label>
  const mainCommissionFields = <div className="installment-fields"><label>Committente<select value={commissionedRecipientId} onChange={(event) => { setCommissionedRecipientId(event.target.value); setCommissionedInviteEmail('') }}><option value="">Invita un nuovo contatto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.source === 'family' ? ' · famiglia' : ''}</option>)}</select></label>{!commissionedRecipientId ? <label>Email da invitare<input type="email" value={commissionedInviteEmail} onChange={(event) => setCommissionedInviteEmail(event.target.value)} placeholder="nome@email.it" required /></label> : null}<small>Il committente riceverà la richiesta e catalogherà l’acquisto nella propria contabilità.</small>{submitted && commissionedTargetMissing ? <small className="field-error">Scegli un contatto o inserisci l’email da invitare.</small> : null}</div>
  const reimbursementMemberName = (memberId: string) => members.find((member) => member.id === memberId)?.name ?? 'Membro della famiglia'
  const reimbursementOptionsMarkup = reimbursementOptions.map((item) => <option key={item.memberId} value={item.memberId}>{reimbursementMemberName(item.memberId)} · fino a € {item.availableCredit.toFixed(2).replace('.', ',')}</option>)
  const mainReimbursementFields = <div className="installment-fields"><label>Rimborso a<select value={commissionedRecipientId} onChange={(event) => { setCommissionedRecipientId(event.target.value); setCommissionedInviteEmail('') }}><option value="">Scegli il membro da rimborsare</option>{reimbursementOptionsMarkup}</select></label><small>L’acquisto compensa il debito verso il membro scelto. Dopo la conferma, sarà lui a catalogarlo nella propria contabilità.</small>{submitted && commissionedTargetMissing ? <small className="field-error">Scegli il membro della famiglia da rimborsare.</small> : null}</div>

  return <form className="expense-form movement-form" onSubmit={submit}>
    <MovementTypeSelector value={type} includeTransfer={!initial && Boolean(onSelectTransfer)} onChange={(nextType) => nextType === 'transfer' ? onSelectTransfer?.() : changeType(nextType)} />
    <div className={`amount-field ${type === 'income' ? 'amount-field--income' : ''}`}>
      <label htmlFor="amount">Importo {installmentsEnabled ? 'totale' : ''}</label><div><span>€</span><input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus /></div>
      {submitted && (!numericAmount || numericAmount <= 0) ? <small>Inserisci un importo valido.</small> : null}
    </div>
    <label>{type === 'expense' ? 'Conto di addebito' : 'Conto di destinazione'}<select value={accountId} onChange={(event) => selectAccount(event.target.value)}>{displayedAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.scope === 'family' ? ' · famiglia' : ` · ${user.name}`}</option>)}</select></label>
    {type === 'expense' && !initial ? <section className={`installment-box ${installmentsEnabled ? 'installment-box--active' : ''}`}>
      <button type="button" className="installment-toggle" onClick={() => setInstallmentsEnabled((value) => !value)}><CalendarClock /><span><strong>Pagamento a rate</strong><small>L’importo resta il totale; il conto verrà addebitato con i pagamenti programmati.</small></span><i aria-hidden="true"><span /></i></button>
      {installmentsEnabled ? <div className="installment-fields"><label>Intermediario<select value={provider} onChange={(event) => setProvider(event.target.value)}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label>{provider === 'Altro' ? <label>Nome intermediario<input value={customProvider} onChange={(event) => setCustomProvider(event.target.value)} placeholder="Es. carta del negozio" /></label> : null}<label>Numero di rate<select value={installmentCount} onChange={(event) => setInstallmentCount(Number(event.target.value))}><option value={3}>3 rate</option><option value={5}>5 rate</option></select></label></div> : null}
    </section> : null}
    <div className="form-grid">
      {type === 'expense'
        ? (expenseBeneficiaryRequired ? <CreatableLookup label="Beneficiario" value={beneficiaryQuery} options={beneficiaries} placeholder="Inserisci beneficiario" onChange={changeBeneficiaryQuery} error={submitted && beneficiaryMissing ? 'Inserisci un beneficiario.' : undefined} /> : null)
        : <CreatableLookup label="Mittente" value={senderQuery} options={senders} placeholder="Inserisci mittente" onChange={changeSenderQuery} error={submitted && senderMissing ? 'Inserisci un mittente.' : undefined} />}
      <label>Data<input type="date" value={date} onChange={(event) => changeDate(event.target.value)} required /></label>
    </div>
    <label>Descrizione<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={type === 'income' ? 'Es. Stipendio luglio' : 'Es. Spesa settimanale'} /></label>
    <label>Commenti<textarea value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Dettagli facoltativi sul movimento" rows={3} /></label>

    {type === 'income' ? <div className="form-grid"><CreatableLookup label="Categoria" value={categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={changeCategoryQuery} error={submitted && !categoryQuery.trim() ? 'Inserisci una categoria.' : undefined} />{mainTagField}</div> : <section className={`split-box ${splitsEnabled ? 'split-box--active' : ''}`}>
      <label className="split-selector">Tipo di acquisto<select aria-label="Tipo di acquisto" value={splitsEnabled ? 'multiple' : 'single'} onChange={(event) => {
        const multiple = event.target.value === 'multiple'; setSplitsEnabled(multiple)
        if (multiple && !splits.length) addSplit()
        if (!multiple) setSplits([])
      }}><option value="single">Acquisto unico</option><option value="multiple">Acquisto multiplo</option></select></label>

      {splitsEnabled ? <div className="split-editor">
        <div className="split-editor__intro"><div><strong>Voci dell’acquisto</strong><small>Ogni riga può essere ordinaria, effettuata per un’altra persona oppure usata come rimborso.</small></div><button className="button button--ghost" type="button" disabled={mainRemainder <= 0} onClick={addSplit}><Plus />Aggiungi categoria</button></div>
        {splits.map((item, index) => <div className="split-row split-row--purchase" key={item.id}>
          <label className="split-row__amount">Importo parziale<input aria-label={`Importo parziale ${index + 1}`} inputMode="decimal" placeholder="0,00" value={item.amount} onChange={(event) => updateSplit(item.id, { amount: event.target.value })} /></label>
          <label>Tipo di spesa<select aria-label={`Tipo di spesa parziale ${index + 1}`} value={item.reimbursement ? 'reimbursement' : item.commissioned ? 'commissioned' : selectedAccount?.scope === 'family' || item.shared ? 'shared' : 'personal'} onChange={(event) => {
            const value = event.target.value as PurchaseExpenseMode
            const external = value === 'commissioned' || value === 'reimbursement'
            updateSplit(item.id, { commissioned: external, reimbursement: value === 'reimbursement', shared: value === 'shared', commissionedRecipientId: value === 'reimbursement' ? reimbursementOptions[0]?.memberId ?? '' : '', commissionedInviteEmail: '' })
            if (value !== 'shared' && selectedAccount?.scope === 'family') selectAccount(personalAccounts[0]?.id ?? '')
          }}><option value="personal">Spesa personale</option><option value="shared">Spesa condivisa</option>{onCommissionedPurchase ? <option value="commissioned">Acquisto per conto di un’altra persona</option> : null}<option value="reimbursement" disabled={!reimbursementOptions.length}>Rimborso tramite acquisto</option></select></label>
          {item.commissioned ? item.reimbursement
            ? <label>Rimborso a<select value={item.commissionedRecipientId} onChange={(event) => updateSplit(item.id, { commissionedRecipientId: event.target.value, commissionedInviteEmail: '' })}><option value="">Scegli il membro da rimborsare</option>{reimbursementOptionsMarkup}</select></label>
            : <><label>Committente<select value={item.commissionedRecipientId} onChange={(event) => updateSplit(item.id, { commissionedRecipientId: event.target.value, commissionedInviteEmail: '' })}><option value="">Invita un nuovo contatto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.source === 'family' ? ' · famiglia' : ''}</option>)}</select></label>{!item.commissionedRecipientId ? <label>Email da invitare<input type="email" value={item.commissionedInviteEmail} onChange={(event) => updateSplit(item.id, { commissionedInviteEmail: event.target.value })} placeholder="nome@email.it" /></label> : null}</>
            : <><CreatableLookup className="split-row__category" label={`Categoria parziale ${index + 1}`} value={item.categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={(value) => changeSplitCategoryQuery(item.id, value)} /><label>Tag<select value={item.tagId ?? ''} onChange={(event) => updateSplit(item.id, { tagId: event.target.value || undefined })}><option value="">Nessun tag</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>{(selectedAccount?.scope === 'family' || item.shared) ? <label>Spesa condivisa con<select aria-label={`Famiglia spesa parziale ${index + 1}`} value="family"><option value="family">{familyName}</option></select></label> : null}</>}
          <button className="icon-button icon-button--danger split-row__remove" type="button" title={`Elimina parziale ${index + 1}`} onClick={() => setSplits((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 /></button>
        </div>)}
        {mainRemainder > 0 ? <div className="split-row split-row--purchase split-row--remainder"><div className="split-remainder"><span>Importo residuo</span><strong>€ {mainRemainder.toFixed(2).replace('.', ',')}</strong></div><label>Tipo di spesa<select value={reimbursementPurchase ? 'reimbursement' : commissioned ? 'commissioned' : effectivelyShared ? 'shared' : 'personal'} onChange={(event) => setMainPurchaseMode(event.target.value as PurchaseExpenseMode)}><option value="personal">Spesa personale</option><option value="shared">Spesa condivisa</option>{onCommissionedPurchase ? <option value="commissioned">Acquisto per conto di un’altra persona</option> : null}<option value="reimbursement" disabled={!reimbursementOptions.length}>Rimborso tramite acquisto</option></select></label>{commissioned ? reimbursementPurchase ? mainReimbursementFields : mainCommissionFields : <><CreatableLookup label="Categoria residua" value={categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={changeCategoryQuery} />{mainTagField}{effectivelyShared ? mainSharingField : null}</>}</div> : null}
        {submitted && splits.some((item) => (!item.commissioned && !item.categoryQuery.trim()) || !Number(item.amount.replace(',', '.')) || Number(item.amount.replace(',', '.')) <= 0) ? <small className="field-error">Completa ogni riga con destinazione, categoria e importo valido.</small> : null}
        {submitted && splitCommissionedTargetMissing ? <small className="field-error">Scegli il committente per ogni acquisto effettuato per un’altra persona.</small> : null}
        {submitted && reimbursementAmountsInvalid ? <small className="field-error">L’importo usato come rimborso supera il credito disponibile del membro scelto.</small> : null}
        {splitTotal > numericAmount ? <small className="field-error">La somma dei parziali non può superare l’importo totale.</small> : null}
      </div> : <div className="single-purchase-fields">
        {!initial ? <label>Tipo di spesa<select value={reimbursementPurchase ? 'reimbursement' : commissioned ? 'commissioned' : effectivelyShared ? 'shared' : 'personal'} onChange={(event) => setMainPurchaseMode(event.target.value as PurchaseExpenseMode)}><option value="personal">Spesa personale</option><option value="shared">Spesa condivisa</option>{onCommissionedPurchase ? <option value="commissioned">Acquisto per conto di un’altra persona</option> : null}<option value="reimbursement" disabled={!reimbursementOptions.length}>Rimborso tramite acquisto</option></select></label> : null}
        {commissioned ? reimbursementPurchase ? mainReimbursementFields : mainCommissionFields : null}
        {!commissioned ? <div className="form-grid"><CreatableLookup label="Categoria" value={categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={changeCategoryQuery} error={submitted && !categoryQuery.trim() ? 'Inserisci una categoria.' : undefined} />{mainTagField}{effectivelyShared ? mainSharingField : null}</div> : null}
      </div>}
    </section>}
    {submitted && hasCommissionedAllocation && !description.trim() ? <small className="field-error">Inserisci una descrizione riconoscibile per chi riceverà la richiesta.</small> : null}
    {requestError ? <small className="field-error">{requestError}</small> : null}
    {isBeforeOpeningBalance ? <fieldset className="balance-impact-choice">
      <legend>Questo movimento è precedente al saldo iniziale del conto</legend>
      <p>Resterà sempre nelle statistiche. Scegli se deve modificare anche il saldo calcolato.</p>
      <label><input type="radio" name="balance-impact" checked={!affectsAccountBalance} onChange={() => setAffectsAccountBalance(false)} /><span><strong>Solo statistiche</strong><small>Non modifica il saldo del conto (consigliato).</small></span></label>
      <label><input type="radio" name="balance-impact" checked={affectsAccountBalance} onChange={() => setAffectsAccountBalance(true)} /><span><strong>Includi nel saldo</strong><small>Somma o sottrae l’importo anche dal saldo calcolato.</small></span></label>
    </fieldset> : null}
    {personalOnly ? <div className="family-account-note"><LockKeyhole /><span><strong>Movimento personale</strong><small>In questa vista i movimenti restano privati e non partecipano a saldi familiari.</small></span></div> : initial ? <section className="sharing-edit-box">
      <label>Condivisione del movimento<select value={effectivelyShared ? 'family' : 'personal'} disabled={selectedAccount?.scope === 'family'} onChange={(event) => setMovementSharing(event.target.value === 'family')}><option value="personal">Movimento personale</option><option value="family">Movimento condiviso</option></select></label>
      <small>{selectedAccount?.scope === 'family' ? 'Il movimento resta condiviso perché utilizza un conto della famiglia.' : splits.length ? 'La scelta viene applicata anche a tutti i parziali del movimento.' : effectivelyShared ? `La quota viene ripartita al ${splitPercentage} tra i ${memberCount} membri.` : `Il movimento resta visibile soltanto a ${user.name}.`}</small>
    </section> : type === 'income' ? (selectedAccount?.scope === 'family' ? <div className="family-account-note"><Landmark /><span><strong>Entrata della famiglia</strong><small>L’entrata viene assegnata al conto condiviso.</small></span></div> : <button type="button" className={`share-toggle ${shared ? 'share-toggle--active' : ''}`} onClick={toggleShared}><span className="share-toggle__icon">{shared ? <Scale /> : <LockKeyhole />}</span><span><strong>{shared ? 'Entrata della famiglia' : `Entrata di ${user.name}`}</strong><small>{shared ? 'Verrà assegnata automaticamente al conto condiviso.' : `Verrà assegnata a ${user.name} e sarà visibile soltanto a te.`}</small></span><i aria-hidden="true"><span /></i></button>) : null}
    <div className={`form-actions ${initial ? 'form-actions--edit' : ''}`}>{initial && onDelete ? <button className="button button--danger form-actions__delete" type="button" onClick={() => confirm(initial.installmentPlanId && initial.installmentNumber === 1 ? 'Eliminare questo acquisto e tutte le rate collegate?' : 'Eliminare definitivamente questo movimento?') && onDelete(initial.id)}><Trash2 />Elimina movimento</button> : null}<button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={saving}>{initial ? <Check /> : <Plus />}{saving ? 'Invio richiesta…' : initial ? 'Salva modifiche' : 'Salva movimento'}</button></div>
  </form>
}
