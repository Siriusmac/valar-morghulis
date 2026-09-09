import type { AppData } from '../types'

export type AccountDeletionMode = 'keep' | 'delete' | 'reassign'

const accountReferenceFields = [
  'accountId', 'welfareAccountId', 'fromAccountId', 'toAccountId',
  'lenderAccountId', 'borrowerAccountId',
] as const

type AccountReferencedRecord = Partial<Record<(typeof accountReferenceFields)[number], string>>

export function referencesAccount(record: AccountReferencedRecord, accountId: string) {
  return accountReferenceFields.some((field) => record[field] === accountId)
}

function replaceAccountReference<T extends AccountReferencedRecord>(record: T, accountId: string, replacementAccountId: string): T {
  const replacement = { ...record }
  for (const field of accountReferenceFields) {
    if (replacement[field] === accountId) replacement[field] = replacementAccountId
  }
  return replacement
}

export function accountLinkedOperationCount(data: AppData, accountId: string) {
  return [
    ...data.movements,
    ...data.scheduledPayments,
    ...data.transfers,
    ...data.reimbursements,
    ...data.loans,
    ...data.loanRepayments,
  ].filter((record) => referencesAccount(record, accountId)).length
}

export function accountHasReciprocalOperations(data: AppData, accountId: string) {
  return data.reimbursements.some((record) => referencesAccount(record, accountId))
    || data.loans.some((record) => referencesAccount(record, accountId))
    || data.loanRepayments.some((record) => referencesAccount(record, accountId))
    || data.movements.some((record) => referencesAccount(record, accountId) && Boolean(record.commissionedPurchaseId))
    || data.scheduledPayments.some((record) => referencesAccount(record, accountId) && Boolean(record.commissionedPurchaseId))
}

export function accountReplacementCreatesInvalidTransfer(data: AppData, accountId: string, replacementAccountId: string) {
  return data.transfers.some((transfer) =>
    (transfer.fromAccountId === accountId && transfer.toAccountId === replacementAccountId)
    || (transfer.toAccountId === accountId && transfer.fromAccountId === replacementAccountId))
}

export function deleteAccountData(
  current: AppData,
  accountId: string,
  mode: AccountDeletionMode,
  replacementAccountId?: string,
): AppData {
  if (mode === 'reassign' && !replacementAccountId) return current

  const updateRecords = <T extends AccountReferencedRecord>(records: T[]) => {
    if (mode === 'keep') return records
    if (mode === 'delete') return records.filter((record) => !referencesAccount(record, accountId))
    return records.map((record) => replaceAccountReference(record, accountId, replacementAccountId!))
  }
  const defaultMovementAccountIds = Object.fromEntries(Object.entries(current.defaultMovementAccountIds ?? {}).flatMap(([key, value]) => {
    if (value !== accountId) return [[key, value]]
    return mode === 'reassign' ? [[key, replacementAccountId!]] : []
  }))

  return {
    ...current,
    defaultMovementAccountIds,
    accounts: current.accounts.filter((account) => account.id !== accountId),
    movements: updateRecords(current.movements),
    scheduledPayments: updateRecords(current.scheduledPayments),
    transfers: updateRecords(current.transfers),
    reimbursements: updateRecords(current.reimbursements),
    loans: updateRecords(current.loans),
    loanRepayments: updateRecords(current.loanRepayments),
  }
}
