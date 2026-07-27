import { movementAllocations, movementHasSharedPortion } from './calculations'
import { deleteCounterpartyData, type CounterpartyKind } from './directories'
import { hydrateData } from './storage'
import type {
  AppData, Beneficiary, Category, Movement, ScheduledPayment, Sender, Tag, UserId,
} from '../types'

export type SharedRecordType =
  | 'movement'
  | 'scheduled_payment'
  | 'reimbursement'
  | 'transfer'
  | 'category'
  | 'beneficiary'
  | 'sender'
  | 'directory_redirect'
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
  familyPrivateData: AppData
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

function familyCopy<T extends Category | Beneficiary | Sender | Tag>(item: T): T {
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
  const senderIds = new Set<string>()
  const tagIds = new Set<string>()
  for (const movement of movements) {
    for (const allocation of movementAllocations(movement)) categoryIds.add(allocation.categoryId)
    if (movement.beneficiaryId) beneficiaryIds.add(movement.beneficiaryId)
    if (movement.senderId) senderIds.add(movement.senderId)
    if (movement.tagId) tagIds.add(movement.tagId)
  }
  for (const payment of scheduledPayments) {
    categoryIds.add(payment.categoryId)
    if (payment.beneficiaryId) beneficiaryIds.add(payment.beneficiaryId)
    if (payment.tagId) tagIds.add(payment.tagId)
  }
  return { categoryIds, beneficiaryIds, senderIds, tagIds }
}

export function buildCloudPersistence(data: AppData, userId: UserId): CloudPersistencePayload {
  const familyAccountIds = new Set(data.accounts.filter((item) => item.scope === 'family').map((item) => item.id))
  const ownMovements = data.movements.filter((item) => item.authorId === userId)
  const ownSharedMovements = ownMovements
    .flatMap((item) => {
      const shared = sanitizedSharedMovement(data, item)
      return shared ? [shared] : []
    })
  const ownSharedPayments = data.scheduledPayments.filter((item) => item.authorId === userId && item.shared)
  const ownSharedReimbursements = data.reimbursements.filter((item) => item.authorId === userId)
  const ownSharedTransfers = data.transfers.filter((item) => item.authorId === userId && (familyAccountIds.has(item.fromAccountId) || familyAccountIds.has(item.toAccountId)))
  const familyMovementIds = new Set(ownSharedMovements.map((item) => item.id))
  const personalTagIds = new Set(data.tags.filter((item) => item.scope === 'personal' && item.ownerId === userId).map((item) => item.id))
  const referenced = referencedDirectoryIds(ownSharedMovements, ownSharedPayments)

  const sharedCategories = data.categories
    .filter((item) => item.scope === 'family' || referenced.categoryIds.has(item.id))
    .map(familyCopy)
  const sharedBeneficiaries = data.beneficiaries
    .filter((item) => item.scope === 'family' || referenced.beneficiaryIds.has(item.id))
    .map(familyCopy)
  const sharedSenders = data.senders
    .filter((item) => item.scope === 'family' || referenced.senderIds.has(item.id))
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
    ...sharedSenders.map((item) => ({ type: 'sender' as const, id: item.id, data: item })),
    ...sharedTags.map((item) => ({ type: 'tag' as const, id: item.id, data: item })),
  ]

  return {
    privateData: {
      ...data,
      accounts: data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      categories: data.categories.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      beneficiaries: data.beneficiaries.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      senders: data.senders.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      tags: data.tags.filter((item) => item.scope === 'personal' && item.ownerId === userId),
      tagReportIds: data.tagReportIds.filter((id) => personalTagIds.has(id)),
      movements: ownMovements.filter((item) => !familyMovementIds.has(item.id)),
      scheduledPayments: data.scheduledPayments.filter((item) => item.authorId === userId && !item.shared),
      transfers: data.transfers.filter((item) => item.authorId === userId && !familyAccountIds.has(item.fromAccountId) && !familyAccountIds.has(item.toAccountId)),
      reimbursements: [],
    },
    familyPrivateData: {
      version: 3,
      accounts: [],
      categories: [],
      beneficiaries: [],
      senders: [],
      tags: [],
      tagReportIds: [],
      movements: ownMovements.filter((item) => familyMovementIds.has(item.id)),
      scheduledPayments: ownSharedPayments,
      transfers: ownSharedTransfers,
      reimbursements: ownSharedReimbursements,
    },
    sharedRecords,
    ownedKeys: sharedRecords
      .filter((item) => transactionTypes.has(item.type))
      .map((item) => ({ type: item.type, id: item.id })),
  }
}

export function mergePrivateCloudData(
  personalData: Partial<AppData> | null,
  familyData: Partial<AppData> | null,
): Partial<AppData> | null {
  if (!personalData && !familyData) return null
  const personal = personalData ?? {}
  const family = familyData ?? {}
  return {
    ...personal,
    version: 3,
    accounts: mergeById(personal.accounts ?? [], family.accounts ?? []),
    categories: mergeById(personal.categories ?? [], family.categories ?? []),
    beneficiaries: mergeById(personal.beneficiaries ?? [], family.beneficiaries ?? []),
    senders: mergeById(personal.senders ?? [], family.senders ?? []),
    tags: mergeById(personal.tags ?? [], family.tags ?? []),
    tagReportIds: [...new Set([...(personal.tagReportIds ?? []), ...(family.tagReportIds ?? [])])],
    movements: mergeById(family.movements ?? [], personal.movements ?? []),
    scheduledPayments: mergeById(family.scheduledPayments ?? [], personal.scheduledPayments ?? []),
    transfers: mergeById(family.transfers ?? [], personal.transfers ?? []),
    reimbursements: mergeById(family.reimbursements ?? [], personal.reimbursements ?? []),
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
    senders: [] as Sender[],
    tags: [] as Tag[],
    movements: [] as Movement[],
    scheduledPayments: [] as ScheduledPayment[],
    transfers: [] as AppData['transfers'],
    reimbursements: [] as AppData['reimbursements'],
    redirects: [] as Array<{ kind: CounterpartyKind; oldId: string; replacementId?: string }>,
  }
  for (const record of records) {
    if (record.record_type === 'category') shared.categories.push(record.data as Category)
    if (record.record_type === 'beneficiary') shared.beneficiaries.push(record.data as Beneficiary)
    if (record.record_type === 'sender') shared.senders.push(record.data as Sender)
    if (record.record_type === 'directory_redirect') {
      const redirect = record.data as { kind?: CounterpartyKind; oldId?: string; replacementId?: string }
      if ((redirect.kind === 'beneficiary' || redirect.kind === 'sender') && redirect.oldId) {
        shared.redirects.push({ kind: redirect.kind, oldId: redirect.oldId, replacementId: redirect.replacementId })
      }
    }
    if (record.record_type === 'tag') shared.tags.push(record.data as Tag)
    if (record.record_type === 'movement') shared.movements.push(record.data as Movement)
    if (record.record_type === 'scheduled_payment') shared.scheduledPayments.push(record.data as ScheduledPayment)
    if (record.record_type === 'transfer') shared.transfers.push(record.data as AppData['transfers'][number])
    if (record.record_type === 'reimbursement') shared.reimbursements.push(record.data as AppData['reimbursements'][number])
  }
  const personal = privateData ?? {}
  const merged = hydrateData({
    ...personal,
    version: 3,
    categories: mergeById(personal.categories ?? [], shared.categories),
    beneficiaries: mergeById(personal.beneficiaries ?? [], shared.beneficiaries),
    senders: mergeById(personal.senders ?? [], shared.senders),
    tags: mergeById(personal.tags ?? [], shared.tags),
    movements: mergeById(personal.movements ?? [], shared.movements),
    scheduledPayments: mergeById(personal.scheduledPayments ?? [], shared.scheduledPayments),
    transfers: mergeById(personal.transfers ?? [], shared.transfers),
    reimbursements: mergeById(personal.reimbursements ?? [], shared.reimbursements),
  }, fallback)
  const redirectMap = new Map(shared.redirects.map((item) => [`${item.kind}:${item.oldId}`, item]))
  const finalReplacement = (redirect: typeof shared.redirects[number]) => {
    const seen = new Set([redirect.oldId])
    let replacementId = redirect.replacementId
    while (replacementId) {
      const next = redirectMap.get(`${redirect.kind}:${replacementId}`)
      if (!next || seen.has(replacementId)) break
      seen.add(replacementId)
      replacementId = next.replacementId
    }
    return replacementId
  }
  return shared.redirects.reduce(
    (current, redirect) => deleteCounterpartyData(current, redirect.kind, redirect.oldId, finalReplacement(redirect)),
    merged,
  )
}
