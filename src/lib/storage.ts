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
  expenses?: LegacyExpense[]
  reimbursements?: Array<Omit<Reimbursement, 'fromAccountId' | 'toAccountId'> & { fromAccountId?: string; toAccountId?: string }>
}

export function loadData(storageKey = STORAGE_KEY, fallbackData: AppData = defaultData): AppData {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>
      if (parsed.version === 3) return materializeDuePayments(normalizeData(parsed, fallbackData), todayISO())
    }
    if (storageKey !== STORAGE_KEY) return structuredClone(fallbackData)
    const version2Raw = localStorage.getItem(VERSION_2_KEY)
    if (version2Raw) return materializeDuePayments(normalizeData(JSON.parse(version2Raw) as Partial<AppData>, fallbackData), todayISO())
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return structuredClone(fallbackData)
    return materializeDuePayments(normalizeData(migrateLegacy(JSON.parse(legacyRaw) as LegacyData), fallbackData), todayISO())
  } catch {
    return structuredClone(fallbackData)
  }
}

function mergeMissingById<T extends { id: string }>(current: T[] | undefined, defaults: T[]) {
  const items = current ?? []
  const ids = new Set(items.map((item) => item.id))
  return [...items, ...defaults.filter((item) => !ids.has(item.id))]
}

function normalizeData(data: Partial<AppData>, fallbackData: AppData = defaultData): AppData {
  const base = structuredClone(fallbackData)
  const accounts = mergeMissingById(data.accounts, base.accounts)
  const fallbackAccount = (userId: UserId) => accounts.find((item) => item.scope === 'personal' && item.ownerId === userId)?.id ?? ''
  return {
    ...data,
    version: 3,
    accounts,
    categories: mergeMissingById(data.categories, base.categories),
    beneficiaries: mergeMissingById(data.beneficiaries, base.beneficiaries),
    tags: mergeMissingById(data.tags, base.tags),
    tagReportIds: data.tagReportIds ?? base.tagReportIds,
    movements: data.movements ?? [],
    scheduledPayments: data.scheduledPayments ?? [],
    transfers: data.transfers ?? [],
    reimbursements: (data.reimbursements ?? []).map((item) => ({
      ...item,
      fromAccountId: item.fromAccountId || fallbackAccount(item.fromId),
      toAccountId: item.toAccountId || fallbackAccount(item.toId),
    })),
  }
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
