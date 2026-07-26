import { movementAllocations, movementHasSharedPortion } from './calculations'
import { hydrateData } from './storage'
import type {
  AppData, Beneficiary, Category, Movement, ScheduledPayment, Tag, UserId,
} from '../types'

export type SharedRecordType =
  | 'movement'
  | 'scheduled_payment'
  | 'reimbursement'
  | 'transfer'
  | 'category'
  | 'beneficiary'
  | 'tag'

export interface SharedRecord {
  record_type: SharedRecordType
  record_id: string
  data: unknown
}

interface SharedRecordPayload {
  type: SharedRecordType
  id: string
  data: unknown
}

export interface CloudPersistencePayload {
  privateData: AppData
  sharedRecords: SharedRecordPayload[]
  ownedKeys: Array<{ type: SharedRecordType; id: string }>
}

const transactionTypes = new Set<SharedRecordType>([
  'movement', 'scheduled_payment', 'reimbursement', 'transfer',
])

function mergeById<T extends { id: string }>(preferred: T[], additional: T[]) {
  const ids = new Set(preferred.map((item) => item.id))
  return [...preferred, ...additional.filter((item) => !ids.has(item.id))]
}

function familyCopy<T extends Category | Beneficiary | Tag>(item: T): T {
  return { ...item, scope: 'family', ownerId: undefined }
}

function sanitizedSharedMovement(data: AppData, movement: Movement): Movement | null {
  if (!movementHasSharedPortion(data, movement)) return null
  const account = data.accounts.find((item) => item.id === movement.accountId)
  if (account?.scope === 'family' || !movement.splits?.length) return structuredClone(movement)

  const sharedAllocations = movementAllocations(movement).filter((item) => item.shared)
  if (!sharedAllocations.length) return null
  const [primary, ...partials] = sharedAllocations
  const amount = Math.round(sharedAllocations.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  return {
    ...structuredClone(movement),
    amount,
    categoryId: primary.categoryId,
    shared: true,
    splits: partials.map((item, index) => ({
      id: `${movement.id}-shared-${index + 1}`,
      amount: item.amount,
      categoryId: item.categoryId,
      shared: true,
    })),
    sharedSettlementAmount: undefined,
    affectsAccountBalance: false,
  }
}

function referencedDirectoryIds(movements: Movement[], scheduledPayments: ScheduledPayment[]) {
  const categoryIds = new Set<string>()
  const beneficiaryIds = new Set<string>()
  const tagIds = new Set<string>()
  for (const movement of movements) {
    for (const allocation of movementAllocations(movement)) categoryIds.add(allocation.categoryId)
    beneficiaryIds.add(movement.beneficiaryId)
    if (movement.tagId) tagIds.add(movement.tagId)
  }
  for (const payment of scheduledPayments) {
    categoryIds.add(payment.categoryId)
    beneficiaryIds.add(payment.beneficiaryId)
    if (payment.tagId) tagIds.add(payment.tagId)
  }
  return { categoryIds, beneficiaryIds, tagIds }
}

export function buildCloudPersistence(data: AppData, userId: UserId): CloudPersistencePayload {
  const familyAccountIds = new Set(data.accounts.filter((item) => item.scope === 'family').map((item) => item.id))
  const ownSharedMovements = data.movements
    .filter((item) => item.authorId === userId)
    .flatMap((item) => {
      const shared = sanitizedSharedMovement(data, item)
      return shared ? [shared] : []
    })
  const ownSharedPayments = data.scheduledPayments.filter((item) => item.authorId === userId && item.shared)
  const ownSharedReimbursements = data.reimbursements.filter((item) => item.authorId === userId)
  const ownSharedTransfers = data.transfers.filter((item) => item.authorId === userId && (familyAccountIds.has(item.fromAccountId) || familyAccountIds.has(item.toAccountId)))
  const referenced = referencedDirectoryIds(ownSharedMovements, ownSharedPayments)

  const sharedCategories = data.categories
    .filter((item) => item.scope === 'family' || referenced.categoryIds.has(item.id))
    .map(familyCopy)
  const sharedBeneficiaries = data.beneficiaries
    .filter((item) => item.scope === 'family' || referenced.beneficiaryIds.has(item.id))
    .map(familyCopy)
  const sharedTags = data.tags
    .filter((item) => item.scope === 'family' || referenced.tagIds.has(item.id))
    .map(familyCopy)

  const sharedRecords: SharedRecordPayload[] = [
    ...ownSharedMovements.map((item) => ({ type: 'movement' as const, id: item.id, data: item })),
    ...ownSharedPayments.map((item) => ({ type: 'scheduled_payment' as const, id: item.id, data: item })),
    ...ownSharedReimbursements.map((item) => ({ type: 'reimbursement' as const, id: item.id, data: item })),
    ...ownSharedTransfers.map((item) => ({ type: 'transfer' as const, id: item.id, data: item })),
    ...sharedCategories.map((item) => ({ type: 'category' as const, id: item.id, data: item })),
    ...sharedBeneficiaries.map((item) => ({ type: 'beneficiary' as const, id: item.id, data: item })),
    ...sharedTags.map((item) => ({ type: 'tag' as const, id: item.id, data: item })),
  ]

  return {
    privateData: {
      ...data,
      accounts: data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      categories: data.categories.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      beneficiaries: data.beneficiaries.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      tags: data.tags.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      movements: data.movements.filter((item) => item.authorId === userId),
      scheduledPayments: data.scheduledPayments.filter((item) => item.authorId === userId),
      transfers: data.transfers.filter((item) => item.authorId === userId),
      reimbursements: data.reimbursements.filter((item) => item.authorId === userId),
    },
    sharedRecords,
    ownedKeys: sharedRecords
      .filter((item) => transactionTypes.has(item.type))
      .map((item) => ({ type: item.type, id: item.id })),
  }
}

export function mergeCloudPersistence(
  privateData: Partial<AppData> | null,
  records: SharedRecord[],
  fallback: AppData,
) {
  const shared = {
    categories: [] as Category[],
    beneficiaries: [] as Beneficiary[],
    tags: [] as Tag[],
    movements: [] as Movement[],
    scheduledPayments: [] as ScheduledPayment[],
    transfers: [] as AppData['transfers'],
    reimbursements: [] as AppData['reimbursements'],
  }
  for (const record of records) {
    if (record.record_type === 'category') shared.categories.push(record.data as Category)
    if (record.record_type === 'beneficiary') shared.beneficiaries.push(record.data as Beneficiary)
    if (record.record_type === 'tag') shared.tags.push(record.data as Tag)
    if (record.record_type === 'movement') shared.movements.push(record.data as Movement)
    if (record.record_type === 'scheduled_payment') shared.scheduledPayments.push(record.data as ScheduledPayment)
    if (record.record_type === 'transfer') shared.transfers.push(record.data as AppData['transfers'][number])
    if (record.record_type === 'reimbursement') shared.reimbursements.push(record.data as AppData['reimbursements'][number])
  }
  const personal = privateData ?? {}
  return hydrateData({
    ...personal,
    version: 3,
    categories: mergeById(personal.categories ?? [], shared.categories),
    beneficiaries: mergeById(personal.beneficiaries ?? [], shared.beneficiaries),
    tags: mergeById(personal.tags ?? [], shared.tags),
    movements: mergeById(personal.movements ?? [], shared.movements),
    scheduledPayments: mergeById(personal.scheduledPayments ?? [], shared.scheduledPayments),
    transfers: mergeById(personal.transfers ?? [], shared.transfers),
    reimbursements: mergeById(personal.reimbursements ?? [], shared.reimbursements),
  }, fallback)
}
