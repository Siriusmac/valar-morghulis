import { defaultData } from './seed'
import { materializeDuePayments } from './scheduled'
import { todayISO } from './format'
import type { AppData, Reimbursement, UserId } from '../types'

const STORAGE_KEY = 'valar-morghulis:v3'
const VERSION_2_KEY = 'valar-morghulis:v2'
const LEGACY_KEY = 'valar-morghulis:v1'

interface LegacyExpense {
  id: string
  authorId: UserId
  payerId: UserId
  amount: number
  date: string
  description: string
  categoryId: string
  beneficiaryId: string
  accountId: string
  shared: boolean
  createdAt: string
}

interface LegacyData {
  accounts?: Array<Omit<AppData['accounts'][number], 'scope'> & { scope?: 'family' | 'personal' }>
  categories?: Array<Omit<AppData['categories'][number], 'movementType'> & { movementType?: 'expense' | 'income' }>
  beneficiaries?: AppData['beneficiaries']
  senders?: AppData['senders']
  expenses?: LegacyExpense[]
  reimbursements?: Array<Omit<Reimbursement, 'fromAccountId' | 'toAccountId'> & { fromAccountId?: string; toAccountId?: string }>
}

export function loadData(storageKey = STORAGE_KEY, fallbackData: AppData = defaultData): AppData {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>
      if (parsed.version === 3) return hydrateData(parsed, fallbackData)
    }
    if (storageKey !== STORAGE_KEY) return structuredClone(fallbackData)
    const version2Raw = localStorage.getItem(VERSION_2_KEY)
    if (version2Raw) return hydrateData(JSON.parse(version2Raw) as Partial<AppData>, fallbackData)
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return structuredClone(fallbackData)
    return hydrateData(migrateLegacy(JSON.parse(legacyRaw) as LegacyData), fallbackData)
  } catch {
    return structuredClone(fallbackData)
  }
}

function mergeMissingById<T extends { id: string }>(current: T[] | undefined, defaults: T[]) {
  const items = current ?? []
  const ids = new Set(items.map((item) => item.id))
  return [...items, ...defaults.filter((item) => !ids.has(item.id))]
}

export function hydrateData(data: Partial<AppData>, fallbackData: AppData = defaultData): AppData {
  return materializeDuePayments(normalizeData(data, fallbackData), todayISO())
}

function normalizeData(data: Partial<AppData>, fallbackData: AppData = defaultData): AppData {
  const base = structuredClone(fallbackData)
  const accounts = mergeMissingById(data.accounts, base.accounts)
  const deletedCategoryIds = data.deletedCategoryIds ?? []
  const deletedBeneficiaryIds = data.deletedBeneficiaryIds ?? []
  const deletedSenderIds = data.deletedSenderIds ?? []
  const fallbackAccount = (userId: UserId) => accounts.find((item) => item.scope === 'personal' && item.ownerId === userId)?.id ?? ''
  return {
    ...data,
    version: 3,
    accounts,
    categories: mergeMissingById(data.categories, base.categories).filter((item) => !deletedCategoryIds.includes(item.id)),
    deletedCategoryIds,
    beneficiaries: mergeMissingById(data.beneficiaries, base.beneficiaries).filter((item) => !deletedBeneficiaryIds.includes(item.id)),
    senders: mergeMissingById(data.senders, base.senders).filter((item) => !deletedSenderIds.includes(item.id)),
    deletedBeneficiaryIds,
    deletedSenderIds,
    tags: mergeMissingById(data.tags, base.tags),
    tagReportIds: data.tagReportIds ?? base.tagReportIds,
    movements: data.movements ?? [],
    scheduledPayments: data.scheduledPayments ?? [],
    transfers: data.transfers ?? [],
    loans: data.loans ?? [],
    loanRepayments: data.loanRepayments ?? [],
    reimbursements: (data.reimbursements ?? []).map((item) => ({
      ...item,
      fromAccountId: item.fromAccountId || fallbackAccount(item.fromId),
      toAccountId: item.toAccountId || fallbackAccount(item.toId),
    })),
  }
}

export function hasMeaningfulUserData(data: AppData, userId: UserId) {
  const personalAccounts = data.accounts.filter((account) => account.scope === 'personal' && account.ownerId === userId)
  return data.movements.length > 0
    || data.scheduledPayments.length > 0
    || data.transfers.length > 0
    || data.reimbursements.length > 0
    || data.loans.length > 0
    || data.loanRepayments.length > 0
    || data.beneficiaries.length > 0
    || data.senders.length > 0
    || data.tags.length > 0
    || personalAccounts.some((account) => account.type !== 'cash' || account.openingBalance !== 0)
}

export function mergeAppData(remote: Partial<AppData>, local: AppData, fallbackData: AppData): AppData {
  const remoteData = hydrateData(remote, fallbackData)
  return hydrateData({
    ...remoteData,
    accounts: mergePreferredById(local.accounts, remoteData.accounts),
    categories: mergePreferredById(local.categories, remoteData.categories),
    deletedCategoryIds: [...new Set([...(local.deletedCategoryIds ?? []), ...(remoteData.deletedCategoryIds ?? [])])],
    beneficiaries: mergePreferredById(local.beneficiaries, remoteData.beneficiaries),
    senders: mergePreferredById(local.senders, remoteData.senders),
    deletedBeneficiaryIds: [...new Set([...(local.deletedBeneficiaryIds ?? []), ...(remoteData.deletedBeneficiaryIds ?? [])])],
    deletedSenderIds: [...new Set([...(local.deletedSenderIds ?? []), ...(remoteData.deletedSenderIds ?? [])])],
    tags: mergePreferredById(local.tags, remoteData.tags),
    tagReportIds: [...new Set([...local.tagReportIds, ...remoteData.tagReportIds])],
    movements: mergePreferredById(local.movements, remoteData.movements),
    scheduledPayments: mergePreferredById(local.scheduledPayments, remoteData.scheduledPayments),
    transfers: mergePreferredById(local.transfers, remoteData.transfers),
    reimbursements: mergePreferredById(remoteData.reimbursements, local.reimbursements),
    loans: mergePreferredById(remoteData.loans, local.loans),
    loanRepayments: mergePreferredById(remoteData.loanRepayments, local.loanRepayments),
  }, fallbackData)
}

function mergePreferredById<T extends { id: string }>(preferred: T[], existing: T[]) {
  const preferredIds = new Set(preferred.map((item) => item.id))
  return [...preferred, ...existing.filter((item) => !preferredIds.has(item.id))]
}

function migrateLegacy(legacy: LegacyData): AppData {
  const base = structuredClone(defaultData)
  const accounts = legacy.accounts?.map((item) => ({ ...item, scope: item.scope ?? 'personal' as const })) ?? base.accounts
  const fallbackAccount = (userId: UserId) => accounts.find((item) => item.ownerId === userId)?.id ?? base.accounts.find((item) => item.ownerId === userId)!.id
  return {
    version: 3,
    accounts,
    categories: legacy.categories?.map((item) => ({ ...item, movementType: item.movementType ?? 'expense' as const })) ?? base.categories,
    beneficiaries: legacy.beneficiaries ?? base.beneficiaries,
    senders: legacy.senders ?? base.senders,
    tags: base.tags,
    tagReportIds: base.tagReportIds,
    movements: legacy.expenses?.map(({ payerId, ...item }) => ({ ...item, type: 'expense' as const, memberId: payerId })) ?? base.movements,
    transfers: [],
    scheduledPayments: [],
    reimbursements: legacy.reimbursements?.map((item) => ({
      ...item,
      fromAccountId: item.fromAccountId ?? fallbackAccount(item.fromId),
      toAccountId: item.toAccountId ?? fallbackAccount(item.toId),
    })) ?? [],
    loans: [],
    loanRepayments: [],
  }
}

export function saveData(data: AppData, storageKey = STORAGE_KEY) {
  localStorage.setItem(storageKey, JSON.stringify(data))
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(VERSION_2_KEY)
  localStorage.removeItem(LEGACY_KEY)
  return structuredClone(defaultData)
}
