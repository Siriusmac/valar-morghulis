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

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>
      if (parsed.version === 3) return materializeDuePayments(normalizeData(parsed), todayISO())
    }
    const version2Raw = localStorage.getItem(VERSION_2_KEY)
    if (version2Raw) return materializeDuePayments(normalizeData(JSON.parse(version2Raw) as Partial<AppData>), todayISO())
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return structuredClone(defaultData)
    return materializeDuePayments(normalizeData(migrateLegacy(JSON.parse(legacyRaw) as LegacyData)), todayISO())
  } catch {
    return structuredClone(defaultData)
  }
}

function mergeMissingById<T extends { id: string }>(current: T[] | undefined, defaults: T[]) {
  const items = current ?? []
  const ids = new Set(items.map((item) => item.id))
  return [...items, ...defaults.filter((item) => !ids.has(item.id))]
}

function normalizeData(data: Partial<AppData>): AppData {
  const base = structuredClone(defaultData)
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
    movements: legacy.expenses?.map((item) => ({ ...item, type: 'expense' as const, memberId: item.payerId, payerId: undefined })).map(({ payerId: _payerId, ...item }) => item) ?? base.movements,
    transfers: [],
    scheduledPayments: [],
    reimbursements: legacy.reimbursements?.map((item) => ({
      ...item,
      fromAccountId: item.fromAccountId ?? fallbackAccount(item.fromId),
      toAccountId: item.toAccountId ?? fallbackAccount(item.toId),
    })) ?? [],
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(VERSION_2_KEY)
  localStorage.removeItem(LEGACY_KEY)
  return structuredClone(defaultData)
}
