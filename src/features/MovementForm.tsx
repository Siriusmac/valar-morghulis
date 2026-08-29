import { CalendarClock, Check, Landmark, LockKeyhole, Plus, Scale, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CreatableLookup } from '../components/CreatableLookup'
import { MovementTypeSelector, type ComposerType } from '../components/MovementTypeSelector'
import { reimbursementPlan } from '../lib/calculations'
import { debtCompensationAccountId, debtCompensationAccountLabel } from '../lib/commissioned'
import { addMonthsISO, makeId, splitAllocationsAcrossInstallments, splitAmount, todayISO } from '../lib/format'
import { functionErrorMessage } from '../lib/functionErrors'
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
  onSave: (movement: Movement, additions: { category?: Category; categories?: Category[]; beneficiary?: Beneficiary; beneficiaries?: Beneficiary[]; sender?: Sender; tag?: Tag; tags?: Tag[]; scheduledPayments?: ScheduledPayment[] }) => void
  onCancel: () => void
  onDelete?: (id: string) => void
  initial?: Movement
  personalOnly?: boolean
  initialType?: MovementType
  initialComposerType?: ComposerType
  onSelectTransfer?: () => void
  contacts?: Contact[]
  members?: User[]
  onCommissionedPurchase?: (draft: CommissionedPurchaseDraft) => Promise<void>
}

const providers = ['PayPal', 'Klarna', 'Scalapay', 'Amazon', 'Altro']
type PurchaseExpenseMode = 'personal' | 'shared' | 'commissioned' | 'reimbursement'
type RomanParticipant = { contactId: string; compensateDebt: boolean }
type SplitDraft = Omit<MovementSplit, 'amount'> & {
  amount: string
  categoryQuery: string
  beneficiaryQuery: string
  tagQuery: string
  commissioned: boolean
  reimbursement: boolean
  commissionedRecipientId: string
  commissionedInviteEmail: string
  existingCommissionedPurchaseId?: string
}

function findByName<T extends { name: string }>(items: T[], value: string) {
  const normalized = value.trim().toLocaleLowerCase('it-IT')
  return items.find((item) => item.name.toLocaleLowerCase('it-IT') === normalized)
}

function installmentPlanDraft(data: AppData, initial?: Movement) {
  if (!initial?.installmentPlanId || initial.installmentNumber !== 1) return undefined
  const entries = new Map<number, Movement | ScheduledPayment>()
  for (const payment of data.scheduledPayments.filter((item) => item.planId === initial.installmentPlanId)) {
    entries.set(payment.installmentNumber, payment)
  }
  for (const movement of data.movements.filter((item) => item.installmentPlanId === initial.installmentPlanId)) {
    if (movement.installmentNumber) entries.set(movement.installmentNumber, movement)
  }
  entries.set(1, initial)
  const ordered = [...entries.values()].toSorted((left, right) => (left.installmentNumber ?? 0) - (right.installmentNumber ?? 0))
  const splitTemplates = initial.splits ?? []
  const splitAmounts = splitTemplates.map((template, index) => ordered.reduce((total, entry) => {
    const matching = entry.splits?.find((split) => template.commissionedPurchaseId
      ? split.commissionedPurchaseId === template.commissionedPurchaseId
      : split.id === template.id) ?? entry.splits?.[index]
    return total + (matching?.amount ?? 0)
  }, 0))
  return {
    total: ordered.reduce((total, entry) => total + entry.amount, 0),
    description: initial.description.replace(/\s*·\s*rata\s+\d+\/\d+\s*$/i, '').trim(),
    splits: splitTemplates.map((split, index) => ({ ...split, amount: splitAmounts[index] })),
    count: initial.installmentCount ?? ordered.length,
    provider: initial.installmentProvider ?? data.scheduledPayments.find((item) => item.planId === initial.installmentPlanId)?.provider ?? 'Altro',
    dueDates: Object.fromEntries(data.scheduledPayments.filter((item) => item.planId === initial.installmentPlanId).map((item) => [item.installmentNumber, item.dueDate])),
  }
}

export function MovementForm({ data, user, memberCount = 2, familyName = 'Famiglia attiva', onSave, onCancel, onDelete, initial, personalOnly = false, initialType, initialComposerType, onSelectTransfer, contacts = [], members = [], onCommissionedPurchase }: Props) {
  const initialPlan = installmentPlanDraft(data, initial)
  const [composerSelected, setComposerSelected] = useState(Boolean(initial || initialType || initialComposerType))
  const [type, setType] = useState<MovementType>(initial?.type ?? initialType ?? 'expense')
  const [romanMode, setRomanMode] = useState(!initial && initialComposerType === 'roman')
  const [romanContactId, setRomanContactId] = useState('')
  const [romanParticipants, setRomanParticipants] = useState<RomanParticipant[]>([])
  const [amount, setAmount] = useState(initialPlan?.total.toString() ?? initial?.amount.toString() ?? '')
  const [description, setDescription] = useState(initialPlan?.description ?? initial?.description ?? '')
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
  const [tagQuery, setTagQuery] = useState(() => data.tags.find((item) => item.id === initial?.tagId)?.name ?? '')
  const [splitsEnabled, setSplitsEnabled] = useState(Boolean(initial?.splits?.length))
  const [splits, setSplits] = useState<SplitDraft[]>(() => (initialPlan?.splits ?? initial?.splits ?? []).map((item) => ({
    ...item,
    amount: item.amount.toString(),
    categoryQuery: data.categories.find((category) => category.id === item.categoryId)?.name ?? '',
    beneficiaryQuery: data.beneficiaries.find((beneficiary) => beneficiary.id === item.beneficiaryId)?.name ?? '',
    tagQuery: data.tags.find((tag) => tag.id === item.tagId)?.name ?? '',
    commissioned: Boolean(item.commissionedPurchaseId),
    reimbursement: false,
    commissionedRecipientId: '',
    commissionedInviteEmail: '',
    existingCommissionedPurchaseId: item.commissionedPurchaseId,
  })))
  const [installmentsEnabled, setInstallmentsEnabled] = useState(Boolean(initialPlan))
  const [installmentCount, setInstallmentCount] = useState(initialPlan?.count ?? 3)
  const [provider, setProvider] = useState(() => providers.includes(initialPlan?.provider ?? '') ? initialPlan!.provider : initialPlan ? 'Altro' : 'PayPal')
  const [customProvider, setCustomProvider] = useState(() => initialPlan && !providers.includes(initialPlan.provider) ? initialPlan.provider : '')
  const [installmentDueDates, setInstallmentDueDates] = useState<Record<number, string>>(initialPlan?.dueDates ?? {})
  const [submitted, setSubmitted] = useState(false)
  const [commissioned, setCommissioned] = useState(false)
  const [reimbursementPurchase, setReimbursementPurchase] = useState(false)
  const [commissionedRecipientId, setCommissionedRecipientId] = useState('')
  const [commissionedInviteEmail, setCommissionedInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestError, setRequestError] = useState('')
  const isDebtCompensationMovement = initial?.accountId === debtCompensationAccountId
  const selectedAccount = data.accounts.find((item) => item.id === accountId)
  const effectivelyShared = !commissioned && !personalOnly && (selectedAccount?.scope === 'family' || shared)
  const isBeforeOpeningBalance = Boolean(date && selectedAccount?.openingBalanceDate && date < selectedAccount.openingBalanceDate)
  const splitPercentage = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 }).format(1 / Math.max(memberCount, 1))
  const numericAmount = Number(amount.replace(',', '.')) || 0
  const romanShares = splitAmount(numericAmount, romanParticipants.length + 1)
  const romanSplits: SplitDraft[] = romanParticipants.map((participant, index) => ({
    id: `roman-${participant.contactId}`,
    amount: (romanShares[index + 1] ?? 0).toFixed(2),
    categoryId: '', categoryQuery: '', beneficiaryQuery: '', tagQuery: '', shared: false,
    commissioned: true, reimbursement: participant.compensateDebt,
    commissionedRecipientId: participant.contactId, commissionedInviteEmail: '',
  }))
  const activeSplits = romanMode ? romanSplits : splits
  const activeSplitsEnabled = romanMode || splitsEnabled
  const splitTotal = activeSplits.reduce((sum, item) => sum + (Number(item.amount.replace(',', '.')) || 0), 0)
  const mainRemainder = Math.max(0, Math.round((numericAmount - splitTotal) * 100) / 100)
  const expenseBeneficiaryRequired = type === 'expense' && (
    !activeSplitsEnabled
      ? !commissioned
      : activeSplits.some((item) => !item.commissioned) || (mainRemainder > 0 && !commissioned)
  )
  const beneficiaryMissing = expenseBeneficiaryRequired && !beneficiaryQuery.trim() && (!initial || initial.type !== 'expense')
  const senderMissing = type === 'income' && !senderQuery.trim() && (!initial || initial.type !== 'income')
  const commissionedTargetMissing = commissioned && !commissionedRecipientId && !commissionedInviteEmail.trim()
  const hasCommissionedAllocation = commissioned || activeSplits.some((item) => item.commissioned)
  const splitCommissionedTargetMissing = activeSplits.some((item) => item.commissioned && !item.existingCommissionedPurchaseId && !item.commissionedRecipientId && !item.commissionedInviteEmail.trim())
  const displayedAccounts = hasCommissionedAllocation ? personalAccounts : availableAccounts
  const reimbursementOptions = useMemo(
    () => personalOnly ? [] : reimbursementPlan(data, user.id, members.map((member) => member.id)),
    [data, members, personalOnly, user.id],
  )
  const reimbursementLimits = useMemo(
    () => new Map(reimbursementOptions.map((item) => [item.memberId, item.availableCredit])),
    [reimbursementOptions],
  )
  const reimbursementTotals = (() => {
    const totals = new Map<string, number>()
    if (commissioned && reimbursementPurchase && commissionedRecipientId) {
      totals.set(commissionedRecipientId, activeSplitsEnabled ? mainRemainder : numericAmount)
    }
    for (const item of activeSplits) {
      if (!item.reimbursement || !item.commissionedRecipientId) continue
      totals.set(item.commissionedRecipientId, (totals.get(item.commissionedRecipientId) ?? 0) + (Number(item.amount.replace(',', '.')) || 0))
    }
    return totals
  })()
  const reimbursementAmountsInvalid = [...reimbursementTotals].some(([memberId, value]) => value > (reimbursementLimits.get(memberId) ?? 0) + 0.001)

  const addSplit = () => {
    setSplits((items) => [...items, {
      id: makeId('movement-split'),
      amount: '',
      categoryId: '',
      categoryQuery: '',
      beneficiaryId: undefined,
      beneficiaryQuery: '',
      tagQuery: '',
      shared: false,
      commissioned: false,
      reimbursement: false,
      commissionedRecipientId: '',
      commissionedInviteEmail: '',
    }])
  }

  const addRomanParticipant = () => {
    if (!romanContactId || romanParticipants.some((item) => item.contactId === romanContactId)) return
    setRomanParticipants((items) => [...items, { contactId: romanContactId, compensateDebt: false }])
    setRomanContactId('')
  }

  const selectComposerType = (nextType: ComposerType) => {
    if (nextType === 'transfer') { onSelectTransfer?.(); return }
    setComposerSelected(true)
    if (nextType === 'roman') {
      setRomanMode(true)
      setType('expense')
      setCategoryId('')
      setCategoryQuery('')
      setBeneficiaryId('')
      setBeneficiaryQuery('')
      setSenderId('')
      setSenderQuery('')
      setTagId('')
      setTagQuery('')
      setCommissioned(false)
      setReimbursementPurchase(false)
      setSplitsEnabled(false)
      setSplits([])
      setInstallmentsEnabled(false)
      setShared(false)
      if (selectedAccount?.scope === 'family') selectAccount(personalAccounts[0]?.id ?? '')
      return
    }
    setRomanMode(false)
    setRomanParticipants([])
    setRomanContactId('')
    changeType(nextType)
  }

  const changeCategoryQuery = (value: string) => {
    setCategoryQuery(value)
    setCategoryId(findByName(categories, value)?.id ?? '')
  }

  const changeBeneficiaryQuery = (value: string) => {
    setBeneficiaryQuery(value)
    setBeneficiaryId(findByName(beneficiaries, value)?.id ?? '')
  }

  const changeTagQuery = (value: string) => {
    setTagQuery(value)
    setTagId(findByName(tags, value)?.id ?? '')
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

  const changeSplitTagQuery = (id: string, value: string) => {
    updateSplit(id, { tagQuery: value, tagId: findByName(tags, value)?.id })
  }

  const changeType = (nextType: MovementType) => {
    setType(nextType)
    setCategoryId('')
    setCategoryQuery('')
    setBeneficiaryId('')
    setBeneficiaryQuery('')
    setSenderId('')
    setSenderQuery('')
    setTagId('')
    setTagQuery('')
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
    const invalidSplits = activeSplitsEnabled && (
      activeSplits.length === 0
      || activeSplits.some((item) => (!item.commissioned && !item.categoryQuery.trim()) || !Number(item.amount.replace(',', '.')) || Number(item.amount.replace(',', '.')) <= 0)
      || splitTotal > numericAmount
    )
    const mainAllocationRequired = !activeSplitsEnabled || mainRemainder > 0
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
    const tagName = tagQuery.trim()
    const tagMatch = findByName(tags, tagName)
    const tag = tagName && !tagMatch ? { id: makeId('tag'), name: tagName, scope: effectivelyShared ? 'family' as const : 'personal' as const, ownerId: effectivelyShared ? undefined : user.id, color: '#c64e2f' } : undefined
    const resolvedCategoryId = category?.id ?? categoryMatch?.id ?? categoryId
    const resolvedBeneficiaryId = type === 'income'
      ? userBeneficiaryId
      : resolvedMainBeneficiaryName ? beneficiary?.id ?? beneficiaryMatch?.id ?? beneficiaryId : undefined
    const resolvedSenderId = type === 'income' && senderName ? sender?.id ?? senderMatch?.id ?? senderId : undefined
    const resolvedTagId = tag?.id ?? tagMatch?.id ?? (tagId || undefined)
    const resolvedDescription = description.trim() || categoryName || 'Movimento'
    const resolvedComments = comments.trim() || undefined
    const shouldInstall = type === 'expense' && installmentsEnabled && (!initial || Boolean(initialPlan))
    const planId = initial?.installmentPlanId ?? (shouldInstall ? makeId('installment-plan') : undefined)
    const amounts = shouldInstall ? splitAmount(numericAmount, installmentCount) : [numericAmount]
    const movementId = initial?.id ?? makeId('movement')
    const mainCommissionedAmount = commissioned ? (activeSplitsEnabled ? mainRemainder : numericAmount) : 0
    const purchaseId = initial?.commissionedPurchaseId ?? (mainCommissionedAmount > 0 ? makeId('commissioned-purchase') : undefined)
    const resolvedProvider = shouldInstall ? (provider === 'Altro' ? customProvider.trim() || 'Altro' : provider) : undefined
    const newSplitCategories: Category[] = []
    const newSplitBeneficiaries: Beneficiary[] = []
    const newSplitTags: Tag[] = []
    const commissionedDrafts: CommissionedPurchaseDraft[] = []
    const resolvedSplits = type === 'expense' && activeSplitsEnabled
      ? activeSplits.map((item) => {
        const categoryName = item.existingCommissionedPurchaseId ? item.categoryQuery.trim() : item.commissioned ? 'Acquisti per conto terzi' : item.categoryQuery.trim()
        const selectedContact = contacts.find((contact) => contact.id === item.commissionedRecipientId)
        const existingBeneficiary = data.beneficiaries.find((entry) => entry.id === item.beneficiaryId)
        const splitBeneficiaryName = item.commissioned ? selectedContact?.name ?? existingBeneficiary?.name ?? 'Contatto' : beneficiaryName
        let resolvedSplitCategory = data.categories.find((entry) => entry.id === item.categoryId) ?? findByName(categories, categoryName) ?? findByName(newSplitCategories, categoryName)
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
        let resolvedSplitBeneficiary = existingBeneficiary ?? (item.commissioned && splitBeneficiaryName
          ? findByName(beneficiaries, splitBeneficiaryName) ?? findByName(newSplitBeneficiaries, splitBeneficiaryName)
          : beneficiary ?? beneficiaryMatch)
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
        const splitTagName = item.tagQuery.trim()
        let resolvedSplitTag = findByName(tags, splitTagName) ?? findByName(newSplitTags, splitTagName)
        if (!resolvedSplitTag && tag?.name.toLocaleLowerCase('it-IT') === splitTagName.toLocaleLowerCase('it-IT')) resolvedSplitTag = tag
        if (splitTagName && !resolvedSplitTag) {
          resolvedSplitTag = {
            id: makeId('tag'), name: splitTagName,
            scope: selectedAccount?.scope === 'family' || item.shared ? 'family' : 'personal',
            ownerId: selectedAccount?.scope === 'family' || item.shared ? undefined : user.id,
            color: '#c64e2f',
          }
          newSplitTags.push(resolvedSplitTag)
        }
        const commissionedPurchaseId = item.existingCommissionedPurchaseId ?? (item.commissioned ? makeId('commissioned-purchase') : undefined)
        if (commissionedPurchaseId && !item.existingCommissionedPurchaseId) commissionedDrafts.push({
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
          tagId: resolvedSplitTag?.id,
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
      const installmentNumber = index + 2
      const existingPayment = initial?.installmentPlanId
        ? data.scheduledPayments.find((item) => item.planId === initial.installmentPlanId && item.installmentNumber === installmentNumber)
        : undefined
      const dueDate = installmentDueDates[installmentNumber] ?? existingPayment?.dueDate ?? addMonthsISO(date, index + 1)
      return {
        id: existingPayment?.id ?? makeId('scheduled-payment'),
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
        installmentNumber,
        installmentCount,
        status: existingPayment?.status ?? 'scheduled',
        paidMovementId: existingPayment?.paidMovementId,
        commissionedPurchaseId: purchaseId,
        ...(selectedAccount?.openingBalanceDate && dueDate < selectedAccount.openingBalanceDate ? { affectsAccountBalance } : {}),
      }
    }) : []
    // Il rimborso tramite acquisto riusa la richiesta commissionata: l'ID collega conferma e compensazione.
    if (purchaseId && !initial?.commissionedPurchaseId) commissionedDrafts.unshift({
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
      sharedSettlementAmount: shouldInstall && sharedPurchaseAmount > 0 ? sharedPurchaseAmount : initial?.sharedSettlementAmount,
      affectsAccountBalance: isDebtCompensationMovement ? false : isBeforeOpeningBalance ? affectsAccountBalance : undefined,
      commissionedPurchaseId: purchaseId ?? initial?.commissionedPurchaseId,
      paidByUserId: initial?.paidByUserId,
      excludeFromReports: allAllocationsCommissioned || initial?.excludeFromReports || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }
    if (commissionedDrafts.length && onCommissionedPurchase) {
      setSaving(true)
      try {
        setRequestError('')
        for (const draft of commissionedDrafts) await onCommissionedPurchase(draft)
      } catch (reason) {
        setRequestError(functionErrorMessage(reason, 'Non è stato possibile inviare la richiesta.'))
        setSaving(false)
        return
      } finally { setSaving(false) }
    }
    onSave(movement, { category, categories: newSplitCategories, beneficiary, beneficiaries: newSplitBeneficiaries, sender, tag, tags: newSplitTags, scheduledPayments })
  }

  const mainTagField = <CreatableLookup label="Tag" value={tagQuery} options={tags} placeholder="Inserisci tag (facoltativo)" onChange={changeTagQuery} />
  const mainSharingField = <label>Spesa condivisa con<select value="family" onChange={() => setMovementSharing(true)}><option value="family">{familyName}</option></select>{selectedAccount?.scope === 'family' ? <small>Il conto appartiene alla famiglia selezionata.</small> : null}</label>
  const mainCommissionFields = <div className="installment-fields"><label>Committente<select value={commissionedRecipientId} onChange={(event) => { setCommissionedRecipientId(event.target.value); setCommissionedInviteEmail('') }}><option value="">Invita un nuovo contatto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.source === 'family' ? ' · famiglia' : ''}</option>)}</select></label>{!commissionedRecipientId ? <label>Email da invitare<input type="email" value={commissionedInviteEmail} onChange={(event) => setCommissionedInviteEmail(event.target.value)} placeholder="nome@email.it" required /></label> : null}<small>Il committente riceverà la richiesta e catalogherà l’acquisto nella propria contabilità.</small>{submitted && commissionedTargetMissing ? <small className="field-error">Scegli un contatto o inserisci l’email da invitare.</small> : null}</div>
  const reimbursementMemberName = (memberId: string) => members.find((member) => member.id === memberId)?.name ?? 'Membro della famiglia'
  const reimbursementOptionsMarkup = reimbursementOptions.map((item) => <option key={item.memberId} value={item.memberId}>{reimbursementMemberName(item.memberId)} · fino a € {item.availableCredit.toFixed(2).replace('.', ',')}</option>)
  const mainReimbursementFields = <div className="installment-fields"><label>Rimborso a<select value={commissionedRecipientId} onChange={(event) => { setCommissionedRecipientId(event.target.value); setCommissionedInviteEmail('') }}><option value="">Scegli il membro da rimborsare</option>{reimbursementOptionsMarkup}</select></label><small>L’acquisto compensa il debito verso il membro scelto. Dopo la conferma, sarà lui a catalogarlo nella propria contabilità.</small>{submitted && commissionedTargetMissing ? <small className="field-error">Scegli il membro della famiglia da rimborsare.</small> : null}</div>
  const availableRomanContacts = contacts.filter((contact) => !romanParticipants.some((item) => item.contactId === contact.id))

  if (!composerSelected) return <div className="composer-choice composer-choice--enter">
    <MovementTypeSelector onChange={selectComposerType} />
  </div>

  return <form className="expense-form movement-form composer-fields composer-fields--enter" onSubmit={submit}>
    <div className={`amount-field ${type === 'income' ? 'amount-field--income' : ''}`}>
      <label htmlFor="amount">Importo {installmentsEnabled ? 'totale' : ''}</label><div><span>€</span><input id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus /></div>
      {submitted && (!numericAmount || numericAmount <= 0) ? <small>Inserisci un importo valido.</small> : null}
    </div>
    {isDebtCompensationMovement ? <label>Origine contabile<output>{debtCompensationAccountLabel}</output></label> : <label>{type === 'expense' ? 'Conto di addebito' : 'Conto di destinazione'}<select value={accountId} onChange={(event) => selectAccount(event.target.value)}>{displayedAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.scope === 'family' ? ' · famiglia' : ` · ${user.name}`}</option>)}</select></label>}
    {type === 'expense' && !romanMode && (!initial || initialPlan) ? <section className={`installment-box ${installmentsEnabled ? 'installment-box--active' : ''}`}>
      <button type="button" className="installment-toggle" disabled={Boolean(initialPlan)} onClick={() => setInstallmentsEnabled((value) => !value)}><CalendarClock /><span><strong>Pagamento a rate</strong><small>L’importo resta il totale; il conto verrà addebitato con i pagamenti programmati.</small></span><i aria-hidden="true"><span /></i></button>
      {installmentsEnabled ? <><div className="installment-fields"><label>Intermediario<select value={provider} onChange={(event) => setProvider(event.target.value)}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label>{provider === 'Altro' ? <label>Nome intermediario<input value={customProvider} onChange={(event) => setCustomProvider(event.target.value)} placeholder="Es. carta del negozio" /></label> : null}<label>Numero di rate<select value={installmentCount} onChange={(event) => setInstallmentCount(Number(event.target.value))}><option value={3}>3 rate</option><option value={5}>5 rate</option></select></label></div><div className="installment-schedule"><strong>Rate successive</strong><small>Puoi modificare ogni data prima di salvare.</small>{splitAmount(numericAmount, installmentCount).slice(1).map((installmentAmount, index) => {
        const installmentNumber = index + 2
        return <label key={installmentNumber}><span>Rata {installmentNumber} di {installmentCount}<small>€ {installmentAmount.toFixed(2).replace('.', ',')}</small></span><input aria-label={`Data rata ${installmentNumber}`} type="date" value={installmentDueDates[installmentNumber] ?? addMonthsISO(date, index + 1)} onChange={(event) => setInstallmentDueDates((current) => ({ ...current, [installmentNumber]: event.target.value }))} /></label>
      })}</div></> : null}
    </section> : null}
    <div className="form-grid">
      {type === 'expense'
        ? (expenseBeneficiaryRequired ? <CreatableLookup label="Beneficiario" value={beneficiaryQuery} options={beneficiaries} placeholder="Inserisci beneficiario" onChange={changeBeneficiaryQuery} error={submitted && beneficiaryMissing ? 'Inserisci un beneficiario.' : undefined} /> : null)
        : <CreatableLookup label="Mittente" value={senderQuery} options={senders} placeholder="Inserisci mittente" onChange={changeSenderQuery} error={submitted && senderMissing ? 'Inserisci un mittente.' : undefined} />}
      <label>Data<input type="date" value={date} onChange={(event) => changeDate(event.target.value)} required /></label>
    </div>
    <label>Descrizione<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={type === 'income' ? 'Es. Stipendio luglio' : 'Es. Spesa settimanale'} /></label>
    <label>Commenti<textarea value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Dettagli facoltativi sul movimento" rows={3} /></label>

    {type === 'income' ? <div className="form-grid"><CreatableLookup label="Categoria" value={categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={changeCategoryQuery} error={submitted && !categoryQuery.trim() ? 'Inserisci una categoria.' : undefined} />{mainTagField}</div> : romanMode ? <section className="split-box split-box--active roman-split">
      <div className="split-editor__intro"><div><strong>Aggiungi contatto</strong><small>La spesa viene divisa tra te e tutte le persone aggiunte.</small></div><UserPlus /></div>
      <div className="roman-split__add"><label>Contatto<select aria-label="Aggiungi contatto" value={romanContactId} onChange={(event) => setRomanContactId(event.target.value)}><option value="">Scegli un contatto</option>{availableRomanContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.source === 'family' ? ' · famiglia' : ''}</option>)}</select></label><button className="button button--ghost" type="button" disabled={!romanContactId} onClick={addRomanParticipant}><Plus />Aggiungi</button></div>
      {romanParticipants.length ? <div className="roman-split__participants">{romanParticipants.map((participant, index) => {
        const contact = contacts.find((item) => item.id === participant.contactId)
        const share = romanShares[index + 1] ?? 0
        const credit = reimbursementLimits.get(participant.contactId) ?? 0
        const canCompensate = contact?.source === 'family' && credit + 0.001 >= share && share > 0
        return <article key={participant.contactId} className="roman-participant"><div><strong>{contact?.name ?? 'Contatto'}</strong><small>Quota: € {share.toFixed(2).replace('.', ',')}</small></div>{contact?.source === 'family' ? <label className="roman-participant__compensation"><input aria-label={`Scala dal debito per ${contact.name}`} type="checkbox" checked={participant.compensateDebt} disabled={!canCompensate && !participant.compensateDebt} onChange={(event) => setRomanParticipants((items) => items.map((item) => item.contactId === participant.contactId ? { ...item, compensateDebt: event.target.checked } : item))} /><span>Scala dal debito<small>{canCompensate ? `Credito disponibile: € ${credit.toFixed(2).replace('.', ',')}` : 'Debito insufficiente per questa quota'}</small></span></label> : <small>Riceverà una normale richiesta di rimborso.</small>}<button className="icon-button icon-button--danger" type="button" title={`Rimuovi ${contact?.name ?? 'contatto'}`} onClick={() => setRomanParticipants((items) => items.filter((item) => item.contactId !== participant.contactId))}><Trash2 /></button></article>
      })}</div> : <p className="privacy-note">Aggiungi almeno una persona. La tua quota viene ricalcolata automaticamente a ogni modifica.</p>}
      {numericAmount > 0 ? <div className="roman-split__summary"><span>La tua quota</span><strong>€ {(romanShares[0] ?? 0).toFixed(2).replace('.', ',')}</strong><small>{romanParticipants.length + 1} quote totali</small></div> : null}
      <div className="form-grid"><CreatableLookup label="Categoria della tua quota" value={categoryQuery} options={categories} placeholder="Es. Ristoranti" onChange={changeCategoryQuery} error={submitted && !categoryQuery.trim() ? 'Inserisci una categoria.' : undefined} />{mainTagField}</div>
      {submitted && !romanParticipants.length ? <small className="field-error">Aggiungi almeno un contatto.</small> : null}
      {submitted && reimbursementAmountsInvalid ? <small className="field-error">Una quota supera il debito disponibile del familiare scelto.</small> : null}
    </section> : <section className={`split-box ${splitsEnabled ? 'split-box--active' : ''}`}>
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
          {item.existingCommissionedPurchaseId ? <label>Acquisto per conto di<output>{data.beneficiaries.find((entry) => entry.id === item.beneficiaryId)?.name ?? 'Altra persona'}</output></label> : item.commissioned ? item.reimbursement
            ? <label>Rimborso a<select value={item.commissionedRecipientId} onChange={(event) => updateSplit(item.id, { commissionedRecipientId: event.target.value, commissionedInviteEmail: '' })}><option value="">Scegli il membro da rimborsare</option>{reimbursementOptionsMarkup}</select></label>
            : <><label>Committente<select value={item.commissionedRecipientId} onChange={(event) => updateSplit(item.id, { commissionedRecipientId: event.target.value, commissionedInviteEmail: '' })}><option value="">Invita un nuovo contatto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.source === 'family' ? ' · famiglia' : ''}</option>)}</select></label>{!item.commissionedRecipientId ? <label>Email da invitare<input type="email" value={item.commissionedInviteEmail} onChange={(event) => updateSplit(item.id, { commissionedInviteEmail: event.target.value })} placeholder="nome@email.it" /></label> : null}</>
            : <><CreatableLookup className="split-row__category" label={`Categoria parziale ${index + 1}`} value={item.categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={(value) => changeSplitCategoryQuery(item.id, value)} /><CreatableLookup label={`Tag parziale ${index + 1}`} value={item.tagQuery} options={tags} placeholder="Inserisci tag (facoltativo)" onChange={(value) => changeSplitTagQuery(item.id, value)} />{(selectedAccount?.scope === 'family' || item.shared) ? <label>Spesa condivisa con<select aria-label={`Famiglia spesa parziale ${index + 1}`} value="family"><option value="family">{familyName}</option></select></label> : null}</>}
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
    {personalOnly ? <div className="family-account-note"><LockKeyhole /><span><strong>Movimento personale</strong><small>In questa vista i movimenti restano privati e non partecipano a saldi familiari.</small></span></div> : initial && !activeSplitsEnabled ? <section className="sharing-edit-box">
      <label>Condivisione del movimento<select value={effectivelyShared ? 'family' : 'personal'} disabled={selectedAccount?.scope === 'family'} onChange={(event) => setMovementSharing(event.target.value === 'family')}><option value="personal">Movimento personale</option><option value="family">Movimento condiviso</option></select></label>
      <small>{selectedAccount?.scope === 'family' ? 'Il movimento resta condiviso perché utilizza un conto della famiglia.' : activeSplits.length ? 'La scelta viene applicata anche a tutti i parziali del movimento.' : effectivelyShared ? `La quota viene ripartita al ${splitPercentage} tra i ${memberCount} membri.` : `Il movimento resta visibile soltanto a ${user.name}.`}</small>
    </section> : type === 'income' ? (selectedAccount?.scope === 'family' ? <div className="family-account-note"><Landmark /><span><strong>Entrata della famiglia</strong><small>L’entrata viene assegnata al conto condiviso.</small></span></div> : <button type="button" className={`share-toggle ${shared ? 'share-toggle--active' : ''}`} onClick={toggleShared}><span className="share-toggle__icon">{shared ? <Scale /> : <LockKeyhole />}</span><span><strong>{shared ? 'Entrata della famiglia' : `Entrata di ${user.name}`}</strong><small>{shared ? 'Verrà assegnata automaticamente al conto condiviso.' : `Verrà assegnata a ${user.name} e sarà visibile soltanto a te.`}</small></span><i aria-hidden="true"><span /></i></button>) : null}
    <div className={`form-actions ${initial ? 'form-actions--edit' : ''}`}>{initial && onDelete ? <button className="button button--danger form-actions__delete" type="button" onClick={() => confirm(initial.installmentPlanId && initial.installmentNumber === 1 ? 'Eliminare questo acquisto e tutte le rate collegate?' : 'Eliminare definitivamente questo movimento?') && onDelete(initial.id)}><Trash2 />Elimina movimento</button> : null}<button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={saving}>{initial ? <Check /> : <Plus />}{saving ? 'Invio richiesta…' : initial ? 'Salva modifiche' : 'Salva movimento'}</button></div>
  </form>
}
